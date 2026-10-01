/**
 * ICP client for the notification relay.
 *
 * The relay reads the job and quote canisters' push outboxes with its own
 * Ed25519 identity (RELAY_IDENTITY_SEED, 32-byte hex). An admin allowlists
 * that identity's principal on each canister with addNotifier() — the
 * principal is logged at startup. It also resolves agent session tokens
 * through the auth canister (anonymous query) to authenticate registrations,
 * and reads quote requests and contractor profiles to match new leads.
 *
 * Canister IDs are read at call time so tests and late-loaded .env files work.
 */
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import type { OutboxEvent, OutboxPage, QuoteRequestInfo, ContractorInfo } from "./types";

const IC_HOST = () => process.env.IC_HOST ?? "https://icp-api.io";
const isLocalHost = (host: string) => /localhost|127\.0\.0\.1/.test(host);

// ── IDL slices ────────────────────────────────────────────────────────────────

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
  // Only the tag matters to the relay; the record lists every tag job and
  // quote can return so decoding never fails.
  const Error = IDL.Variant({
    NotFound:         IDL.Null,
    NotAuthorized:    IDL.Null,
    InvalidInput:     IDL.Text,
    AlreadyVerified:  IDL.Null,
    TierLimitReached: IDL.Text,
  });
  return IDL.Service({
    getNotificationEvents: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Variant({ ok: Page, err: Error })], ["query"]),
  });
};

const ServiceTypeTags = [
  "Roofing", "HVAC", "Plumbing", "Electrical", "Painting", "Flooring", "Windows",
  "Landscaping", "Gutters", "GeneralHandyman", "Pest", "Concrete", "Fencing",
  "Insulation", "Solar", "Pool", "Foundation", "Drywall", "KitchenRemodel",
  "BathroomRemodel", "Other",
];
const serviceTypeIdl = (IDL: any) =>
  IDL.Variant(Object.fromEntries(ServiceTypeTags.map((t) => [t, IDL.Null])));

const quoteIdl = ({ IDL }: any) => {
  const QuoteRequest = IDL.Record({
    id:               IDL.Text,
    propertyId:       IDL.Text,
    homeowner:        IDL.Principal,
    serviceType:      serviceTypeIdl(IDL),
    description:      IDL.Text,
    urgency:          IDL.Variant({ Low: IDL.Null, Medium: IDL.Null, High: IDL.Null, Emergency: IDL.Null }),
    status:           IDL.Variant({ Open: IDL.Null, Quoted: IDL.Null, Accepted: IDL.Null, Closed: IDL.Null, Cancelled: IDL.Null }),
    createdAt:        IDL.Int,
    closeAt:          IDL.Opt(IDL.Int),
    zipCode:          IDL.Opt(IDL.Text),
    minTrustScore:    IDL.Opt(IDL.Nat),
    minJobsCompleted: IDL.Opt(IDL.Nat),
    minReviews:       IDL.Opt(IDL.Nat),
    maxBids:          IDL.Opt(IDL.Nat),
  });
  const Error = IDL.Variant({ NotFound: IDL.Null, NotAuthorized: IDL.Null, InvalidInput: IDL.Text });
  return IDL.Service({
    getQuoteRequest: IDL.Func([IDL.Text], [IDL.Variant({ ok: QuoteRequest, err: Error })], ["query"]),
  });
};

const contractorIdl = ({ IDL }: any) => {
  const ContractorProfile = IDL.Record({
    id:            IDL.Principal,
    name:          IDL.Text,
    specialties:   IDL.Vec(serviceTypeIdl(IDL)),
    email:         IDL.Text,
    phone:         IDL.Text,
    bio:           IDL.Opt(IDL.Text),
    licenseNumber: IDL.Opt(IDL.Text),
    serviceArea:   IDL.Opt(IDL.Text),
    serviceZips:   IDL.Vec(IDL.Text),
    trustScore:    IDL.Nat,
    jobsCompleted: IDL.Nat,
    isVerified:    IDL.Bool,
    createdAt:     IDL.Int,
    notifyEmail:   IDL.Opt(IDL.Text),
    notifyPush:    IDL.Opt(IDL.Bool),
    alertZips:     IDL.Vec(IDL.Text),
    origin:        IDL.Variant({ SelfRegistered: IDL.Null, GuestSigned: IDL.Text }),
  });
  return IDL.Service({
    getAll: IDL.Func([], [IDL.Vec(ContractorProfile)], ["query"]),
  });
};

const authIdl = ({ IDL }: any) =>
  IDL.Service({
    resolveAgentSession: IDL.Func([IDL.Text], [IDL.Opt(IDL.Principal)], ["query"]),
  });

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
  const actor = Actor.createActor(quoteIdl, {
    agent: await getAnonAgent(), canisterId: requireId("CANISTER_ID_QUOTE"),
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
  const all: any[] = await actor.getAll();
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

/** The principal an agent session token belongs to, or null if it's unknown or expired. */
export async function resolveAgentSession(token: string): Promise<string | null> {
  const actor = Actor.createActor(authIdl, {
    agent: await getAnonAgent(), canisterId: requireId("CANISTER_ID_AUTH"),
  }) as any;
  const res: [] | [Principal] = await actor.resolveAgentSession(token);
  return res[0] ? res[0].toText() : null;
}
