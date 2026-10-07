/**
 * Integration tests — notification outboxes on the job and quote canisters,
 * and the auth canister's contact lookup for the relay.
 *
 * Requires: dfx start --background && make deploy, plus the integration test
 * principal allowlisted as a notifier on auth, job and quote (ci.yml does this).
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove:
 *   - createQuoteRequest records a new_lead event (no recipient; the relay
 *     picks contractors)
 *   - submitQuote records quote_received for the homeowner
 *   - acceptQuote records bid_accepted for the winner and bid_declined for
 *     every other bidder
 *   - createJobProposal records job_awaiting_signature for the homeowner
 *   - the contractor's signature completing a job records job_verified
 *   - only an allowlisted notifier can read the outbox or look up an email
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import { idlFactory as jobIdl } from "../../declarations/job";
import { idlFactory as quoteIdl } from "../../declarations/quote";
import { quoteService } from "@/services/quote";
import { propertyService } from "@/services/property";
import { getAgent } from "@/services/actor";
import { TEST_PRINCIPAL } from "./setup";

const JOB_ID   = process.env.JOB_CANISTER_ID || "";
const QUOTE_ID = (process.env as any).QUOTE_CANISTER_ID || "";
const AUTH_ID  = (process.env as any).AUTH_CANISTER_ID || "";
const deployed = !!JOB_ID && !!QUOTE_ID;

const RUN_ID = Date.now();

const v2Fetch: typeof globalThis.fetch = (input, init) => {
  const url =
    typeof input === "string" ? input
    : input instanceof URL    ? input.toString()
    : (input as Request).url;
  return globalThis.fetch(url.replace(/\/api\/v[34]\//, "/api/v2/"), init);
};

async function makeAgent(seed: number): Promise<HttpAgent> {
  const buf = new Uint8Array(32);
  buf[0] = seed;
  return HttpAgent.create({
    identity:           Ed25519KeyIdentity.generate(buf),
    host:               "http://localhost:4943",
    shouldFetchRootKey: true,
    fetch:              v2Fetch,
  });
}

// The outbox methods aren't in the frontend declarations (the web app never
// calls them), so the test carries its own slice of the interface.
const outboxIdl = ({ IDL }: any) => {
  const Event = IDL.Record({
    seq:       IDL.Nat,
    kind:      IDL.Text,
    recipient: IDL.Opt(IDL.Principal),
    refId:     IDL.Text,
    summary:   IDL.Text,
    createdAt: IDL.Int,
  });
  const Page = IDL.Record({ events: IDL.Vec(Event), latestSeq: IDL.Nat });
  const Error = IDL.Variant({
    NotFound:        IDL.Null,
    NotAuthorized:   IDL.Null,
    InvalidInput:    IDL.Text,
    AlreadyVerified: IDL.Null,
    TierLimitReached: IDL.Text,
  });
  return IDL.Service({
    getNotificationEvents: IDL.Func(
      [IDL.Nat, IDL.Nat],
      [IDL.Variant({ ok: Page, err: Error })],
      ["query"],
    ),
  });
};

const contactIdl = ({ IDL }: any) => {
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    AlreadyExists: IDL.Null,
    NotAuthorized: IDL.Null,
    Paused:        IDL.Null,
    InvalidInput:  IDL.Text,
  });
  return IDL.Service({
    getNotificationContact: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Opt(IDL.Record({ email: IDL.Text })), err: Error })],
      ["query"],
    ),
  });
};

interface OutboxEvent {
  seq: bigint; kind: string; recipient: [] | [Principal];
  refId: string; summary: string; createdAt: bigint;
}

/** Every event currently in a canister's outbox, oldest first. */
async function readOutbox(canisterId: string, agent: HttpAgent): Promise<OutboxEvent[]> {
  const actor = Actor.createActor(outboxIdl, { agent, canisterId }) as any;
  const all: OutboxEvent[] = [];
  let after = 0n;
  for (;;) {
    const res = await actor.getNotificationEvents(after, 200n);
    if ("err" in res) throw new Error(`getNotificationEvents: ${Object.keys(res.err)[0]}`);
    all.push(...res.ok.events);
    if (res.ok.events.length < 200) return all;
    after = res.ok.events[res.ok.events.length - 1].seq;
  }
}

const recipientOf = (e: OutboxEvent) => (e.recipient[0] ? e.recipient[0].toText() : null);

let realPropId = "";
let ownerAgent: HttpAgent;

beforeAll(async () => {
  if (!deployed) return;
  ownerAgent = await getAgent();
  // Reuse a property the test identity already owns: earlier suites can take
  // it to its property cap, so registering another would fail.
  const owned = await propertyService.getMyProperties();
  if (owned.length > 0) {
    realPropId = owned[0].id;
    return;
  }
  const prop = await propertyService.registerProperty({
    address:      `${RUN_ID} Notify Test Ave, Austin TX 78701`,
    city:         "Austin",
    state:        "TX",
    zipCode:      "78701",
    propertyType: "SingleFamily" as const,
    yearBuilt:    2001,
    squareFeet:   1900,
    tier:         "Free" as const,
  });
  realPropId = prop.id;
});

describe.skipIf(!deployed)("quote outbox", () => {
  it("createRequest records a new_lead event with no recipient", async () => {
    const req = await quoteService.createRequest({
      propertyId:  realPropId,
      serviceType: "Plumbing",
      description: `Notification integration lead ${RUN_ID}`,
      urgency:     "medium",
    });
    const events = await readOutbox(QUOTE_ID, ownerAgent);
    const lead = events.find((e) => e.kind === "new_lead" && e.refId === req.id);
    expect(lead).toBeDefined();
    expect(lead!.recipient).toEqual([]);
    expect(lead!.summary).toBe("Plumbing");
    await quoteService.cancel(req.id);
  });

  it("acceptQuote records bid_accepted for the winner and bid_declined for the other bidder", async () => {
    const req = await quoteService.createRequest({
      propertyId:  realPropId,
      serviceType: "HVAC",
      description: `Notification integration bids ${RUN_ID}`,
      urgency:     "medium",
    });
    const validUntilNs = BigInt(Date.now() + 7 * 86_400_000) * 1_000_000n;
    const winnerAgent = await makeAgent(151);
    const loserAgent  = await makeAgent(152);
    const winner = Actor.createActor(quoteIdl, { agent: winnerAgent, canisterId: QUOTE_ID }) as any;
    const loser  = Actor.createActor(quoteIdl, { agent: loserAgent,  canisterId: QUOTE_ID }) as any;
    const won  = await winner.submitQuote(req.id, 250_000n, 5n, validUntilNs);
    const lost = await loser.submitQuote(req.id, 400_000n, 9n, validUntilNs);
    expect("ok" in won && "ok" in lost).toBe(true);

    await quoteService.accept(won.ok.id);

    const events = await readOutbox(QUOTE_ID, ownerAgent);
    const accepted = events.find((e) => e.kind === "bid_accepted" && e.refId === won.ok.id);
    const declined = events.find((e) => e.kind === "bid_declined" && e.refId === lost.ok.id);
    expect(accepted && recipientOf(accepted)).toBe((await winnerAgent.getPrincipal()).toText());
    expect(declined && recipientOf(declined)).toBe((await loserAgent.getPrincipal()).toText());
    expect(accepted!.summary).toBe("HVAC");

    const received = events.filter((e) => e.kind === "quote_received" && e.refId === req.id);
    expect(received).toHaveLength(2);
    expect(received.every((e) => recipientOf(e) === TEST_PRINCIPAL && e.summary === "HVAC")).toBe(true);
  });
});

describe.skipIf(!deployed)("job outbox", () => {
  it("createJobProposal records job_awaiting_signature for the homeowner", async () => {
    const contractorAgent = await makeAgent(153);
    const job = Actor.createActor(jobIdl, { agent: contractorAgent, canisterId: JOB_ID }) as any;
    const title = `Proposal ${RUN_ID}`;
    const res = await job.createJobProposal(
      realPropId, title, { HVAC: null }, "Replaced the blower motor",
      ["Notify Test HVAC"], 45_000n, BigInt(Date.now()) * 1_000_000n, [], [],
    );
    expect("ok" in res).toBe(true);

    const events = await readOutbox(JOB_ID, ownerAgent);
    const pending = events.find((e) => e.kind === "job_awaiting_signature" && e.refId === res.ok.id);
    expect(pending).toBeDefined();
    expect(recipientOf(pending!)).toBe(TEST_PRINCIPAL);
    expect(pending!.summary).toBe(title);
  });
});

describe.skipIf(!deployed)("job outbox — contractor signature", () => {
  it("homeowner signing a job with a linked contractor records job_awaiting_contractor_signature", async () => {
    const contractorAgent = await makeAgent(155);
    const contractor = (await contractorAgent.getPrincipal()).toText();
    const job = Actor.createActor(jobIdl, { agent: ownerAgent, canisterId: JOB_ID }) as any;
    const title = `Contractor sign ${RUN_ID}`;

    const created = await job.createJob(
      realPropId, title, { Plumbing: null }, "Replaced the shutoff valve",
      ["Notify Test Plumbing"], 18_000n, BigInt(Date.now()) * 1_000_000n, [], [], false, [],
    );
    expect("ok" in created).toBe(true);
    const jobId = created.ok.id;

    expect("ok" in (await job.linkContractor(jobId, Principal.fromText(contractor)))).toBe(true);
    const signed = await job.verifyJob(jobId);
    expect("ok" in signed && signed.ok.homeownerSigned && !signed.ok.verified).toBe(true);

    const events = await readOutbox(JOB_ID, ownerAgent);
    const pending = events.filter((e) => e.kind === "job_awaiting_contractor_signature" && e.refId === jobId);
    expect(pending).toHaveLength(1);
    expect(recipientOf(pending[0])).toBe(contractor);
    expect(pending[0].summary).toBe(title);

    // The contractor's signature completes the job → the homeowner hears it's verified.
    const asContractor = Actor.createActor(jobIdl, { agent: contractorAgent, canisterId: JOB_ID }) as any;
    const done = await asContractor.verifyJob(jobId);
    expect("ok" in done && done.ok.verified).toBe(true);
    const verified = (await readOutbox(JOB_ID, ownerAgent)).filter((e) => e.kind === "job_verified" && e.refId === jobId);
    expect(verified).toHaveLength(1);
    expect(recipientOf(verified[0])).toBe(TEST_PRINCIPAL);
  });
});

describe.skipIf(!deployed || !AUTH_ID)("auth contact lookup", () => {
  it("gives an allowlisted notifier a user's email, and null for an unknown principal", async () => {
    const auth = Actor.createActor(contactIdl, { agent: ownerAgent, canisterId: AUTH_ID }) as any;
    const mine = await auth.getNotificationContact(Principal.fromText(TEST_PRINCIPAL));
    expect("ok" in mine).toBe(true);
    if (mine.ok.length > 0) expect(mine.ok[0].email).toMatch(/@/);

    const nobody = await (await makeAgent(156)).getPrincipal();
    expect(await auth.getNotificationContact(nobody)).toEqual({ ok: [] });
  });

  it("rejects a caller that is not an allowlisted notifier", async () => {
    const stranger = await makeAgent(154);
    const auth = Actor.createActor(contactIdl, { agent: stranger, canisterId: AUTH_ID }) as any;
    expect(await auth.getNotificationContact(Principal.fromText(TEST_PRINCIPAL))).toEqual({ err: { NotAuthorized: null } });
  });
});

describe.skipIf(!deployed)("outbox access", () => {
  it("rejects a caller that is not an allowlisted notifier", async () => {
    const stranger = await makeAgent(154);
    for (const canisterId of [JOB_ID, QUOTE_ID]) {
      const actor = Actor.createActor(outboxIdl, { agent: stranger, canisterId }) as any;
      const res = await actor.getNotificationEvents(0n, 10n);
      expect(res).toEqual({ err: { NotAuthorized: null } });
    }
  });
});
