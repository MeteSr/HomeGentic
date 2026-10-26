import { lazyActor } from "./lazyActor";
import { voiceAgentFetch } from "./voiceAgentHeaders";
import { idlFactory } from "@homegentic/shared/declarations/payment";
export { idlFactory };

const PAYMENT_CANISTER_ID = (process.env as any).PAYMENT_CANISTER_ID || "";
const VOICE_AGENT_URL     = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

// ─── TypeScript types & static plan data (re-exported from planConstants) ─────
//
// Kept in a separate module so that vi.mock("@/services/payment") in tests
// never accidentally suppresses PLANS / ANNUAL_PLANS — those are pure data
// with no canister dependency and should never need mocking.

// Types & static data live in planConstants so mocking @/services/payment
// never suppresses them.  Re-export types only (no value re-exports) so the
// payment mock surface stays limited to canister-facing functions.
// PlanTier, BillingCycle, GiftMeta are canister-adjacent types used in service
// signatures — re-exported here for convenience. Plan and PLANS are pure data
// and should be imported from planConstants directly, not from this module.
import type { PlanTier, BillingCycle, GiftMeta, Plan } from "./planConstants";
export type { PlanTier, BillingCycle, GiftMeta } from "./planConstants";
import { PLANS } from "./planConstants";

// ─── Actor ────────────────────────────────────────────────────────────────────


const getActor = lazyActor(idlFactory, PAYMENT_CANISTER_ID);

// ─── Service ──────────────────────────────────────────────────────────────────

export const paymentService = {
  /**
   * Subscribe to a paid tier.
   * For paid tiers: fetches a price quote from the canister, calls icrc2_approve
   * on the ICP ledger (triggers II popup), then calls subscribe on the payment
   * canister which pulls the payment via icrc2_transfer_from.
   * onStep is called with the current step label for UI feedback.
   */
  async subscribe(
    tier: PlanTier,
    onStep?: (step: "quoting" | "approving" | "confirming") => void,
  ): Promise<void> {
    const a = await getActor();

    if (tier !== "Free") {
      // Step 1: get ICP price quote with 5% buffer
      onStep?.("quoting");
      const quoteResult = await a.getPriceQuote({ [tier]: null });
      if ("err" in quoteResult) {
        throw new Error(Object.keys(quoteResult.err)[0]);
      }
      const amountE8s: bigint = BigInt(quoteResult.ok.toString());

      // Step 2: approve the payment canister to spend that amount
      onStep?.("approving");
      const { icpLedgerService } = await import("./icpLedger");
      await icpLedgerService.approve(PAYMENT_CANISTER_ID, amountE8s);

      // Step 3: call subscribe — canister pulls payment at current rate
      onStep?.("confirming");
    }

    const result = await a.subscribe({ [tier]: null });
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const detail = (result.err as any)[key];
      throw new Error(typeof detail === "string" ? detail : key);
    }
  },

  async getMySubscription(): Promise<{ tier: PlanTier; expiresAt: number | null; cancelledAt: number | null }> {
    if (typeof window !== "undefined" && (window as any).__e2e_subscription) {
      return { cancelledAt: null, ...(window as any).__e2e_subscription };
    }
    if (!PAYMENT_CANISTER_ID) return { tier: "Free", expiresAt: null, cancelledAt: null };
    let result: any;
    try {
      const a = await getActor();
      result = await a.getMySubscription();
    } catch (e: any) {
      // IC0301: canister exists in .env but not on the network (stale ID after
      // a local network reset). Treat identically to "not deployed" — only on
      // non-production networks where this is expected.
      const isStale = String(e).includes("IC0301") || String(e).includes("not found");
      if (isStale && (process.env as any).DFX_NETWORK !== "ic") {
        return { tier: "Free", expiresAt: null, cancelledAt: null };
      }
      throw e;
    }
    if ("err" in result) {
      // NotFound = no subscription record yet (e.g. mid-checkout).
      // Any other error (Unauthorized, Paused, etc.) is a real failure: throw
      // so callers don't silently treat a paid user as unsubscribed.
      if (!("NotFound" in (result.err as any))) {
        const key = Object.keys(result.err as any)[0];
        throw new Error(`getMySubscription: ${key}`);
      }
      return { tier: "Free", expiresAt: null, cancelledAt: null };
    }
    const sub = result.ok;
    const tierKey       = Object.keys(sub.tier)[0] as PlanTier;
    const expiresNs     = Number(sub.expiresAt);
    const cancelledNs   = sub.cancelledAt?.[0] != null ? Number(sub.cancelledAt[0]) : null;
    return {
      tier:        tierKey,
      expiresAt:   expiresNs === 0 ? null : expiresNs / 1_000_000,
      cancelledAt: cancelledNs != null ? cancelledNs / 1_000_000 : null,
    };
  },

  /** Activate a subscription tier on-chain. Returns dashboard URL. */
  async initiate(
    tier: PlanTier,
    onStep?: (step: "quoting" | "approving" | "confirming") => void,
  ): Promise<{ url: string }> {
    await this.subscribe(tier, onStep);
    return { url: "/dashboard" };
  },

  /** Subscribe to the annual Pro plan. Sets expiresAt = now + 365 days on-chain. */
  async subscribeAnnual(
    tier: "Pro",
    onStep?: (step: "quoting" | "approving" | "confirming") => void,
  ): Promise<void> {
    return this.subscribe(tier, onStep);
  },

  async cancel(): Promise<{ expiresAt: number | null }> {
    // Stop Stripe from renewing first (the Worker sets cancel_at_period_end on
    // the caller's subscriptions); only then mark the canister record, so a
    // failure here never shows "cancelled" while the card keeps being charged.
    const resp = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/stripe/cancel-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error ?? "Could not cancel the subscription");
    }
    const a = await getActor();
    const result = await a.cancelSubscription();
    if ("err" in result) {
      const key    = Object.keys(result.err)[0];
      const detail = (result.err as any)[key];
      throw new Error(typeof detail === "string" ? detail : key);
    }
    const expiresNs = Number(result.ok.expiresAt);
    return { expiresAt: expiresNs === 0 ? null : expiresNs / 1_000_000 };
  },

  /** Admin: set a user's subscription tier. Every canister reads tiers from here. */
  async grantSubscription(userPrincipal: string, tier: PlanTier): Promise<void> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const result = await a.grantSubscription(P.fromText(userPrincipal), { [tier]: null });
    if ("err" in result) {
      const key    = Object.keys(result.err)[0];
      const detail = (result.err as any)[key];
      throw new Error(typeof detail === "string" ? detail : key);
    }
  },

  /** Record cancellation timestamp in localStorage (8.3.2). */
  recordCancellation(): void {
    localStorage.setItem("homegentic_cancelled_at", String(Date.now()));
  },

  /** Returns { cancelledAt } if the account was cancelled, null otherwise (8.3.2). */
  getCancellationInfo(): { cancelledAt: number } | null {
    const raw = localStorage.getItem("homegentic_cancelled_at");
    if (!raw) return null;
    return { cancelledAt: Number(raw) };
  },

  async hasPaidFor(_feature: string): Promise<boolean> {
    const sub = await this.getMySubscription();
    return sub.tier === "Pro" || sub.tier === "ContractorPro";
  },

  getPlan(tier: PlanTier): Plan {
    return PLANS.find((p) => p.tier === tier) ?? PLANS[0];
  },

  async getPricing(tier: PlanTier): Promise<{ priceUSD: number; periodDays: number; propertyLimit: number; photosPerJob: number; quoteRequestsPerMonth: number } | null> {
    const a = await getActor();
    const result = await a.getPricing({ [tier]: null });
    return {
      priceUSD:              Number(result.priceUSD),
      periodDays:            Number(result.periodDays),
      propertyLimit:         Number(result.propertyLimit),
      photosPerJob:          Number(result.photosPerJob),
      quoteRequestsPerMonth: Number(result.quoteRequestsPerMonth),
    };
  },

  async getAllPricing(): Promise<Array<{ tier: PlanTier; priceUSD: number; periodDays: number; propertyLimit: number; photosPerJob: number; quoteRequestsPerMonth: number }>> {
    const a = await getActor();
    const results = await a.getAllPricing();
    return (results as any[]).map((r) => ({
      tier:                  Object.keys(r.tier)[0] as PlanTier,
      priceUSD:              Number(r.priceUSD),
      periodDays:            Number(r.periodDays),
      propertyLimit:         Number(r.propertyLimit),
      photosPerJob:          Number(r.photosPerJob),
      quoteRequestsPerMonth: Number(r.quoteRequestsPerMonth),
    }));
  },

  reset() {
    getActor.reset();
  },

  // ── Stripe ────────────────────────────────────────────────────────────────────

  /**
   * Create a Stripe Checkout Session and redirect the browser to it.
   * Returns the session ID (already in the success URL as ?session_id=...).
   * Pass `gift` when a realtor is buying on behalf of a recipient.
   */
  async startStripeCheckout(
    tier:    PlanTier,
    billing: BillingCycle,
    gift?:   GiftMeta,
  ): Promise<void> {
    // M-6: Stripe runs only in the voice Worker (its secret key never lives
    // in canister memory). The Worker takes the principal from the
    // x-agent-session token, not the body.
    const successUrl = `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${window.location.origin}/payment-failure`;
    const body: Record<string, unknown> = { tier, billing, successUrl, cancelUrl };
    if (gift) body.gift = gift;
    const resp = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/stripe/create-checkout`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Checkout failed");
    window.location.href = data.url;
  },

  /**
   * Verify a completed Stripe session (called from /payment-success).
   * Returns { type: "subscription", sub } for self-upgrades or
   * { type: "gift", giftToken } for gift purchases.
   */
  async verifyStripeSession(
    sessionId: string,
  ): Promise<{ type: "subscription"; tier?: string; billing?: string } | { type: "gift"; giftToken: string }> {
    // M-6: verified by the voice Worker, which activates the subscription (or
    // registers the gift) in the payment canister through its relay role.
    const resp = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/stripe/verify-session`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Verification failed");
    return data as { type: "subscription"; tier?: string; billing?: string } | { type: "gift"; giftToken: string };
  },

  /** Redeem a pending gift using the token emailed to the recipient. */
  async redeemGift(giftToken: string): Promise<void> {
    const a = await getActor();
    const result = await a.redeemGift(giftToken);
    if ("err" in result) {
      const key    = Object.keys(result.err)[0];
      const detail = (result.err as any)[key];
      throw new Error(typeof detail === "string" ? detail : key);
    }
  },

  // ── Agent credit top-ups (#89) ────────────────────────────────────────────────

  /** Returns the caller's remaining agent credit balance (0 if none or expired). */
  /** When the caller got a free Pro year for accepting a home's record at closing (ms), or null. */
  async getMyHandoffGrant(): Promise<number | null> {
    if (typeof window !== "undefined" && "__e2e_handoff_grant" in (window as any)) {
      return (window as any).__e2e_handoff_grant ?? null;
    }
    if (!PAYMENT_CANISTER_ID) return null;
    const a = await getActor();
    const r = await a.getMyHandoffGrant() as [] | [bigint];
    return r.length ? Number(r[0] / 1_000_000n) : null;
  },

  async getMyAgentCredits(): Promise<number> {
    if ((window as any).__e2e_agent_credits != null) {
      return Number((window as any).__e2e_agent_credits);
    }
    const a = await getActor();
    const result = await a.getMyAgentCredits();
    return Number(result);
  },

  /**
   * Start a Stripe Checkout session to purchase an agent credit pack.
   * Redirects the browser to the Stripe-hosted payment page on success.
   * `packSize` must be 25 or 100.
   */
  async startCreditPackCheckout(packSize: 25 | 100): Promise<void> {
    // Credits go to the session's principal (x-agent-session), never a body field.
    const successUrl = `${window.location.origin}/payment-success?credit_session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl  = `${window.location.origin}/payment-failure`;
    const resp = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/stripe/create-credit-checkout`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ packSize, successUrl, cancelUrl }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error ?? "Checkout failed");
    window.location.href = data.url;
  },
};
