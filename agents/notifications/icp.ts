/**
 * ICP client for the notification relay.
 *
 * The relay reads the job and quote canisters' push outboxes with its own
 * Ed25519 identity (RELAY_IDENTITY_SEED, 32-byte hex). An admin allowlists
 * that identity's principal on each canister with addNotifier() — the
 * principal is logged at startup. It also resolves agent session tokens
 * through the auth canister (anonymous query) to authenticate registrations,
 * and reads quote requests, contractor profiles and (from payment) contractor
 * tiers to match new leads and time their alerts. For
 * the weekly Home Pulse email it reads homeowners (auth), their properties
 * (property) and jobs (job), so it needs addNotifier on those three too.
 *
 * Canister IDs are read at call time so tests and late-loaded .env files work.
 */
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import type { OutboxEvent, OutboxPage, QuoteRequestInfo, ContractorInfo, PulseJob, PulseProperty, PulseRecipient } from "./types";
import type { ScoreJob } from "../../packages/shared/src/score";
import { idlFactory as quoteIdl } from "../../packages/shared/src/declarations/quote";
import { idlFactory as contractorIdl } from "../../packages/shared/src/declarations/contractor";
import { idlFactory as authIdl } from "../../packages/shared/src/declarations/auth";
import { idlFactory as propertyIdl } from "../../packages/shared/src/declarations/property";
import { idlFactory as jobIdl } from "../../packages/shared/src/declarations/job";
import { idlFactory as paymentIdl } from "../../packages/shared/src/declarations/payment";
import { idlFactory as reportIdl } from "../../packages/shared/src/declarations/report";
import { idlFactory as monitoringIdl } from "../../packages/shared/src/declarations/monitoring";
import { serviceTypeFromVariant } from "../../packages/shared/src/serviceTypes";

const IC_HOST = () => process.env.IC_HOST ?? "https://icp-api.io";
const isLocalHost = (host: string) => /localhost|127\.0\.0\.1/.test(host);

// ── Outbox IDL (every canister with a notification outbox exposes it) ────────────────────────────────────────────────────────────────────────

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
  // Only the tag matters to the relay; the record lists every tag job, quote
  // and listing can return so decoding never fails.
  const Error = IDL.Variant({
    NotFound:         IDL.Null,
    NotAuthorized:    IDL.Null,
    InvalidInput:     IDL.Text,
    AlreadyVerified:  IDL.Null,
    TierLimitReached: IDL.Text,
    AlreadyCancelled: IDL.Null,
    DeadlinePassed:   IDL.Null,
    SlotsFull:        IDL.Null,
  });
  return IDL.Service({
    getNotificationEvents: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Variant({ ok: Page, err: Error })], ["query"]),
  });
};

// ── Agents ────────────────────────────────────────────────────────────────────

let relayAgent: Promise<HttpAgent> | null = null;
let anonAgent:  Promise<HttpAgent> | null = null;

async function makeAgent(identity?: Ed25519KeyIdentity): Promise<HttpAgent> {
  const host = IC_HOST();
  return HttpAgent.create({ host, identity, shouldFetchRootKey: isLocalHost(host) });
}

/** The relay's own identity. Throws when RELAY_IDENTITY_SEED is missing or malformed. */
export function relayIdentity(): Ed25519KeyIdentity {
  const seed = process.env.RELAY_IDENTITY_SEED ?? "";
  if (!/^[0-9a-fA-F]{64}$/.test(seed)) {
    throw new Error("RELAY_IDENTITY_SEED must be a 32-byte hex string");
  }
  return Ed25519KeyIdentity.generate(Uint8Array.from(Buffer.from(seed, "hex")));
}

function getRelayAgent(): Promise<HttpAgent> {
  relayAgent ??= makeAgent(relayIdentity());
  return relayAgent;
}

function getAnonAgent(): Promise<HttpAgent> {
  anonAgent ??= makeAgent();
  return anonAgent;
}

function requireId(name: string): string {
  const id = process.env[name];
  if (!id) throw new Error(`${name} is not set`);
  return id;
}

// ── Calls ─────────────────────────────────────────────────────────────────────

/** One page of a canister's outbox after `afterSeq`. */
export async function readOutbox(canisterId: string, afterSeq: number): Promise<OutboxPage> {
  const actor = Actor.createActor(outboxIdl, { agent: await getRelayAgent(), canisterId }) as any;
  const res = await actor.getNotificationEvents(BigInt(afterSeq), 200n);
  if ("err" in res) {
    throw new Error(`getNotificationEvents on ${canisterId}: ${Object.keys(res.err)[0]}`);
  }
  return {
    latestSeq: Number(res.ok.latestSeq),
    events: res.ok.events.map((e: any): OutboxEvent => ({
      seq:       Number(e.seq),
      kind:      e.kind,
      recipient: e.recipient[0] ? (e.recipient[0] as Principal).toText() : null,
      refId:     e.refId,
      summary:   e.summary,
    })),
  };
}

export async function getQuoteRequest(requestId: string): Promise<QuoteRequestInfo | null> {
  // Signed as the relay (a notifier on quote): anonymous callers get the
  // homeowner redacted, and contractorWantsLead needs it to skip the
  // homeowner's own request.
  const actor = Actor.createActor(quoteIdl, {
    agent: await getRelayAgent(), canisterId: requireId("CANISTER_ID_QUOTE"),
  }) as any;
  const res = await actor.getQuoteRequest(requestId);
  if ("err" in res) return null;
  const r = res.ok;
  return {
    id:               r.id,
    homeowner:        (r.homeowner as Principal).toText(),
    serviceType:      Object.keys(r.serviceType)[0],
    status:           Object.keys(r.status)[0],
    zipCode:          r.zipCode[0] ?? null,
    minTrustScore:    r.minTrustScore[0]    !== undefined ? Number(r.minTrustScore[0])    : null,
    minJobsCompleted: r.minJobsCompleted[0] !== undefined ? Number(r.minJobsCompleted[0]) : null,
  };
}

export async function getContractors(): Promise<ContractorInfo[]> {
  const actor = Actor.createActor(contractorIdl, {
    agent: await getAnonAgent(), canisterId: requireId("CANISTER_ID_CONTRACTOR"),
  }) as any;
  // Not getAll(): that leaves out contractors who hid their profile from the
  // directory, and they still get the lead alerts they asked for.
  const all: any[] = await actor.getLeadAlertTargets();
  return all.map((c) => ({
    principal:     (c.id as Principal).toText(),
    specialties:   c.specialties.map((s: object) => Object.keys(s)[0]),
    serviceZips:   c.serviceZips,
    alertZips:     c.alertZips,
    notifyPush:    c.notifyPush[0] === true,
    trustScore:    Number(c.trustScore),
    jobsCompleted: Number(c.jobsCompleted),
    isVerified:    c.isVerified,
  }));
}

/**
 * Whether `principal` has ContractorPro, read live from the payment canister
 * (the single source of truth for tiers). Throws when payment can't be read;
 * the caller treats that as not Pro.
 */
export async function isContractorPro(principal: string): Promise<boolean> {
  const actor = Actor.createActor(paymentIdl, {
    agent: await getAnonAgent(), canisterId: requireId("CANISTER_ID_PAYMENT"),
  }) as any;
  const tier = await actor.getTierForPrincipal(Principal.fromText(principal));
  return "ContractorPro" in tier;
}

/** The principal an agent session token belongs to, or null if it's unknown or expired. */
export async function resolveAgentSession(token: string): Promise<string | null> {
  const actor = Actor.createActor(authIdl, {
    agent: await getAnonAgent(), canisterId: requireId("CANISTER_ID_AUTH"),
  }) as any;
  const res: [] | [Principal] = await actor.resolveAgentSession(token);
  return res[0] ? res[0].toText() : null;
}

/**
 * Where to email `principal`: a contractor's alert-email override
 * (notifyEmail) when they set one, else the email they registered with. Null
 * when there's no address. Needs the relay allowlisted on auth and contractor (addNotifier).
 */
export async function getNotificationEmail(principal: string): Promise<string | null> {
  const p = Principal.fromText(principal);
  // Contractor emails are hidden from anonymous reads; the relay is on
  // contractor's notifier list (addNotifier).
  const contractor = Actor.createActor(contractorIdl, {
    agent: await getRelayAgent(), canisterId: requireId("CANISTER_ID_CONTRACTOR"),
  }) as any;
  const profile = await contractor.getContractor(p);
  if ("ok" in profile && profile.ok.notifyEmail[0]) return profile.ok.notifyEmail[0] as string;

  const auth = Actor.createActor(authIdl, {
    agent: await getRelayAgent(), canisterId: requireId("CANISTER_ID_AUTH"),
  }) as any;
  const res = await auth.getNotificationContact(p);
  if ("err" in res) throw new Error(`getNotificationContact: ${Object.keys(res.err)[0]}`);
  return res.ok[0]?.email ?? null;
}


// ── Weekly Home Pulse ─────────────────────────────────────────────────────────

/** One page of homeowners with an email address (needs addNotifier on auth). */
export async function getPulseRecipients(after: string | null, limit: number): Promise<PulseRecipient[]> {
  const auth = Actor.createActor(authIdl, {
    agent: await getRelayAgent(), canisterId: requireId("CANISTER_ID_AUTH"),
  }) as any;
  const res = await auth.getPulseRecipients(after ? [Principal.fromText(after)] : [], BigInt(limit));
  if ("err" in res) throw new Error(`getPulseRecipients: ${Object.keys(res.err)[0]}`);
  return res.ok.map((r: any) => ({ principal: (r.principal as Principal).toText(), email: r.email as string }));
}

/** `owner`'s active properties, minimal fields (needs addNotifier on property). */
export async function getPulseProperties(owner: string): Promise<PulseProperty[]> {
  const property = Actor.createActor(propertyIdl, {
    agent: await getRelayAgent(), canisterId: requireId("CANISTER_ID_PROPERTY"),
  }) as any;
  const res = await property.getPulseProperties(Principal.fromText(owner));
  if ("err" in res) throw new Error(`getPulseProperties: ${Object.keys(res.err)[0]}`);
  return res.ok.map((p: any) => ({
    id: p.id, address: p.address, city: p.city, state: p.state, zipCode: p.zipCode, yearBuilt: Number(p.yearBuilt),
  }));
}

/** All of `owner`'s jobs (needs addNotifier on job). */
export async function getJobsByOwner(owner: string): Promise<PulseJob[]> {
  const job = Actor.createActor(jobIdl, {
    agent: await getRelayAgent(), canisterId: requireId("CANISTER_ID_JOB"),
  }) as any;
  const jobs: any[] = await job.getJobsByOwner(Principal.fromText(owner));
  return jobs.map((j) => ({
    id:               j.id,
    propertyId:       j.propertyId,
    title:            j.title,
    serviceType:      serviceTypeFromVariant(j.serviceType),
    contractorName:   j.contractorName[0] ?? null,
    amountCents:      Number(j.amount),
    completedAtMs:    Number(BigInt(j.completedDate) / 1_000_000n),
    warrantyMonths:   j.warrantyMonths[0] !== undefined ? Number(j.warrantyMonths[0]) : null,
    isDiy:            j.isDiy,
    status:           Object.keys(j.status)[0],
    verified:         j.verified,
    homeownerSigned:  j.homeownerSigned,
    contractorSigned: j.contractorSigned,
  }));
}

/**
 * The job canister's score inputs for one property — the same snapshots the
 * market canister scores certificates from, so the email shows that number.
 */
export async function getJobSnapshots(propertyId: string): Promise<ScoreJob[]> {
  const job = Actor.createActor(jobIdl, {
    agent: await getAnonAgent(), canisterId: requireId("CANISTER_ID_JOB"),
  }) as any;
  const snaps: any[] = await job.getJobSnapshotsForProperty(propertyId);
  return snaps.map((s) => ({
    serviceType:   s.serviceType,
    completedYear: Number(s.completedYear),
    amountCents:   Number(s.amountCents),
    isDiy:         s.isDiy,
    isVerified:    s.isVerified,
  }));
}

/**
 * The newest public report whose street address matches (report canister,
 * anonymous query). Used by the buyer report alerts (reportAlerts.ts).
 */
export async function findPublicReport(address: string): Promise<{ token: string; address: string; city: string; state: string; zipCode: string } | null> {
  const report = Actor.createActor(reportIdl, {
    agent: await getAnonAgent(), canisterId: requireId("CANISTER_ID_REPORT"),
  }) as any;
  const res: any[] = await report.findPublicReport(address);
  return res.length > 0 ? res[0] : null;
}

/**
 * Report a relay failure to the monitoring canister (needs addReporter on
 * monitoring for the relay identity; scripts/deploy.sh grants it). No-op
 * without CANISTER_ID_MONITORING.
 */
export async function recordServiceError(input: {
  fingerprint: string; message: string; errorType: string; count: number; firstSeenMs: number; lastSeenMs: number;
}): Promise<void> {
  const canisterId = process.env.CANISTER_ID_MONITORING;
  if (!canisterId) return;
  const monitoring = Actor.createActor(monitoringIdl, { agent: await getRelayAgent(), canisterId }) as any;
  await monitoring.recordServiceError({
    fingerprint: input.fingerprint,
    message:     input.message,
    errorType:   input.errorType,
    count:       BigInt(input.count),
    firstSeen:   BigInt(input.firstSeenMs) * 1_000_000n,
    lastSeen:    BigInt(input.lastSeenMs) * 1_000_000n,
    tierCounts:  [],
    release:     [],
  });
}
