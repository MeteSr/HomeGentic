/**
 * Bid to List fee router — mounted at /api/listing-fee in the HomeGentic voice
 * server. Charges the winning agent a one-time platform fee (configurable via
 * listing.getPlatformFee(), default $399) and releases both sides' identity
 * only once Stripe confirms the charge settled — invariant 04 (charge then
 * release; a declined charge leaves the auction fully masked and live).
 *
 * Ported from the standalone BidtoList integration (agents/voice/bidtolistRouter.ts),
 * fixed on the way in:
 *   - the agent's notification email is resolved server-side from the agent
 *     canister by principal, never accepted from the request body (that file's
 *     own code comment flagged this as a phishing gap — H-03-shaped issue)
 *   - the fee amount comes from the listing canister's configured platform fee,
 *     not a hardcoded Stripe Price ID amount
 *
 * Environment variables:
 *   LISTING_STRIPE_SECRET_KEY       sk_...
 *   LISTING_STRIPE_WEBHOOK_SECRET   whsec_...
 *   LISTING_CANISTER_ID             listing canister (shared with the rest of HomeGentic)
 *   AGENT_CANISTER_ID               agent canister
 *   FEE_CANISTER_ID                 fee canister
 *   LISTING_FEE_IDENTITY_SEED       64-char hex Ed25519 seed for the admin identity
 *                                   used for markFeePaid / markListingFeePaid — this
 *                                   principal must be an admin on both canisters.
 *   ICP_HOST                        https://ic0.app (or http://localhost:4943 in dev)
 *   FRONTEND_ORIGIN                 used for Stripe success/cancel redirects
 */

import { Router } from "express";
import express from "express";
import Stripe from "stripe";
import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { IDL } from "@icp-sdk/core/candid";

const LISTING_CANISTER_ID = process.env.LISTING_CANISTER_ID       || "";
const AGENT_CANISTER_ID   = process.env.AGENT_CANISTER_ID         || "";
const FEE_CANISTER_ID     = process.env.FEE_CANISTER_ID           || "";
const IDENTITY_SEED       = process.env.LISTING_FEE_IDENTITY_SEED || "";
const ICP_HOST             = process.env.ICP_HOST                  || "https://ic0.app";
const FRONTEND_ORIGIN      = process.env.FRONTEND_ORIGIN           || "http://localhost:3000";

const stripe = process.env.LISTING_STRIPE_SECRET_KEY
  ? new Stripe(process.env.LISTING_STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" })
  : null;
const WEBHOOK_SECRET = process.env.LISTING_STRIPE_WEBHOOK_SECRET || "";

// ── ICP IDL factories (only the fields this router needs) ─────────────────────

const listingIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, InvalidInput: I.Text,
    AlreadyCancelled: I.Null, DeadlinePassed: I.Null, SlotsFull: I.Null,
  });
  return I.Service({
    getPlatformFee: I.Func([], [I.Nat], ["query"]),
    markListingFeePaid: I.Func([I.Text, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
  });
};

const agentIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const AgentProfile = I.Record({
    id: I.Principal, name: I.Text, brokerage: I.Text, email: I.Text,
  });
  return I.Service({
    getProfile: I.Func([I.Principal], [I.Opt(AgentProfile)], ["query"]),
  });
};

const feeIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const FeeStatus = I.Variant({ Owed: I.Null, Invoiced: I.Null, Paid: I.Null, Waived: I.Null });
  const FeeRecord = I.Record({
    id: I.Text, requestId: I.Text, proposalId: I.Text,
    agentId: I.Principal, homeownerId: I.Principal, amountCents: I.Nat,
    status: FeeStatus, createdAt: I.Int, updatedAt: I.Int,
  });
  const Error = I.Variant({ NotFound: I.Null, NotAuthorized: I.Null, AlreadyExists: I.Null, InvalidInput: I.Text });
  return I.Service({
    markFeePaid: I.Func([I.Text], [I.Variant({ ok: FeeRecord, err: Error })], []),
  });
};

// ── ICP actors ─────────────────────────────────────────────────────────────────

function makeIdentity() {
  const seed = Buffer.from(IDENTITY_SEED, "hex");
  return Ed25519KeyIdentity.fromSecretKey(seed);
}

async function createActor<T>(canisterId: string, idlFactory: any): Promise<T | null> {
  if (!canisterId || !IDENTITY_SEED) return null;
  const agent = await HttpAgent.create({ identity: makeIdentity(), host: ICP_HOST });
  if (ICP_HOST.includes("localhost")) await agent.fetchRootKey().catch(() => {});
  return Actor.createActor(idlFactory, { agent, canisterId }) as T;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const listingFeeRouter = Router();

// GET /api/listing-fee/amount — current configured platform fee, in cents.
listingFeeRouter.get("/amount", async (_req, res) => {
  try {
    const actor = await createActor<any>(LISTING_CANISTER_ID, listingIdlFactory);
    if (!actor) { res.json({ amountCents: 39900, mock: true }); return; }
    const amountCents = Number(await actor.getPlatformFee());
    res.json({ amountCents });
  } catch (err: any) {
    console.error("[listing-fee] amount lookup failed:", err.message);
    res.status(502).json({ error: "amount lookup failed" });
  }
});

// POST /api/listing-fee/stripe/create-checkout-session
// body: { feeId, proposalId, requestId }. feeId comes from listing.acceptProposal().
listingFeeRouter.post("/stripe/create-checkout-session", async (req, res) => {
  const { feeId, proposalId, requestId } = req.body as { feeId?: string; proposalId?: string; requestId?: string };
  if (!feeId || !proposalId || !requestId) {
    res.status(400).json({ error: "feeId, proposalId and requestId are required" });
    return;
  }

  if (!stripe) { res.json({ url: null, mock: true }); return; }

  try {
    const listingActor = await createActor<any>(LISTING_CANISTER_ID, listingIdlFactory);
    const amountCents = listingActor ? Number(await listingActor.getPlatformFee()) : 39900;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: { name: "Bid to List — selection fee" },
        },
        quantity: 1,
      }],
      metadata: { feeId, proposalId, requestId },
      success_url: `${FRONTEND_ORIGIN}/listing/${requestId}?fee_paid=1`,
      cancel_url:  `${FRONTEND_ORIGIN}/listing/${requestId}?fee_cancelled=1`,
    });
    res.json({ url: session.url });
  } catch (err: any) {
    console.error("[listing-fee] Stripe create-session error:", err.message);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// POST /api/listing-fee/stripe/webhook
// Raw body required — the JSON body-parser is bypassed for this path in server.ts.
// This is the ONLY trigger for identity release (invariant 04) — a declined or
// abandoned checkout leaves the fee Owed and the auction fully masked and live.
listingFeeRouter.post("/stripe/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) { res.json({ received: true }); return; }

  const sig = req.headers["stripe-signature"] as string;
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err: any) {
    console.error("[listing-fee] Webhook signature verification failed:", err.message);
    res.status(400).json({ error: "Webhook signature verification failed" });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { feeId, proposalId, requestId } = (session.metadata ?? {}) as Record<string, string>;

    if (feeId && proposalId && requestId) {
      try {
        const feeActor = await createActor<any>(FEE_CANISTER_ID, feeIdlFactory);
        if (!feeActor) { console.warn("[listing-fee] Fee canister not configured — skipping markFeePaid"); }
        else {
          const feeResult = await feeActor.markFeePaid(feeId);
          if ("err" in feeResult) throw new Error(`fee canister error: ${JSON.stringify(feeResult.err)}`);

          const listingActor = await createActor<any>(LISTING_CANISTER_ID, listingIdlFactory);
          if (!listingActor) { console.warn("[listing-fee] Listing canister not configured — skipping markListingFeePaid"); }
          else {
            const listingResult = await listingActor.markListingFeePaid(requestId, proposalId);
            if ("err" in listingResult) throw new Error(`listing canister error: ${JSON.stringify(listingResult.err)}`);
            console.log(`[listing-fee] Fee ${feeId} paid, request ${requestId} awarded to proposal ${proposalId}`);
          }
        }
      } catch (err: any) {
        // Charge already settled with Stripe — a failure here must be retried
        // (webhook retries on non-2xx) rather than silently dropped, since the
        // agent has been charged and is owed the unmask.
        console.error(`[listing-fee] settlement failed for fee ${feeId}:`, err.message);
        res.status(500).json({ error: "settlement failed, will retry" });
        return;
      }
    }
  }

  res.json({ received: true });
});

/**
 * Resolves an agent's notification email server-side by principal — never
 * from client-supplied request bodies. Used by whatever email/notification
 * flow announces "you won" (kept separate from this router's payment path).
 */
export async function resolveAgentEmail(agentPrincipal: string): Promise<string | null> {
  const actor = await createActor<any>(AGENT_CANISTER_ID, agentIdlFactory);
  if (!actor) return null;
  const { Principal } = await import("@dfinity/principal");
  const raw = await actor.getProfile(Principal.fromText(agentPrincipal));
  return raw.length > 0 ? raw[0].email : null;
}
