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
  /** Used to dedupe notification emails (X-2). Optional so tests can omit it. */
  RATE_LIMIT?: KVNamespace;
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
  return I.Service({
    getBidRequest:           I.Func([I.Text], [I.Variant({ ok: ListingBidRequest, err: Error })], ["query"]),
    getListingsNearDeadline: I.Func([I.Int], [I.Vec(BidRequestSummary)], ["query"]),
    markRevealNotified:      I.Func([I.Text], [I.Bool], []),
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
  const buf = Buffer.from(seed, "hex");
  return Ed25519KeyIdentity.fromSecretKey(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
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

async function fetchListing(requestId: string, env: BidtolistEnv) {
  const actor = await createListingActor(env);
  if (!actor) return null;
  const result = await (actor as any).getBidRequest(requestId) as any;
  if ("err" in result) throw new Error(`getBidRequest error: ${JSON.stringify(result.err)}`);
  const { homeownerEmail, city, bidDeadline, homeowner, status } = result.ok;
  const deadlineDate = new Date(Number(bidDeadline) / 1_000_000).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  return {
    homeownerEmail: homeownerEmail as string,
    city: city as string,
    deadlineDate,
    homeowner: (homeowner as Principal)?.toText?.() ?? String(homeowner),
    status: Object.keys(status ?? {})[0] ?? "",
  };
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

/**
 * True the first time `key` is seen within `ttlSeconds` (per KV); used to stop
 * the email routes from being replayed to bomb a recipient. Without KV
 * (tests / local) everything is allowed.
 */
async function firstSend(env: BidtolistEnv, key: string, ttlSeconds: number): Promise<boolean> {
  if (!env.RATE_LIMIT) return true;
  const k = `btlmail:${key}`;
  if (await env.RATE_LIMIT.get(k)) return false;
  await env.RATE_LIMIT.put(k, "1", { expirationTtl: ttlSeconds });
  return true;
}

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DAY = 86_400;

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
  await resend.emails.send({
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
 * `getPrincipal` resolves the caller's verified principal from the
 * x-agent-session token (null when there is no valid session).
 *
 * X-2 / F-5: every route except the Stripe webhook needs a session; email
 * recipients are resolved from canister records (never from the body); the
 * caller must be the listing's homeowner for listing-scoped notifications;
 * every interpolated value is HTML-escaped; repeats are deduped in KV.
 */
export async function handleBidtolist(
  request: Request,
  subpath: string,
  env: BidtolistEnv,
  getPrincipal: () => Promise<string | null> = async () => null,
): Promise<Response> {
  try {
    return await routeBidtolist(request, subpath, env, getPrincipal);
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
  getPrincipal: () => Promise<string | null>,
): Promise<Response> {
  const from   = env.BIDTOLIST_RESEND_FROM ?? "noreply@bidtolist.com";
  const resend = new Resend(env.BIDTOLIST_RESEND_API_KEY ?? "");

  // POST /api/bidtolist/stripe/webhook — raw body for Stripe HMAC (no session)
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

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const feeId   = session.metadata?.feeId;
      if (feeId && await firstSend(env, `feepaid:${event.id}`, 7 * DAY)) {
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
        }
      }
    }

    return jsonResp({ received: true });
  }

  if (request.method !== "POST") return jsonResp({ error: "Not found" }, 404);

  const caller = await getPrincipal();
  if (!caller || caller === "anon") return jsonResp({ error: "session_required" }, 401);

  const body = await readJsonBody<Record<string, unknown>>(request);
  const requestIdOf = (): string => {
    const id = body.requestId;
    if (typeof id !== "string" || !REQUEST_ID_RE.test(id)) throw new HttpError(400, "valid requestId required");
    return id;
  };
  const agentPrincipalOf = (): string => {
    const p = body.agentPrincipal;
    if (typeof p !== "string" || !PRINCIPAL_RE.test(p)) throw new HttpError(400, "valid agentPrincipal required");
    return p;
  };
  /** The listing, which the caller must own. */
  const ownedListing = async (requestId: string) => {
    let listing: Awaited<ReturnType<typeof fetchListing>>;
    try {
      listing = await fetchListing(requestId, env);
    } catch (err) {
      console.error("[bidtolist] fetchListing failed:", (err as Error)?.message);
      throw new HttpError(502, "canister call failed");
    }
    if (listing && listing.homeowner !== caller) throw new HttpError(403, "Not your listing");
    return listing;
  };
  /** The agent's server-side profile with a usable email. */
  const agentProfile = async (agentPrincipal: string) => {
    let profile: Awaited<ReturnType<typeof fetchAgentProfile>>;
    try {
      profile = await fetchAgentProfile(agentPrincipal, env);
    } catch (err) {
      console.error("[bidtolist] getProfile failed:", (err as Error)?.message);
      throw new HttpError(502, "agent canister call failed");
    }
    if (!profile) return null;
    if (profile.email.length > 320 || !EMAIL_RE.test(profile.email)) throw new HttpError(422, "agent email invalid on record");
    return profile;
  };
  const send = async (to: string, subject: string, html: string, label: string): Promise<Response> => {
    try {
      await resend.emails.send({ from, to, subject, html });
      return jsonResp({ ok: true });
    } catch (err) {
      console.error(`[bidtolist] Resend error (${label}):`, (err as Error)?.message);
      return jsonResp({ error: "email send failed" }, 500);
    }
  };

  // POST /api/bidtolist/email/new-proposal — notify the homeowner. Anyone with
  // a session may trigger it (agents submit proposals), but the recipient is
  // the listing's own email and repeats are limited to one per 10 minutes.
  if (subpath === "/email/new-proposal") {
    const requestId = requestIdOf();
    let listing: Awaited<ReturnType<typeof fetchListing>>;
    try {
      listing = await fetchListing(requestId, env);
    } catch (err) {
      console.error("[bidtolist] fetchListing failed (new-proposal):", (err as Error)?.message);
      return jsonResp({ error: "canister call failed" }, 502);
    }
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (!listing.homeownerEmail) return jsonResp({ error: "homeownerEmail empty on record" }, 422);
    if (!await firstSend(env, `new-proposal:${requestId}`, 600)) return jsonResp({ ok: true, deduped: true });
    const city = escapeHtml(listing.city, 100);
    return send(listing.homeownerEmail, `New proposal on your ${subjectText(listing.city)} listing — BidtoList`, `
          <p>Good news — a licensed agent has submitted a proposal for your <strong>${city}</strong> listing.</p>
          <p>Proposals are sealed until <strong>${escapeHtml(listing.deadlineDate, 60)}</strong>. You'll be able to review and compare all offers once the deadline passes.</p>
          <p><a href="https://bidtolist.com/my-bids">View your listing →</a></p>
          <p style="color:#6B7280;font-size:0.85em">You're receiving this because you posted a listing on BidtoList.</p>
        `, "new-proposal");
  }

  // POST /api/bidtolist/email/proposal-result — homeowner tells an agent
  // whether they won. Body: { requestId, agentPrincipal, won }.
  if (subpath === "/email/proposal-result") {
    const requestId      = requestIdOf();
    const agentPrincipal = agentPrincipalOf();
    const won            = body.won === true;
    const listing = await ownedListing(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    const agent = await agentProfile(agentPrincipal);
    if (!agent) return jsonResp({ error: "Agent not found" }, 404);
    if (!await firstSend(env, `proposal-result:${requestId}:${agentPrincipal}`, 30 * DAY)) {
      return jsonResp({ ok: true, deduped: true });
    }
    const name = escapeHtml(agent.name, 200);
    const city = escapeHtml(listing.city, 100);
    const subject = won
      ? `Congratulations — you won the listing in ${subjectText(listing.city)} — BidtoList`
      : `Listing result for ${subjectText(listing.city)} — BidtoList`;
    const html = won
      ? `<p>Hi ${name},</p>
         <p>Congratulations! The homeowner has selected you as their agent for the <strong>${city}</strong> listing.</p>
         <p>A platform fee is due. You'll receive an invoice shortly.</p>
         <p><a href="https://bidtolist.com/agents/dashboard">View your dashboard →</a></p>`
      : `<p>Hi ${name},</p>
         <p>The homeowner for the <strong>${city}</strong> listing has selected another agent.</p>
         <p>Keep an eye on new listings — there are always more opportunities.</p>
         <p><a href="https://bidtolist.com/agents/browse">Browse open listings →</a></p>`;
    return send(agent.email, subject, html, "proposal-result");
  }

  // POST /api/bidtolist/email/agent-verified — Body: { agentPrincipal }.
  // Only sent when the agent canister says the profile is verified, at most
  // once per 30 days.
  if (subpath === "/email/agent-verified") {
    const agentPrincipal = agentPrincipalOf();
    const agent = await agentProfile(agentPrincipal);
    if (!agent) return jsonResp({ error: "Agent not found" }, 404);
    if (!agent.isVerified) return jsonResp({ error: "Agent is not verified" }, 409);
    if (!await firstSend(env, `agent-verified:${agentPrincipal}`, 30 * DAY)) return jsonResp({ ok: true, deduped: true });
    return send(agent.email, "Your BidtoList account is verified", `
          <p>Hi ${escapeHtml(agent.name, 200)},</p>
          <p>Your BidtoList agent account has been verified. You can now browse open listing requests and submit sealed proposals.</p>
          <p><a href="https://bidtolist.com/agents/browse">Browse listings →</a></p>
        `, "agent-verified");
  }

  // POST /api/bidtolist/email/new-listing — the homeowner announces their own
  // listing to up to 10 agents in its city, once.
  if (subpath === "/email/new-listing") {
    const requestId = requestIdOf();
    const listing = await ownedListing(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    const agentActor = await createAgentActor(env);
    if (!agentActor) {
      console.warn("[bidtolist] Agent canister not wired — skipping broadcast");
      return jsonResp({ ok: true, skipped: true });
    }
    if (!await firstSend(env, `new-listing:${requestId}`, 30 * DAY)) return jsonResp({ ok: true, deduped: true });
    let agents: any[];
    try {
      agents = await (agentActor as any).getAgentsForCity(listing.city, 10) as any[];
    } catch (err) {
      console.error("[bidtolist] getAgentsForCity failed:", (err as Error)?.message);
      return jsonResp({ error: "agent canister call failed" }, 502);
    }
    if (agents.length === 0) return jsonResp({ ok: true, sent: 0 });
    const city = escapeHtml(listing.city, 100);
    const deadline = escapeHtml(listing.deadlineDate, 60);
    const results = await Promise.allSettled(
      agents
        .filter((agent: any) => typeof agent.email === "string" && EMAIL_RE.test(agent.email))
        .map((agent: any) =>
          resend.emails.send({
            from,
            to: agent.email,
            subject: `New listing in ${subjectText(listing.city)} — BidtoList`,
            html: `
            <p>Hi ${escapeHtml(agent.name, 200)},</p>
            <p>A homeowner in <strong>${city}</strong> has posted a new listing on BidtoList.</p>
            <p>Proposals are accepted until <strong>${deadline}</strong>. As a verified agent serving ${city}, you have been selected to submit a sealed bid.</p>
            <p><a href="https://bidtolist.com/agents/browse">View and submit your proposal →</a></p>
            <p style="color:#6B7280;font-size:0.85em">You're receiving this because ${city} is in your service area on BidtoList.</p>
          `,
          })
        )
    );
    const sent   = results.filter(r => r.status === "fulfilled").length;
    const failed = results.length - sent;
    if (failed > 0) console.warn(`[bidtolist] new-listing broadcast: ${failed}/${results.length} emails failed`);
    return jsonResp({ ok: true, sent });
  }

  // POST /api/bidtolist/stripe/create-checkout-session
  if (subpath === "/stripe/create-checkout-session") {
    const stripeKey = env.BIDTOLIST_STRIPE_SECRET_KEY;
    const priceId   = env.BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE;
    const origin    = env.BIDTOLIST_FRONTEND_ORIGIN ?? "http://localhost:3000";
    if (!stripeKey || !priceId) return jsonResp({ url: null, mock: true });
    const feeId      = typeof body.feeId === "string" ? body.feeId.slice(0, 64) : "";
    const proposalId = typeof body.proposalId === "string" ? body.proposalId.slice(0, 64) : "";
    if (!feeId) return jsonResp({ error: "feeId required" }, 400);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { feeId, proposalId, payer: caller },
        success_url: `${origin}/agents/dashboard?fee_paid=1`,
        cancel_url:  `${origin}/agents/dashboard?fee_cancelled=1`,
      });
      return jsonResp({ url: session.url });
    } catch (err: any) {
      console.error("[bidtolist] Stripe create-session error:", err?.message);
      return jsonResp({ error: "Failed to create checkout session" }, 500);
    }
  }

  // POST /api/bidtolist/email/reveal-opened — one-shot per listing
  // (markRevealNotified), sent to the listing's own email.
  if (subpath === "/email/reveal-opened") {
    const requestId = requestIdOf();
    const actor = await createListingActor(env);
    if (!actor) return jsonResp({ ok: true, skipped: true });
    const first = await (actor as any).markRevealNotified(requestId) as boolean;
    if (!first) return jsonResp({ ok: true, skipped: true });
    let listing: Awaited<ReturnType<typeof fetchListing>>;
    try {
      listing = await fetchListing(requestId, env);
    } catch (err) {
      console.error("[bidtolist] fetchListing failed (reveal-opened):", (err as Error)?.message);
      return jsonResp({ error: "canister call failed" }, 502);
    }
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (!listing.homeownerEmail) return jsonResp({ error: "homeownerEmail empty on record" }, 422);
    const city = escapeHtml(listing.city, 100);
    return send(listing.homeownerEmail, `Your ${subjectText(listing.city)} bids are ready to review — BidtoList`, `
          <p>The bidding window for your <strong>${city}</strong> listing has closed.</p>
          <p>All sealed proposals are now visible. Log in to compare commission rates, marketing plans, and CMA summaries — then select your agent.</p>
          <p><a href="https://bidtolist.com/my-bids">Review proposals now →</a></p>
          <p style="color:#6B7280;font-size:0.85em">You're receiving this because you posted a listing on BidtoList.</p>
        `, "reveal-opened");
  }

  // POST /api/bidtolist/email/listing-cancelled — homeowner tells an agent
  // their (cancelled) listing is gone. Body: { requestId, agentPrincipal }.
  if (subpath === "/email/listing-cancelled") {
    const requestId      = requestIdOf();
    const agentPrincipal = agentPrincipalOf();
    const listing = await ownedListing(requestId);
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (listing.status !== "Cancelled") return jsonResp({ error: "Listing is not cancelled" }, 409);
    const agent = await agentProfile(agentPrincipal);
    if (!agent) return jsonResp({ error: "Agent not found" }, 404);
    if (!await firstSend(env, `listing-cancelled:${requestId}:${agentPrincipal}`, 30 * DAY)) {
      return jsonResp({ ok: true, deduped: true });
    }
    const city = escapeHtml(listing.city, 100);
    return send(agent.email, `Listing cancelled — ${subjectText(listing.city)} — BidtoList`, `
          <p>Hi ${escapeHtml(agent.name, 200)},</p>
          <p>The homeowner has cancelled their <strong>${city}</strong> listing on BidtoList. Any proposals you submitted have been withdrawn.</p>
          <p>Keep an eye on new listings — there are always more opportunities.</p>
          <p><a href="https://bidtolist.com/agents/browse">Browse open listings →</a></p>
        `, "listing-cancelled");
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
    const unsubmitted = agents.filter((a: any) => Number(listing.proposalCount) < Number(listing.proposalCount) || true);
    const results = await Promise.allSettled(
      unsubmitted.map((agent: any) =>
        resend.emails.send({
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
