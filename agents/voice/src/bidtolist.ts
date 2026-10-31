/**
 * BidtoList route handlers for Cloudflare Workers.
 * Ported from bidtolistRouter.ts (Express Router) to a plain async function
 * that accepts a Workers Request and returns a Response.
 *
 * Mounted at /api/bidtolist/* in index.ts.
 */

import { Resend } from "resend";
import Stripe from "stripe";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { IDL } from "@icp-sdk/core/candid";
import { Principal } from "@icp-sdk/core/principal";
import {
  HttpError, readJsonBody, readBodyBytes, escapeHtml, subjectText,
  PRINCIPAL_RE, EMAIL_RE, MAX_WEBHOOK_BYTES,
} from "./security";
import { hitCounter, beginOnce, finishOnce, abortOnce } from "./rateLimiter";
import type { CounterNamespace } from "./rateLimiterDO";

export interface BidtolistEnv {
  BIDTOLIST_RESEND_API_KEY?: string;
  BIDTOLIST_RESEND_FROM?: string;
  BIDTOLIST_FRONTEND_ORIGIN?: string;
  BIDTOLIST_STRIPE_SECRET_KEY?: string;
  BIDTOLIST_STRIPE_WEBHOOK_SECRET?: string;
  BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE?: string;
  BIDTOLIST_LISTING_CANISTER_ID?: string;
  BIDTOLIST_AGENT_CANISTER_ID?: string;
  BIDTOLIST_FEE_CANISTER_ID?: string;
  BIDTOLIST_IDENTITY_SEED?: string;
  BIDTOLIST_ICP_HOST?: string;
  HOMEGENTIC_CANISTER_ID?: string;
  HOMEGENTIC_ICP_HOST?: string;
  /** Fallback store for email dedupe / per-IP limits when RATE_LIMITER is unbound. */
  RATE_LIMIT?: KVNamespace;
  /** RateLimiterDO namespace: atomic email dedupe and per-IP limits. */
  RATE_LIMITER?: DurableObjectNamespace | CounterNamespace;
}

// ── IDL factories ─────────────────────────────────────────────────────────────

const listingIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null,
    InvalidInput: I.Text, AlreadyCancelled: I.Null, DeadlinePassed: I.Null,
  });
  const BidRequestStatus = I.Variant({ Open: I.Null, Awarded: I.Null, Cancelled: I.Null, Expired: I.Null });
  const ListingBidRequest = I.Record({
    id: I.Text, address: I.Text, city: I.Text, county: I.Text, zipCode: I.Text,
    homeowner: I.Principal, homeownerEmail: I.Text, targetListDate: I.Int,
    desiredSalePrice: I.Opt(I.Nat), notes: I.Text, bidDeadline: I.Int,
    status: BidRequestStatus, createdAt: I.Int, feePaid: I.Bool,
  });
  const BidRequestSummary = I.Record({
    id: I.Text, city: I.Text, county: I.Text, zipCode: I.Text,
    targetListDate: I.Int, desiredSalePrice: I.Opt(I.Nat),
    beds: I.Opt(I.Nat), baths: I.Opt(I.Nat), sqft: I.Opt(I.Nat),
    notes: I.Text, bidDeadline: I.Int, status: BidRequestStatus,
    createdAt: I.Int, proposalCount: I.Nat,
  });
  const ProposalStatus = I.Variant({
    Pending: I.Null, Accepted: I.Null, Rejected: I.Null, Withdrawn: I.Null, Standby: I.Null,
  });
  const ListingProposal = I.Record({
    id: I.Text, requestId: I.Text, agentId: I.Principal, agentName: I.Text, agentEmail: I.Text,
    agentBrokerage: I.Text, commissionBps: I.Nat, cmaSummary: I.Text, marketingPlan: I.Text,
    estimatedDaysOnMarket: I.Nat, estimatedSalePrice: I.Nat, includedServices: I.Vec(I.Text),
    validUntil: I.Int, coverLetter: I.Text, status: ProposalStatus, createdAt: I.Int,
  });
  return I.Service({
    getBidRequest:           I.Func([I.Text], [I.Variant({ ok: ListingBidRequest, err: Error })], ["query"]),
    getProposalsForRequest:  I.Func([I.Text], [I.Vec(ListingProposal)], ["query"]),
    getListingsNearDeadline: I.Func([I.Int], [I.Vec(BidRequestSummary)], ["query"]),
    tickCascade:             I.Func([], [], []),
  });
};

const agentIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const AgentProfile = I.Record({
    id: I.Principal, name: I.Text, brokerage: I.Text, licenseNumber: I.Text,
    licenseState: I.Text, statesLicensed: I.Vec(I.Text), county: I.Text,
    serviceCities: I.Vec(I.Text), bio: I.Text, phone: I.Text, email: I.Text,
    avgDaysOnMarket: I.Nat, listingsLast12Months: I.Nat, isVerified: I.Bool,
    createdAt: I.Int, updatedAt: I.Int,
  });
  return I.Service({
    getAgentsForCity: I.Func([I.Text, I.Nat], [I.Vec(AgentProfile)], ["query"]),
    getProfile:       I.Func([I.Principal],  [I.Opt(AgentProfile)], ["query"]),
  });
};

const feeIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const FeeStatus = I.Variant({ Owed: I.Null, Invoiced: I.Null, Paid: I.Null, Waived: I.Null });
  const FeeRecord = I.Record({
    id: I.Text, requestId: I.Text, proposalId: I.Text,
    agentId: I.Principal, homeownerId: I.Principal, amountCents: I.Nat,
    status: FeeStatus, createdAt: I.Int, updatedAt: I.Int,
  });
  const Error = I.Variant({ NotFound: I.Null, NotAuthorized: I.Null, InvalidInput: I.Text });
  return I.Service({
    getAllFees:  I.Func([], [I.Variant({ ok: I.Vec(FeeRecord), err: Error })], ["query"]),
    markFeePaid: I.Func([I.Text], [I.Variant({ ok: FeeRecord, err: Error })], []),
  });
};

const homegenticIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, InvalidInput: I.Text,
    RateLimited: I.Null, PaymentFailed: I.Text,
  });
  return I.Service({
    createDiscountCode: I.Func([I.Text, I.Nat, I.Int], [I.Variant({ ok: I.Null, err: Error })], []),
  });
};

// ── ICP actor factories ───────────────────────────────────────────────────────

function makeIdentity(seed: string): Ed25519KeyIdentity {
  // @icp-sdk/core 5 wants a Uint8Array (an ArrayBuffer throws "private key
  // must be hex string or Uint8Array", which silently disabled every canister call).
  return Ed25519KeyIdentity.fromSecretKey(new Uint8Array(Buffer.from(seed, "hex")));
}

async function createListingActor(env: BidtolistEnv) {
  if (!env.BIDTOLIST_LISTING_CANISTER_ID || !env.BIDTOLIST_IDENTITY_SEED) return null;
  const host  = env.BIDTOLIST_ICP_HOST ?? "https://ic0.app";
  const agent = await HttpAgent.create({ identity: makeIdentity(env.BIDTOLIST_IDENTITY_SEED), host });
  if (host.includes("localhost")) await agent.fetchRootKey().catch(() => {});
  return Actor.createActor(listingIdlFactory, { agent, canisterId: env.BIDTOLIST_LISTING_CANISTER_ID });
}

async function createAgentActor(env: BidtolistEnv) {
  if (!env.BIDTOLIST_AGENT_CANISTER_ID || !env.BIDTOLIST_IDENTITY_SEED) return null;
  const host  = env.BIDTOLIST_ICP_HOST ?? "https://ic0.app";
  const agent = await HttpAgent.create({ identity: makeIdentity(env.BIDTOLIST_IDENTITY_SEED), host });
  if (host.includes("localhost")) await agent.fetchRootKey().catch(() => {});
  return Actor.createActor(agentIdlFactory, { agent, canisterId: env.BIDTOLIST_AGENT_CANISTER_ID });
}

function createFeeActor(env: BidtolistEnv) {
  if (!env.BIDTOLIST_FEE_CANISTER_ID || !env.BIDTOLIST_IDENTITY_SEED) return null;
  const host     = env.BIDTOLIST_ICP_HOST ?? "https://ic0.app";
  const identity = makeIdentity(env.BIDTOLIST_IDENTITY_SEED);
  const agent    = new HttpAgent({ identity, host });
  if (host.includes("localhost")) agent.fetchRootKey().catch(() => {});
  return Actor.createActor(feeIdlFactory, { agent, canisterId: env.BIDTOLIST_FEE_CANISTER_ID });
}

function createHomegenticActor(env: BidtolistEnv) {
  if (!env.HOMEGENTIC_CANISTER_ID || !env.BIDTOLIST_IDENTITY_SEED) return null;
  const host     = env.HOMEGENTIC_ICP_HOST ?? "https://ic0.app";
  const identity = makeIdentity(env.BIDTOLIST_IDENTITY_SEED);
  const agent    = new HttpAgent({ identity, host });
  if (host.includes("localhost")) agent.fetchRootKey().catch(() => {});
  return Actor.createActor(homegenticIdlFactory, { agent, canisterId: env.HOMEGENTIC_CANISTER_ID });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

interface ListingInfo {
  homeownerEmail: string;
  city:           string;
  deadlineDate:   string;
  bidDeadlineMs:  number;
  homeowner:      string;
  status:         string;
}

/**
 * Read a Bid to List request with the Worker's identity (an admin of the
 * listing canister, so homeownerEmail is not redacted). null when the listing
 * canister isn't wired; HttpError(404) when the request doesn't exist.
 */
async function fetchListing(requestId: string, env: BidtolistEnv): Promise<ListingInfo | null> {
  const actor = await createListingActor(env);
  if (!actor) return null;
  const result = await (actor as any).getBidRequest(requestId) as any;
  if ("err" in result) {
    if ("NotFound" in (result.err ?? {})) throw new HttpError(404, "Listing not found");
    throw new Error(`getBidRequest error: ${Object.keys(result.err ?? {})[0] ?? "unknown"}`);
  }
  const { homeownerEmail, city, bidDeadline, homeowner, status } = result.ok;
  const bidDeadlineMs = Number(bidDeadline) / 1_000_000;
  const deadlineDate = new Date(bidDeadlineMs).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  return {
    homeownerEmail: String(homeownerEmail ?? ""),
    city: String(city ?? ""),
    deadlineDate,
    bidDeadlineMs,
    homeowner: (homeowner as Principal)?.toText?.() ?? String(homeowner),
    status: variantName(status),
  };
}

interface ProposalInfo { id: string; agentId: string; status: string }

/** All proposals on a request (the Worker identity is an admin, so none are hidden). */
async function fetchProposals(requestId: string, env: BidtolistEnv): Promise<ProposalInfo[] | null> {
  const actor = await createListingActor(env);
  if (!actor) return null;
  const list = await (actor as any).getProposalsForRequest(requestId) as any[];
  return (list ?? [])
    .filter((p: any) => p && p.requestId === requestId)
    .map((p: any) => ({
      id: String(p.id),
      agentId: (p.agentId as Principal)?.toText?.() ?? String(p.agentId),
      status: variantName(p.status),
    }));
}

function variantName(v: unknown): string {
  return Object.keys((v as object) ?? {})[0] ?? "";
}

/**
 * Resolve an agent's profile server-side by principal (X-2). Recipient
 * addresses never come from the request body.
 */
async function fetchAgentProfile(agentPrincipal: string, env: BidtolistEnv): Promise<{ email: string; name: string; isVerified: boolean } | null> {
  const actor = await createAgentActor(env);
  if (!actor) return null;
  const profile = await (actor as any).getProfile(Principal.fromText(agentPrincipal)) as any[];
  if (!profile || profile.length === 0) return null;
  return { email: String(profile[0].email ?? ""), name: String(profile[0].name ?? ""), isVerified: !!profile[0].isVerified };
}

/**
 * F-11 / M-01: 6 chars from a 32-symbol alphabet using the CSPRNG
 * (masking with 31 is unbiased because 32 is a power of two).
 */
function generateDiscountCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return "BIDTOLIST-" + Array.from(bytes).map((b) => chars[b & 31]).join("");
}

const REQUEST_ID_RE  = /^[A-Za-z0-9_-]{1,64}$/;
const DAY            = 86_400;
/** Dedupe window for one-shot lifecycle emails ("at most once" in practice). */
const ONCE_TTL       = 365 * DAY;

/**
 * Resend's SDK reports API failures (bad key, 4xx/5xx, rate limit) in the
 * resolved `{ error }` rather than by throwing; turn them into throws so
 * callers' retry and dedupe-release paths run.
 */
async function sendOrThrow(
  resend: Resend,
  msg: { from: string; to: string; subject: string; html: string },
  idempotencyKey?: string,
): Promise<void> {
  const res = await resend.emails.send(msg, idempotencyKey ? { idempotencyKey } : undefined);
  if (res?.error) throw new Error(res.error.message ?? "Resend error");
}
/** Per-IP budget for the Bid to List email + checkout routes. */
const IP_HOURLY_LIMIT = 30;

async function createHomegenticCode(code: string, env: BidtolistEnv): Promise<void> {
  const actor = createHomegenticActor(env);
  if (!actor) { console.warn("[bidtolist] HomeGentic ICP not configured — skipping discount code"); return; }
  const ninetyDaysNs = BigInt(90) * BigInt(24 * 60 * 60 * 1_000_000_000);
  const expiresAt    = BigInt(Date.now()) * BigInt(1_000_000) + ninetyDaysNs;
  const result       = await (actor as any).createDiscountCode(code, 50, expiresAt) as any;
  if (result.err) console.warn("[bidtolist] createDiscountCode error:", JSON.stringify(result.err));
}

async function sendHomeownerCodeEmail(requestId: string, code: string, env: BidtolistEnv): Promise<void> {
  const actor = await createListingActor(env);
  if (!actor) { console.warn("[bidtolist] ICP not wired — skipping homeowner-code email"); return; }
  const result = await (actor as any).getBidRequest(requestId) as any;
  if ("err" in result) throw new Error(`getBidRequest error: ${JSON.stringify(result.err)}`);
  const { homeownerEmail, city } = result.ok;
  if (!homeownerEmail) throw new Error("homeownerEmail empty on record");
  const from        = env.BIDTOLIST_RESEND_FROM ?? "noreply@bidtolist.com";
  const resend      = new Resend(env.BIDTOLIST_RESEND_API_KEY ?? "");
  const checkoutUrl = `https://homegentic.com/checkout?bidtolist_code=${encodeURIComponent(code)}`;
  await sendOrThrow(resend, {
    from,
    to: homeownerEmail,
    subject: "Your HomeGentic discount — compliments of BidtoList",
    html: `
      <p>Congratulations on finding your agent for the <strong>${escapeHtml(city, 100)}</strong> listing!</p>
      <p>As a BidtoList homeowner, you're entitled to a discount on your first month of HomeGentic — the property management platform that helps you stay on top of maintenance, records, and repairs at your next home.</p>
      <p style="margin:24px 0">
        <a href="${checkoutUrl}" style="background:#1B4332;color:#fff;padding:14px 28px;text-decoration:none;font-weight:600;display:inline-block">
          Claim your discount →
        </a>
      </p>
      <p style="font-size:0.85em;color:#6B7280">
        Or enter code <strong>${escapeHtml(code, 40)}</strong> at homegentic.com/checkout.
        Code is valid for 90 days and can only be used once.
      </p>
      <p style="color:#6B7280;font-size:0.85em">You're receiving this because you recently completed a listing on BidtoList.</p>
    `,
  });
}

// ── JSON helper ───────────────────────────────────────────────────────────────

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * Handle /api/bidtolist/* requests.
 * `subpath` is the part after "/api/bidtolist" (e.g. "/email/new-proposal").
 *
 * Bid to List is a separate app with its own Internet Identity principals, so
 * its users can't present a HomeGentic x-agent-session; the 4th parameter is
 * accepted for call-site compatibility and ignored. Instead every route is
 * bound to on-chain state (X-2):
 *   - the body carries identifiers only (requestId / proposalId / agentPrincipal);
 *   - the Worker reads the Bid to List canisters with its own identity and
 *     sends an email only when that state warrants it (proposal exists,
 *     request Awarded / Cancelled, deadline passed, agent verified, …);
 *   - recipients and template values come from canister data, HTML-escaped;
 *   - each (event, entity) pair is claimed once in RateLimiterDO (KV fallback);
 *   - every route is rate-limited per IP.
 * So nobody can make the Worker send an email the on-chain state doesn't
 * justify, whoever calls it.
 */
export async function handleBidtolist(
  request: Request,
  subpath: string,
  env: BidtolistEnv,
  _getPrincipal?: () => Promise<string | null>,
): Promise<Response> {
  try {
    return await routeBidtolist(request, subpath, env);
  } catch (err) {
    if (err instanceof HttpError) return jsonResp({ error: err.message }, err.status);
    console.error("[bidtolist] unhandled error:", (err as Error)?.message);
    return jsonResp({ error: "Internal error" }, 500);
  }
}

async function routeBidtolist(
  request: Request,
  subpath: string,
  env: BidtolistEnv,
): Promise<Response> {
  const from   = env.BIDTOLIST_RESEND_FROM ?? "noreply@bidtolist.com";
  const resend = new Resend(env.BIDTOLIST_RESEND_API_KEY ?? "");

  // POST /api/bidtolist/stripe/webhook — raw body for Stripe HMAC
  if (subpath === "/stripe/webhook" && request.method === "POST") {
    const stripeKey     = env.BIDTOLIST_STRIPE_SECRET_KEY;
    const webhookSecret = env.BIDTOLIST_STRIPE_WEBHOOK_SECRET;
    if (!stripeKey || !webhookSecret) return jsonResp({ received: true });

    const rawBody = new Uint8Array(await readBodyBytes(request, MAX_WEBHOOK_BYTES));
    const sig     = request.headers.get("stripe-signature") ?? "";
    const stripe  = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    let event: Stripe.Event;
    try {
      // F-7: constructEvent (sync) can't use SubtleCrypto on workerd.
      event = await stripe.webhooks.constructEventAsync(
        rawBody as any, sig, webhookSecret, undefined, Stripe.createSubtleCryptoProvider(),
      );
    } catch (err: any) {
      console.error("[bidtolist] Webhook signature verification failed:", err?.message);
      return jsonResp({ error: "Webhook signature verification failed" }, 400);
    }

    // async_payment_succeeded covers delayed methods, whose "completed" event
    // arrives before the money does (payment_status "unpaid").
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      // metadata.feeId was set by create-checkout-session from the fee
      // canister's own record, never from a request body.
      const feeId   = session.metadata?.feeId;
      const onceKey = `btl:feepaid:${event.id}`;
      const once    = feeId && session.payment_status === "paid" ? await beginOnce(env, onceKey) : "done";
      if (once === "busy") return jsonResp({ error: "Event is being processed" }, 409);   // Stripe retries
      if (once === "new") {
        try {
          const feeActor = createFeeActor(env);
          if (!feeActor) {
            console.warn("[bidtolist] Fee canister not configured — skipping markFeePaid");
          } else {
            const result = await (feeActor as any).markFeePaid(feeId) as { ok?: any; err?: unknown };
            if (result.err) throw new Error(`fee canister error: ${JSON.stringify(result.err)}`);
            const requestId = result.ok?.requestId ?? "";
            console.log(`[bidtolist] Fee ${feeId} marked paid`);
            if (requestId) {
              const code = generateDiscountCode();
              createHomegenticCode(code, env).catch((e) =>
                console.error("[bidtolist] createHomegenticCode failed:", e?.message)
              );
              sendHomeownerCodeEmail(requestId, code, env).catch((e) =>
                console.error("[bidtolist] homeowner-code email failed:", e?.message)
              );
              console.log(`[bidtolist] Promo generated for request ${requestId}`);
            }
          }
        } catch (err: any) {
          console.error(`[bidtolist] markFeePaid failed for ${feeId}:`, err?.message);
          // Let Stripe's retry try again.
          await abortOnce(env, onceKey);
          return jsonResp({ error: "fee update failed" }, 500);
        }
        await finishOnce(env, onceKey, 7 * DAY);
      }
    }

    return jsonResp({ received: true });
  }

  if (request.method !== "POST") return jsonResp({ error: "Not found" }, 404);

  // Per-IP budget for every non-webhook route (each one costs canister
  // queries and possibly Resend / Stripe calls).
  const ip   = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const hour = Math.floor(Date.now() / 3_600_000);
  if (!(await hitCounter(env, `btl-ip:${ip}:${hour}`, IP_HOURLY_LIMIT, 2 * 3600)).allowed) {
    return jsonResp({ error: "Too many requests" }, 429);
  }

  const body = await readJsonBody<Record<string, unknown>>(request);
  const idOf = (field: string): string => {
    const id = body[field];
    if (typeof id !== "string" || !REQUEST_ID_RE.test(id)) throw new HttpError(400, `valid ${field} required`);
    return id;
  };
  const agentPrincipalOf = (): string => {
    const p = body.agentPrincipal;
    let ok = typeof p === "string" && PRINCIPAL_RE.test(p);
    if (ok) { try { Principal.fromText(p as string); } catch { ok = false; } }
    if (!ok) throw new HttpError(400, "valid agentPrincipal required");
    return p as string;
  };
  const listingOf = async (requestId: string): Promise<ListingInfo | null> => {
    try {
      return await fetchListing(requestId, env);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error("[bidtolist] fetchListing failed:", (err as Error)?.message);
      throw new HttpError(502, "canister call failed");
    }
  };
  const proposalsOf = async (requestId: string): Promise<ProposalInfo[]> => {
    try {
      return (await fetchProposals(requestId, env)) ?? [];
    } catch (err) {
      console.error("[bidtolist] getProposalsForRequest failed:", (err as Error)?.message);
      throw new HttpError(502, "canister call failed");
    }
  };
  /** The agent's server-side profile with a usable email (null if none). */
  const agentProfile = async (agentPrincipal: string) => {
    let profile: Awaited<ReturnType<typeof fetchAgentProfile>>;
    try {
      profile = await fetchAgentProfile(agentPrincipal, env);
    } catch (err) {
      console.error("[bidtolist] getProfile failed:", (err as Error)?.message);
      throw new HttpError(502, "agent canister call failed");
    }
    if (!profile) return null;
    if (profile.email.length > 320 || !EMAIL_RE.test(profile.email)) return null;
    return profile;
  };
  /**
   * Send once per dedupe key. A failed send (or a Worker that dies mid-send)
   * leaves no "done" marker, so a later request can retry; Resend's
   * idempotency key stops a retry from duplicating a send that did land.
   */
  const sendOnce = async (key: string, to: string, subject: string, html: string): Promise<"sent" | "deduped" | "failed"> => {
    const onceKey = `btlmail:${key}`;
    if ((await beginOnce(env, onceKey)) !== "new") return "deduped";
    try {
      await sendOrThrow(resend, { from, to, subject, html }, onceKey);
    } catch (err) {
      console.error(`[bidtolist] Resend error (${key.split(":")[0]}):`, (err as Error)?.message);
      await abortOnce(env, onceKey);
      return "failed";
    }
    await finishOnce(env, onceKey, ONCE_TTL);
    return "sent";
  };
  const single = (r: "sent" | "deduped" | "failed"): Response =>
    r === "failed" ? jsonResp({ error: "email send failed" }, 500)
      : r === "deduped" ? jsonResp({ ok: true, deduped: true })
      : jsonResp({ ok: true });
  /** Fan out to the agents who proposed on a request (Withdrawn excluded). */
  const toProposers = async (
    proposals: ProposalInfo[],
    keyFor: (p: ProposalInfo) => string,
    render: (p: ProposalInfo, agentName: string) => { subject: string; html: string },
  ): Promise<Response> => {
    const seen = new Set<string>();
    let sent = 0, failed = 0;
    for (const p of proposals) {
      if (p.status === "Withdrawn" || seen.has(p.agentId)) continue;
      seen.add(p.agentId);
      const agent = await agentProfile(p.agentId);
      if (!agent) continue;
      const { subject, html } = render(p, agent.name);
      const r = await sendOnce(keyFor(p), agent.email, subject, html);
      if (r === "sent") sent++; else if (r === "failed") failed++;
    }
    if (failed > 0) console.warn(`[bidtolist] ${failed} proposer email(s) failed`);
    return jsonResp({ ok: true, sent });
  };

  // POST /api/bidtolist/email/new-proposal — Body: { requestId, proposalId }.
  // Sent to the listing's homeowner once per proposal, only if that proposal
  // exists on that open request.
  if (subpath === "/email/new-proposal") {
    const requestId  = idOf("requestId");
    const proposalId = idOf("proposalId");
    const listing = await listingOf(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (listing.status !== "Open") return jsonResp({ error: "Listing is not open" }, 409);
    const proposal = (await proposalsOf(requestId)).find((p) => p.id === proposalId);
    if (!proposal || proposal.status === "Withdrawn") return jsonResp({ error: "Proposal not found" }, 404);
    if (!listing.homeownerEmail || !EMAIL_RE.test(listing.homeownerEmail)) {
      return jsonResp({ error: "homeownerEmail empty on record" }, 422);
    }
    const city = escapeHtml(listing.city, 100);
    return single(await sendOnce(`new-proposal:${proposalId}`, listing.homeownerEmail,
      `New proposal on your ${subjectText(listing.city)} listing — BidtoList`, `
          <p>Good news — a licensed agent has submitted a proposal for your <strong>${city}</strong> listing.</p>
          <p>Proposals are sealed until <strong>${escapeHtml(listing.deadlineDate, 60)}</strong>. You'll be able to review and compare all offers once the deadline passes.</p>
          <p><a href="https://bidtolist.com/my-bids">View your listing →</a></p>
          <p style="color:#6B7280;font-size:0.85em">You're receiving this because you posted a listing on BidtoList.</p>
        `));
  }

  // POST /api/bidtolist/email/proposal-result — Body: { requestId }.
  // Only once the request is Awarded; each agent who proposed hears once
  // whether they won (the Accepted proposal) or not.
  if (subpath === "/email/proposal-result") {
    const requestId = idOf("requestId");
    const listing = await listingOf(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (listing.status !== "Awarded") return jsonResp({ error: "Listing has not been awarded" }, 409);
    const proposals = await proposalsOf(requestId);
    const winner = proposals.find((p) => p.status === "Accepted");
    if (!winner) return jsonResp({ error: "No accepted proposal" }, 409);
    const city = escapeHtml(listing.city, 100);
    return toProposers(
      proposals,
      (p) => `proposal-result:${requestId}:${winner.id}:${p.agentId}`,
      (p, agentName) => {
        const name = escapeHtml(agentName, 200);
        return p.id === winner.id
          ? {
              subject: `Congratulations — you won the listing in ${subjectText(listing.city)} — BidtoList`,
              html: `<p>Hi ${name},</p>
         <p>Congratulations! The homeowner has selected you as their agent for the <strong>${city}</strong> listing.</p>
         <p>A platform fee is due. You'll receive an invoice shortly.</p>
         <p><a href="https://bidtolist.com/agents/dashboard">View your dashboard →</a></p>`,
            }
          : {
              subject: `Listing result for ${subjectText(listing.city)} — BidtoList`,
              html: `<p>Hi ${name},</p>
         <p>The homeowner for the <strong>${city}</strong> listing has selected another agent.</p>
         <p>Keep an eye on new listings — there are always more opportunities.</p>
         <p><a href="https://bidtolist.com/agents/browse">Browse open listings →</a></p>`,
            };
      },
    );
  }

  // POST /api/bidtolist/email/agent-verified — Body: { agentPrincipal }.
  // Only when the agent canister says the profile is verified; once.
  if (subpath === "/email/agent-verified") {
    const agentPrincipal = agentPrincipalOf();
    const agent = await agentProfile(agentPrincipal);
    if (!agent) return jsonResp({ error: "Agent not found" }, 404);
    if (!agent.isVerified) return jsonResp({ error: "Agent is not verified" }, 409);
    return single(await sendOnce(`agent-verified:${agentPrincipal}`, agent.email,
      "Your BidtoList account is verified", `
          <p>Hi ${escapeHtml(agent.name, 200)},</p>
          <p>Your BidtoList agent account has been verified. You can now browse open listing requests and submit sealed proposals.</p>
          <p><a href="https://bidtolist.com/agents/browse">Browse listings →</a></p>
        `));
  }

  // POST /api/bidtolist/email/new-listing — Body: { requestId }. Announces an
  // open listing (deadline still ahead) to up to 10 verified agents in its
  // city, once per listing.
  if (subpath === "/email/new-listing") {
    const requestId = idOf("requestId");
    const listing = await listingOf(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (listing.status !== "Open" || listing.bidDeadlineMs <= Date.now()) {
      return jsonResp({ error: "Listing is not open" }, 409);
    }
    const agentActor = await createAgentActor(env);
    if (!agentActor) {
      console.warn("[bidtolist] Agent canister not wired — skipping broadcast");
      return jsonResp({ ok: true, skipped: true });
    }
    let agents: any[];
    try {
      agents = await (agentActor as any).getAgentsForCity(listing.city, 10) as any[];
    } catch (err) {
      console.error("[bidtolist] getAgentsForCity failed:", (err as Error)?.message);
      return jsonResp({ error: "agent canister call failed" }, 502);
    }
    const city = escapeHtml(listing.city, 100);
    const deadline = escapeHtml(listing.deadlineDate, 60);
    let sent = 0;
    for (const agent of agents) {
      if (!agent?.isVerified || typeof agent.email !== "string" || !EMAIL_RE.test(agent.email)) continue;
      const agentId = (agent.id as Principal)?.toText?.() ?? String(agent.id);
      const r = await sendOnce(`new-listing:${requestId}:${agentId}`, agent.email,
        `New listing in ${subjectText(listing.city)} — BidtoList`, `
            <p>Hi ${escapeHtml(agent.name, 200)},</p>
            <p>A homeowner in <strong>${city}</strong> has posted a new listing on BidtoList.</p>
            <p>Proposals are accepted until <strong>${deadline}</strong>. As a verified agent serving ${city}, you have been selected to submit a sealed bid.</p>
            <p><a href="https://bidtolist.com/agents/browse">View and submit your proposal →</a></p>
            <p style="color:#6B7280;font-size:0.85em">You're receiving this because ${city} is in your service area on BidtoList.</p>
          `);
      if (r === "sent") sent++;
    }
    return jsonResp({ ok: true, sent });
  }

  // POST /api/bidtolist/stripe/create-checkout-session — Body: { proposalId, feeId? }.
  // Bound to fee-canister state: the fee must exist for that proposal, still
  // be Owed/Invoiced, and the proposal must be the request's Accepted one.
  // Stripe metadata comes from the fee record, never from the body.
  if (subpath === "/stripe/create-checkout-session") {
    const stripeKey = env.BIDTOLIST_STRIPE_SECRET_KEY;
    const priceId   = env.BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE;
    const origin    = env.BIDTOLIST_FRONTEND_ORIGIN ?? "http://localhost:3000";
    if (!stripeKey || !priceId) return jsonResp({ url: null, mock: true });
    const proposalId = idOf("proposalId");
    const feeIdIn    = body.feeId === undefined || body.feeId === null ? null : idOf("feeId");
    const feeActor   = createFeeActor(env);
    if (!feeActor) return jsonResp({ error: "fee canister not configured" }, 503);
    let fees: any[];
    try {
      const r = await (feeActor as any).getAllFees() as { ok?: any[]; err?: unknown };
      if (!r.ok) throw new Error(`getAllFees: ${Object.keys(r.err ?? {})[0] ?? "error"}`);
      fees = r.ok;
    } catch (err) {
      console.error("[bidtolist] fee lookup failed:", (err as Error)?.message);
      return jsonResp({ error: "fee canister call failed" }, 502);
    }
    const fee = fees.find((f: any) => f.proposalId === proposalId && (feeIdIn === null || f.id === feeIdIn));
    if (!fee) return jsonResp({ error: "Fee not found" }, 404);
    const feeStatus = variantName(fee.status);
    if (feeStatus !== "Owed" && feeStatus !== "Invoiced") return jsonResp({ error: "Fee is not payable" }, 409);
    const requestId = String(fee.requestId);
    const winner = (await proposalsOf(requestId)).find((p) => p.id === proposalId);
    if (!winner || winner.status !== "Accepted") return jsonResp({ error: "Proposal is not the accepted one" }, 409);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: {
          feeId: String(fee.id), proposalId, requestId,
          agentId: (fee.agentId as Principal)?.toText?.() ?? String(fee.agentId),
        },
        success_url: `${origin}/agents/dashboard?fee_paid=1`,
        cancel_url:  `${origin}/agents/dashboard?fee_cancelled=1`,
      });
      return jsonResp({ url: session.url });
    } catch (err: any) {
      console.error("[bidtolist] Stripe create-session error:", err?.message);
      return jsonResp({ error: "Failed to create checkout session" }, 500);
    }
  }

  // POST /api/bidtolist/email/reveal-opened — Body: { requestId }. Sent to the
  // homeowner once, only after the bid deadline has passed on an open request
  // that has at least one live proposal.
  if (subpath === "/email/reveal-opened") {
    const requestId = idOf("requestId");
    const listing = await listingOf(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (listing.status !== "Open" || Date.now() < listing.bidDeadlineMs) {
      return jsonResp({ error: "Bidding window has not closed" }, 409);
    }
    const live = (await proposalsOf(requestId)).filter((p) => p.status !== "Withdrawn");
    if (live.length === 0) return jsonResp({ ok: true, skipped: true });
    if (!listing.homeownerEmail || !EMAIL_RE.test(listing.homeownerEmail)) {
      return jsonResp({ error: "homeownerEmail empty on record" }, 422);
    }
    const city = escapeHtml(listing.city, 100);
    return single(await sendOnce(`reveal-opened:${requestId}`, listing.homeownerEmail,
      `Your ${subjectText(listing.city)} bids are ready to review — BidtoList`, `
          <p>The bidding window for your <strong>${city}</strong> listing has closed.</p>
          <p>All sealed proposals are now visible. Log in to compare commission rates, marketing plans, and CMA summaries — then select your agent.</p>
          <p><a href="https://bidtolist.com/my-bids">Review proposals now →</a></p>
          <p style="color:#6B7280;font-size:0.85em">You're receiving this because you posted a listing on BidtoList.</p>
        `));
  }

  // POST /api/bidtolist/email/listing-cancelled — Body: { requestId }. Only
  // when the request is Cancelled; each agent who proposed hears once.
  if (subpath === "/email/listing-cancelled") {
    const requestId = idOf("requestId");
    const listing = await listingOf(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (listing.status !== "Cancelled") return jsonResp({ error: "Listing is not cancelled" }, 409);
    const city = escapeHtml(listing.city, 100);
    return toProposers(
      await proposalsOf(requestId),
      (p) => `listing-cancelled:${requestId}:${p.agentId}`,
      (_p, agentName) => ({
        subject: `Listing cancelled — ${subjectText(listing.city)} — BidtoList`,
        html: `
          <p>Hi ${escapeHtml(agentName, 200)},</p>
          <p>The homeowner has cancelled their <strong>${city}</strong> listing on BidtoList. Any proposals you submitted have been withdrawn.</p>
          <p>Keep an eye on new listings — there are always more opportunities.</p>
          <p><a href="https://bidtolist.com/agents/browse">Browse open listings →</a></p>
        `,
      }),
    );
  }

  return jsonResp({ error: "Not found" }, 404);
}

/**
 * Cron handler — called by the Cloudflare Workers scheduled event (every hour).
 * Finds listings whose bid deadline falls within the next 24 hours and sends
 * a reminder email to all agents in that listing's city.
 */
export async function scheduledBidtolist(env: BidtolistEnv): Promise<void> {
  const from   = env.BIDTOLIST_RESEND_FROM ?? "noreply@bidtolist.com";
  const resend = new Resend(env.BIDTOLIST_RESEND_API_KEY ?? "");

  const listingActor = await createListingActor(env);
  const agentActor   = await createAgentActor(env);
  if (!listingActor || !agentActor) {
    console.log("[bidtolist:cron] canister actors not configured — skipping deadline reminders");
    return;
  }

  try {
    await (listingActor as any).tickCascade();
    console.log("[bidtolist:cron] cascade tick complete");
  } catch (err) {
    console.error("[bidtolist:cron] tickCascade failed:", err);
  }

  const windowNs = BigInt(24 * 60 * 60) * BigInt(1_000_000_000);
  const listings  = await (listingActor as any).getListingsNearDeadline(windowNs) as any[];
  if (listings.length === 0) {
    console.log("[bidtolist:cron] no listings with deadline in next 24h");
    return;
  }

  console.log(`[bidtolist:cron] sending deadline reminders for ${listings.length} listing(s)`);
  for (const listing of listings) {
    const city         = listing.city as string;
    const deadlineDate = new Date(Number(listing.bidDeadline) / 1_000_000).toLocaleDateString("en-US", {
      month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });
    let agents: any[];
    try {
      agents = await (agentActor as any).getAgentsForCity(city, 50) as any[];
    } catch (err) {
      console.error(`[bidtolist:cron] getAgentsForCity failed for "${city}":`, err);
      continue;
    }
    // Remind only agents who haven't bid yet. If the proposals can't be read, skip
    // this listing rather than nag agents who already submitted.
    let submitted: Set<string>;
    try {
      const proposals = await (listingActor as any).getProposalsForRequest(listing.id) as any[];
      submitted = new Set(proposals.map((p: any) => p.agentId.toText()));
    } catch (err) {
      console.error(`[bidtolist:cron] getProposalsForRequest failed for "${listing.id}":`, err);
      continue;
    }
    const unsubmitted = agents.filter((a: any) => !submitted.has(a.id.toText()));
    const results = await Promise.allSettled(
      unsubmitted.map((agent: any) =>
        sendOrThrow(resend, {
          from,
          to: agent.email,
          subject: `Deadline reminder: ${subjectText(city)} listing closes soon — BidtoList`,
          html: `
            <p>Hi ${escapeHtml(agent.name, 200)},</p>
            <p>A homeowner listing in <strong>${escapeHtml(city, 100)}</strong> closes on <strong>${escapeHtml(deadlineDate, 60)}</strong>. There are already <strong>${Number(listing.proposalCount)}</strong> proposal(s) submitted.</p>
            <p>If you'd like to compete, submit your sealed bid before the deadline.</p>
            <p><a href="https://bidtolist.com/agents/browse">Submit a proposal →</a></p>
            <p style="color:#6B7280;font-size:0.85em">You're receiving this because ${escapeHtml(city, 100)} is in your service area on BidtoList.</p>
          `,
        })
      )
    );
    const sent   = results.filter(r => r.status === "fulfilled").length;
    const failed = results.length - sent;
    console.log(`[bidtolist:cron] ${city}: ${sent} reminders sent, ${failed} failed`);
  }
}
