/**
 * BidtoList route handlers for Cloudflare Workers.
 * Ported from bidtolistRouter.ts (Express Router) to a plain async function
 * that accepts a Workers Request and returns a Response.
 *
 * Mounted at /api/bidtolist/* in index.ts.
 */

import { Resend } from "resend";
import Stripe from "stripe";
import { Actor, HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { IDL } from "@dfinity/candid";

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
}

// ── IDL factories ─────────────────────────────────────────────────────────────

const listingIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null,
    InvalidInput: I.Text, AlreadyCancelled: I.Null, DeadlinePassed: I.Null,
  });
  const BidRequestStatus = I.Variant({ Open: I.Null, Awarded: I.Null, Cancelled: I.Null });
  const ListingBidRequest = I.Record({
    id: I.Text, address: I.Text, city: I.Text, county: I.Text, zipCode: I.Text,
    homeowner: I.Principal, homeownerEmail: I.Text, targetListDate: I.Int,
    desiredSalePrice: I.Opt(I.Nat), notes: I.Text, bidDeadline: I.Int,
    status: BidRequestStatus, createdAt: I.Int, feePaid: I.Bool,
  });
  return I.Service({
    getBidRequest: I.Func([I.Text], [I.Variant({ ok: ListingBidRequest, err: Error })], ["query"]),
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
  const { homeownerEmail, city, bidDeadline } = result.ok;
  const deadlineDate = new Date(Number(bidDeadline) / 1_000_000).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
  return { homeownerEmail, city, deadlineDate };
}

function generateDiscountCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "BIDTOLIST-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

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
      <p>Congratulations on finding your agent for the <strong>${city}</strong> listing!</p>
      <p>As a BidtoList homeowner, you're entitled to a discount on your first month of HomeGentic — the property management platform that helps you stay on top of maintenance, records, and repairs at your next home.</p>
      <p style="margin:24px 0">
        <a href="${checkoutUrl}" style="background:#1B4332;color:#fff;padding:14px 28px;text-decoration:none;font-weight:600;display:inline-block">
          Claim your discount →
        </a>
      </p>
      <p style="font-size:0.85em;color:#6B7280">
        Or enter code <strong>${code}</strong> at homegentic.com/checkout.
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
 */
export async function handleBidtolist(
  request: Request,
  subpath: string,
  env: BidtolistEnv,
): Promise<Response> {
  const from   = env.BIDTOLIST_RESEND_FROM ?? "noreply@bidtolist.com";
  const resend = new Resend(env.BIDTOLIST_RESEND_API_KEY ?? "");

  // POST /api/bidtolist/email/new-proposal
  if (subpath === "/email/new-proposal" && request.method === "POST") {
    const { requestId } = await request.json() as { requestId?: string };
    if (!requestId) return jsonResp({ error: "requestId required" }, 400);
    let listing: Awaited<ReturnType<typeof fetchListing>>;
    try {
      listing = await fetchListing(requestId, env);
    } catch (err) {
      console.error("[bidtolist] fetchListing failed (new-proposal):", err);
      return jsonResp({ error: "canister call failed" }, 502);
    }
    if (!listing) return jsonResp({ ok: true, skipped: true });
    if (!listing.homeownerEmail) return jsonResp({ error: "homeownerEmail empty on record" }, 422);
    try {
      await resend.emails.send({
        from,
        to: listing.homeownerEmail,
        subject: `New proposal on your ${listing.city} listing — BidtoList`,
        html: `
          <p>Good news — a licensed agent has submitted a proposal for your <strong>${listing.city}</strong> listing.</p>
          <p>Proposals are sealed until <strong>${listing.deadlineDate}</strong>. You'll be able to review and compare all offers once the deadline passes.</p>
          <p><a href="https://bidtolist.com/my-bids">View your listing →</a></p>
          <p style="color:#6B7280;font-size:0.85em">You're receiving this because you posted a listing on BidtoList.</p>
        `,
      });
      return jsonResp({ ok: true });
    } catch (err) {
      console.error("[bidtolist] Resend error (new-proposal):", err);
      return jsonResp({ error: "email send failed" }, 500);
    }
  }

  // POST /api/bidtolist/email/proposal-result
  if (subpath === "/email/proposal-result" && request.method === "POST") {
    const { agentEmail, agentName, city, won } = await request.json() as {
      agentEmail?: string; agentName?: string; city?: string; won?: boolean;
    };
    if (!agentEmail) return jsonResp({ error: "agentEmail required" }, 400);
    const subject = won
      ? `Congratulations — you won the listing in ${city} — BidtoList`
      : `Listing result for ${city} — BidtoList`;
    const html = won
      ? `<p>Hi ${agentName},</p>
         <p>Congratulations! The homeowner has selected you as their agent for the <strong>${city}</strong> listing.</p>
         <p>A platform fee of <strong>$295.00</strong> is due. You'll receive an invoice shortly.</p>
         <p><a href="https://bidtolist.com/agents/dashboard">View your dashboard →</a></p>`
      : `<p>Hi ${agentName},</p>
         <p>The homeowner for the <strong>${city}</strong> listing has selected another agent.</p>
         <p>Keep an eye on new listings — there are always more opportunities.</p>
         <p><a href="https://bidtolist.com/agents/browse">Browse open listings →</a></p>`;
    try {
      await resend.emails.send({ from, to: agentEmail, subject, html });
      return jsonResp({ ok: true });
    } catch (err) {
      console.error("[bidtolist] Resend error (proposal-result):", err);
      return jsonResp({ error: "email send failed" }, 500);
    }
  }

  // POST /api/bidtolist/email/agent-verified
  if (subpath === "/email/agent-verified" && request.method === "POST") {
    const { agentEmail, agentName } = await request.json() as { agentEmail?: string; agentName?: string };
    if (!agentEmail) return jsonResp({ error: "agentEmail required" }, 400);
    try {
      await resend.emails.send({
        from,
        to: agentEmail,
        subject: "Your BidtoList account is verified",
        html: `
          <p>Hi ${agentName},</p>
          <p>Your BidtoList agent account has been verified. You can now browse open listing requests and submit sealed proposals.</p>
          <p><a href="https://bidtolist.com/agents/browse">Browse listings →</a></p>
        `,
      });
      return jsonResp({ ok: true });
    } catch (err) {
      console.error("[bidtolist] Resend error (agent-verified):", err);
      return jsonResp({ error: "email send failed" }, 500);
    }
  }

  // POST /api/bidtolist/email/new-listing
  if (subpath === "/email/new-listing" && request.method === "POST") {
    const { requestId } = await request.json() as { requestId?: string };
    if (!requestId) return jsonResp({ error: "requestId required" }, 400);
    let listing: Awaited<ReturnType<typeof fetchListing>>;
    try {
      listing = await fetchListing(requestId, env);
    } catch (err) {
      console.error("[bidtolist] fetchListing failed (new-listing):", err);
      return jsonResp({ error: "canister call failed" }, 502);
    }
    if (!listing) return jsonResp({ ok: true, skipped: true });
    const agentActor = await createAgentActor(env);
    if (!agentActor) {
      console.warn("[bidtolist] Agent canister not wired — skipping broadcast");
      return jsonResp({ ok: true, skipped: true });
    }
    let agents: any[];
    try {
      agents = await (agentActor as any).getAgentsForCity(listing.city, 10) as any[];
    } catch (err) {
      console.error("[bidtolist] getAgentsForCity failed:", err);
      return jsonResp({ error: "agent canister call failed" }, 502);
    }
    if (agents.length === 0) {
      console.log(`[bidtolist] No matching agents for city "${listing.city}"`);
      return jsonResp({ ok: true, sent: 0 });
    }
    const results = await Promise.allSettled(
      agents.map((agent: any) =>
        resend.emails.send({
          from,
          to: agent.email,
          subject: `New listing in ${listing!.city} — BidtoList`,
          html: `
            <p>Hi ${agent.name},</p>
            <p>A homeowner in <strong>${listing!.city}</strong> has posted a new listing on BidtoList.</p>
            <p>Proposals are accepted until <strong>${listing!.deadlineDate}</strong>. As a verified agent serving ${listing!.city}, you have been selected to submit a sealed bid.</p>
            <p><a href="https://bidtolist.com/agents/browse">View and submit your proposal →</a></p>
            <p style="color:#6B7280;font-size:0.85em">You're receiving this because ${listing!.city} is in your service area on BidtoList.</p>
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
  if (subpath === "/stripe/create-checkout-session" && request.method === "POST") {
    const stripeKey = env.BIDTOLIST_STRIPE_SECRET_KEY;
    const priceId   = env.BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE;
    const origin    = env.BIDTOLIST_FRONTEND_ORIGIN ?? "http://localhost:3000";
    if (!stripeKey || !priceId) return jsonResp({ url: null, mock: true });
    const { feeId, proposalId } = await request.json() as { feeId?: string; proposalId?: string };
    if (!feeId) return jsonResp({ error: "feeId required" }, 400);
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });
    try {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { feeId, proposalId: proposalId ?? "" },
        success_url: `${origin}/agents/dashboard?fee_paid=1`,
        cancel_url:  `${origin}/agents/dashboard?fee_cancelled=1`,
      });
      return jsonResp({ url: session.url });
    } catch (err: any) {
      console.error("[bidtolist] Stripe create-session error:", err.message);
      return jsonResp({ error: "Failed to create checkout session" }, 500);
    }
  }

  // POST /api/bidtolist/stripe/webhook — raw body for Stripe HMAC
  if (subpath === "/stripe/webhook" && request.method === "POST") {
    const stripeKey     = env.BIDTOLIST_STRIPE_SECRET_KEY;
    const webhookSecret = env.BIDTOLIST_STRIPE_WEBHOOK_SECRET;
    if (!stripeKey || !webhookSecret) return jsonResp({ received: true });

    const rawBody = Buffer.from(await request.arrayBuffer());
    const sig     = request.headers.get("stripe-signature") ?? "";
    const stripe  = new Stripe(stripeKey, { apiVersion: "2024-11-20.acacia" as any });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err: any) {
      console.error("[bidtolist] Webhook signature verification failed:", err.message);
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const feeId   = session.metadata?.feeId;
      if (feeId) {
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
              console.log(`[bidtolist] Promo ${code} generated for request ${requestId}`);
            }
          }
        } catch (err: any) {
          console.error(`[bidtolist] markFeePaid failed for ${feeId}:`, err.message);
        }
      }
    }

    return jsonResp({ received: true });
  }

  return jsonResp({ error: "Not found" }, 404);
}
