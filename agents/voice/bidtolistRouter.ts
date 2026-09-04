/**
 * BidtoList sub-router — mounted at /api/bidtolist in HomeGentic's voice server.
 *
 * Replaces the two standalone BidtoList Express servers:
 *   agents/email/server.ts         (ports 3002)
 *   agents/stripe-webhook/server.ts (port 3003)
 *
 * Environment variables (add to HomeGentic Railway service):
 *   BIDTOLIST_RESEND_API_KEY            Resend API key for BidtoList
 *   BIDTOLIST_RESEND_FROM               From address (default noreply@bidtolist.com)
 *   BIDTOLIST_FRONTEND_ORIGIN           https://bidtolist.com (used in Stripe redirects)
 *   BIDTOLIST_STRIPE_SECRET_KEY         sk_live_...
 *   BIDTOLIST_STRIPE_WEBHOOK_SECRET     whsec_...
 *   BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE price_... ($295 one-time fee)
 *   BIDTOLIST_LISTING_CANISTER_ID       listing canister
 *   BIDTOLIST_AGENT_CANISTER_ID         agent canister
 *   BIDTOLIST_FEE_CANISTER_ID           fee canister
 *   BIDTOLIST_IDENTITY_SEED             64-char hex Ed25519 seed for admin identity
 *   BIDTOLIST_ICP_HOST                  https://ic0.app (or http://localhost:4943 in dev)
 *   HOMEGENTIC_CANISTER_ID              HomeGentic payment canister (createDiscountCode)
 *   HOMEGENTIC_ICP_HOST                 https://ic0.app
 */

import { Router } from "express";
import express from "express";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import Stripe from "stripe";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { IDL } from "@icp-sdk/core/candid";

const FROM                   = process.env.BIDTOLIST_RESEND_FROM          || "noreply@bidtolist.com";
const BIDTOLIST_ORIGIN       = process.env.BIDTOLIST_FRONTEND_ORIGIN      || "http://localhost:3000";
const LISTING_CANISTER_ID    = process.env.BIDTOLIST_LISTING_CANISTER_ID  || "";
const AGENT_CANISTER_ID      = process.env.BIDTOLIST_AGENT_CANISTER_ID    || "";
const FEE_CANISTER_ID        = process.env.BIDTOLIST_FEE_CANISTER_ID      || "";
const IDENTITY_SEED          = process.env.BIDTOLIST_IDENTITY_SEED        || "";
const ICP_HOST               = process.env.BIDTOLIST_ICP_HOST             || "https://ic0.app";
const HOMEGENTIC_CANISTER_ID = process.env.HOMEGENTIC_CANISTER_ID         || "";
const HOMEGENTIC_ICP_HOST    = process.env.HOMEGENTIC_ICP_HOST            || "https://ic0.app";

const resend = new Resend(process.env.BIDTOLIST_RESEND_API_KEY || "");

const stripe = process.env.BIDTOLIST_STRIPE_SECRET_KEY
  ? new Stripe(process.env.BIDTOLIST_STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" })
  : null;
const WEBHOOK_SECRET = process.env.BIDTOLIST_STRIPE_WEBHOOK_SECRET || "";
const PRICE_ID       = process.env.BIDTOLIST_STRIPE_PRICE_PLATFORM_FEE || "";

// ── ICP IDL factories ─────────────────────────────────────────────────────────

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

function makeIdentity() {
  const seed = Buffer.from(IDENTITY_SEED, "hex");
  return Ed25519KeyIdentity.fromSecretKey(seed);
}

async function createListingActor() {
  if (!LISTING_CANISTER_ID || !IDENTITY_SEED) return null;
  const agent = await HttpAgent.create({ identity: makeIdentity(), host: ICP_HOST });
  if (ICP_HOST.includes("localhost")) await agent.fetchRootKey().catch(() => {});
  return Actor.createActor(listingIdlFactory, { agent, canisterId: LISTING_CANISTER_ID });
}

async function createAgentActor() {
  if (!AGENT_CANISTER_ID || !IDENTITY_SEED) return null;
  const agent = await HttpAgent.create({ identity: makeIdentity(), host: ICP_HOST });
  if (ICP_HOST.includes("localhost")) await agent.fetchRootKey().catch(() => {});
  return Actor.createActor(agentIdlFactory, { agent, canisterId: AGENT_CANISTER_ID });
}

function createFeeActor() {
  if (!FEE_CANISTER_ID || !IDENTITY_SEED) return null;
  const seed     = Buffer.from(IDENTITY_SEED, "hex");
  const identity = Ed25519KeyIdentity.fromSecretKey(seed);
  const agent    = new HttpAgent({ identity, host: ICP_HOST });
  if (ICP_HOST.includes("localhost")) agent.fetchRootKey().catch(() => {});
  return Actor.createActor(feeIdlFactory, { agent, canisterId: FEE_CANISTER_ID });
}

function createHomegenticActor() {
  if (!HOMEGENTIC_CANISTER_ID || !IDENTITY_SEED) return null;
  const seed     = Buffer.from(IDENTITY_SEED, "hex");
  const identity = Ed25519KeyIdentity.fromSecretKey(seed);
  const agent    = new HttpAgent({ identity, host: HOMEGENTIC_ICP_HOST });
  if (HOMEGENTIC_ICP_HOST.includes("localhost")) agent.fetchRootKey().catch(() => {});
  return Actor.createActor(homegenticIdlFactory, { agent, canisterId: HOMEGENTIC_CANISTER_ID });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchListing(requestId: string): Promise<{ homeownerEmail: string; city: string; deadlineDate: string } | null> {
  const actor = await createListingActor();
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
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars = 2^5
  const bytes = randomBytes(6);
  // chars.length is 32 (a power of 2), so masking with 31 gives a perfectly
  // uniform distribution — no modulo bias. Avoids CodeQL js/biased-cryptographic-random.
  return "BIDTOLIST-" + Array.from(bytes).map(b => chars[b & 31]).join("");
}

async function createHomegenticCode(code: string): Promise<void> {
  const actor = createHomegenticActor();
  if (!actor) { console.warn("[bidtolist] HomeGentic ICP not configured — skipping discount code"); return; }
  const ninetyDaysNs = BigInt(90) * BigInt(24 * 60 * 60 * 1_000_000_000);
  const expiresAt = BigInt(Date.now()) * BigInt(1_000_000) + ninetyDaysNs;
  const result = await (actor as any).createDiscountCode(code, 50, expiresAt) as any;
  if (result.err) console.warn("[bidtolist] createDiscountCode error:", JSON.stringify(result.err));
}

async function sendHomeownerCodeEmail(requestId: string, code: string): Promise<void> {
  const actor = await createListingActor();
  if (!actor) { console.warn("[bidtolist] ICP not wired — skipping homeowner-code email"); return; }
  const result = await (actor as any).getBidRequest(requestId) as any;
  if ("err" in result) throw new Error(`getBidRequest error: ${JSON.stringify(result.err)}`);
  const { homeownerEmail, city } = result.ok;
  if (!homeownerEmail) throw new Error("homeownerEmail empty on record");
  const checkoutUrl = `https://homegentic.com/checkout?bidtolist_code=${encodeURIComponent(code)}`;
  await resend.emails.send({
    from: FROM,
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

// ── Router ────────────────────────────────────────────────────────────────────

export const bidtolistRouter = Router();

// POST /api/bidtolist/email/new-proposal
// Notify homeowner that a new proposal has been submitted.
bidtolistRouter.post("/email/new-proposal", async (req, res) => {
  const { requestId } = req.body as { requestId: string };
  if (!requestId) { res.status(400).json({ error: "requestId required" }); return; }

  let listing: Awaited<ReturnType<typeof fetchListing>>;
  try {
    listing = await fetchListing(requestId);
  } catch (err) {
    console.error("[bidtolist] fetchListing failed (new-proposal):", err);
    res.status(502).json({ error: "canister call failed" }); return;
  }
  if (!listing) { res.json({ ok: true, skipped: true }); return; }
  if (!listing.homeownerEmail) { res.status(422).json({ error: "homeownerEmail empty on record" }); return; }

  try {
    await resend.emails.send({
      from: FROM,
      to: listing.homeownerEmail,
      subject: `New proposal on your ${listing.city} listing — BidtoList`,
      html: `
        <p>Good news — a licensed agent has submitted a proposal for your <strong>${listing.city}</strong> listing.</p>
        <p>Proposals are sealed until <strong>${listing.deadlineDate}</strong>. You'll be able to review and compare all offers once the deadline passes.</p>
        <p><a href="https://bidtolist.com/my-bids">View your listing →</a></p>
        <p style="color:#6B7280;font-size:0.85em">You're receiving this because you posted a listing on BidtoList.</p>
      `,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[bidtolist] Resend error (new-proposal):", err);
    res.status(500).json({ error: "email send failed" });
  }
});

// POST /api/bidtolist/email/proposal-result
// Notify agent that their proposal was accepted or rejected.
bidtolistRouter.post("/email/proposal-result", async (req, res) => {
  const { agentEmail, agentName, city, won } = req.body as {
    agentEmail: string; agentName: string; city: string; won: boolean;
  };
  if (!agentEmail) { res.status(400).json({ error: "agentEmail required" }); return; }

  // H-03: validate email format; sanitize text fields to prevent header injection.
  // Bound length before regex to prevent polynomial backtracking on crafted input.
  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
  if (agentEmail && (agentEmail.length > 320 || !emailRegex.test(agentEmail))) {
    res.status(400).json({ error: "Invalid agentEmail format" });
    return;
  }
  // Strip control characters from text fields
  const safeAgentName = agentName ? agentName.replace(/[\r\n\t]/g, " ").slice(0, 200) : "";
  const safeCity = city ? city.replace(/[\r\n\t]/g, " ").slice(0, 100) : "";
  // NOTE: ideally agentEmail should be looked up from the ICP agent canister by agentId
  // rather than accepted from the request body, to fully prevent phishing abuse.

  const subject = won
    ? `Congratulations — you won the listing in ${safeCity} — BidtoList`
    : `Listing result for ${safeCity} — BidtoList`;
  const html = won
    ? `<p>Hi ${safeAgentName},</p>
       <p>Congratulations! The homeowner has selected you as their agent for the <strong>${safeCity}</strong> listing.</p>
       <p>A platform fee of <strong>$295.00</strong> is due. You'll receive an invoice shortly.</p>
       <p><a href="https://bidtolist.com/agents/dashboard">View your dashboard →</a></p>`
    : `<p>Hi ${safeAgentName},</p>
       <p>The homeowner for the <strong>${safeCity}</strong> listing has selected another agent.</p>
       <p>Keep an eye on new listings — there are always more opportunities.</p>
       <p><a href="https://bidtolist.com/agents/browse">Browse open listings →</a></p>`;

  try {
    await resend.emails.send({ from: FROM, to: agentEmail, subject, html });
    res.json({ ok: true });
  } catch (err) {
    console.error("[bidtolist] Resend error (proposal-result):", err);
    res.status(500).json({ error: "email send failed" });
  }
});

// POST /api/bidtolist/email/agent-verified
// Notify agent that their account has been verified by admin.
bidtolistRouter.post("/email/agent-verified", async (req, res) => {
  const { agentEmail, agentName } = req.body as { agentEmail: string; agentName: string };
  if (!agentEmail) { res.status(400).json({ error: "agentEmail required" }); return; }

  // H-03: validate email format; sanitize text fields to prevent header injection.
  // Bound length before regex to prevent polynomial backtracking on crafted input.
  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}$/;
  if (agentEmail && (agentEmail.length > 320 || !emailRegex.test(agentEmail))) {
    res.status(400).json({ error: "Invalid agentEmail format" });
    return;
  }
  // Strip control characters from text fields
  const safeAgentName = agentName ? agentName.replace(/[\r\n\t]/g, " ").slice(0, 200) : "";
  // NOTE: ideally agentEmail should be looked up from the ICP agent canister by agentId
  // rather than accepted from the request body, to fully prevent phishing abuse.

  try {
    await resend.emails.send({
      from: FROM,
      to: agentEmail,
      subject: "Your BidtoList account is verified",
      html: `
        <p>Hi ${safeAgentName},</p>
        <p>Your BidtoList agent account has been verified. You can now browse open listing requests and submit sealed proposals.</p>
        <p><a href="https://bidtolist.com/agents/browse">Browse listings →</a></p>
      `,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("[bidtolist] Resend error (agent-verified):", err);
    res.status(500).json({ error: "email send failed" });
  }
});

// POST /api/bidtolist/email/new-listing
// Broadcast new listing to up to 10 verified agents serving the listing city.
bidtolistRouter.post("/email/new-listing", async (req, res) => {
  const { requestId } = req.body as { requestId: string };
  if (!requestId) { res.status(400).json({ error: "requestId required" }); return; }

  let listing: Awaited<ReturnType<typeof fetchListing>>;
  try {
    listing = await fetchListing(requestId);
  } catch (err) {
    console.error("[bidtolist] fetchListing failed (new-listing):", err);
    res.status(502).json({ error: "canister call failed" }); return;
  }
  if (!listing) { res.json({ ok: true, skipped: true }); return; }

  const agentActor = await createAgentActor();
  if (!agentActor) { console.warn("[bidtolist] Agent canister not wired — skipping broadcast"); res.json({ ok: true, skipped: true }); return; }

  let agents: any[];
  try {
    agents = await (agentActor as any).getAgentsForCity(listing.city, 10) as any[];
  } catch (err) {
    console.error("[bidtolist] getAgentsForCity failed:", err);
    res.status(502).json({ error: "agent canister call failed" }); return;
  }

  if (agents.length === 0) {
    console.log(`[bidtolist] No matching agents for city "${listing.city}"`);
    res.json({ ok: true, sent: 0 }); return;
  }

  const results = await Promise.allSettled(
    agents.map((agent: any) =>
      resend.emails.send({
        from: FROM,
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
  console.log(`[bidtolist] Broadcast sent for "${listing.city}" listing ${requestId} to ${sent} agents`);
  res.json({ ok: true, sent });
});

// POST /api/bidtolist/stripe/create-checkout-session
bidtolistRouter.post("/stripe/create-checkout-session", async (req, res) => {
  const { feeId, proposalId } = req.body as { feeId?: string; proposalId?: string };
  if (!feeId) { res.status(400).json({ error: "feeId required" }); return; }

  if (!stripe || !PRICE_ID) { res.json({ url: null, mock: true }); return; }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      metadata: { feeId, proposalId: proposalId ?? "" },
      success_url: `${BIDTOLIST_ORIGIN}/agents/dashboard?fee_paid=1`,
      cancel_url:  `${BIDTOLIST_ORIGIN}/agents/dashboard?fee_cancelled=1`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[bidtolist] Stripe create-session error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// POST /api/bidtolist/stripe/webhook
// Raw body required — registered with express.raw() at the route level.
// The global JSON body-parser in server.ts is skipped for this path.
bidtolistRouter.post("/stripe/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) { res.json({ received: true }); return; }

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[bidtolist] Webhook signature verification failed:", err.message);
    // Return JSON (not raw text) so err.message is never interpolated into an HTML context.
    res.status(400).json({ error: "Webhook signature verification failed" }); return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const feeId   = session.metadata?.feeId;

    if (feeId) {
      try {
        const feeActor = createFeeActor();
        if (!feeActor) { console.warn("[bidtolist] Fee canister not configured — skipping markFeePaid"); }
        else {
          const result = await (feeActor as any).markFeePaid(feeId) as { ok?: any; err?: unknown };
          if (result.err) throw new Error(`fee canister error: ${JSON.stringify(result.err)}`);
          const requestId = result.ok?.requestId ?? "";
          console.log(`[bidtolist] Fee ${feeId} marked paid`);

          if (requestId) {
            const code = generateDiscountCode();
            createHomegenticCode(code).catch((e) =>
              console.error("[bidtolist] createHomegenticCode failed:", e?.message)
            );
            sendHomeownerCodeEmail(requestId, code).catch((e) =>
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

  res.json({ received: true });
});
