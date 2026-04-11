import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const PAYMENT_CANISTER_ID = (process.env as any).PAYMENT_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const Tier = IDL.Variant({
    Free: IDL.Null, Pro: IDL.Null, Premium: IDL.Null, ContractorFree: IDL.Null, ContractorPro: IDL.Null,
  });
  const BillingPeriod = IDL.Variant({ Monthly: IDL.Null, Yearly: IDL.Null });
  const Subscription = IDL.Record({
    owner:     IDL.Principal,
    tier:      Tier,
    expiresAt: IDL.Int,
    createdAt: IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    PaymentFailed: IDL.Text,
    RateLimited:   IDL.Null,
    InvalidInput:  IDL.Text,
  });
  const PricingInfo = IDL.Record({
    tier:                  Tier,
    priceUSD:              IDL.Nat,
    periodDays:            IDL.Nat,
    propertyLimit:         IDL.Nat,
    photosPerJob:          IDL.Nat,
    quoteRequestsPerMonth: IDL.Nat,
  });
  const SubscriptionStats = IDL.Record({
    total:           IDL.Nat,
    free:            IDL.Nat,
    pro:             IDL.Nat,
    premium:         IDL.Nat,
    contractorFree:  IDL.Nat,
    contractorPro:   IDL.Nat,
    activePaid:      IDL.Nat,
    estimatedMrrUsd: IDL.Nat,
  });
  const GiftMeta = IDL.Record({
    recipientEmail: IDL.Text,
    recipientName:  IDL.Text,
    senderName:     IDL.Text,
    giftMessage:    IDL.Text,
    deliveryDate:   IDL.Text,
  });
  const CheckoutSession = IDL.Record({ id: IDL.Text, url: IDL.Text });
  const PendingGift = IDL.Record({
    giftToken:      IDL.Text,
    tier:           Tier,
    billing:        BillingPeriod,
    recipientEmail: IDL.Text,
    recipientName:  IDL.Text,
    senderName:     IDL.Text,
    giftMessage:    IDL.Text,
    deliveryDate:   IDL.Text,
    createdAt:      IDL.Int,
    redeemedBy:     IDL.Opt(IDL.Principal),
  });
  const StripePriceIds = IDL.Record({
    proMonthly:           IDL.Text,
    proYearly:            IDL.Text,
    premiumMonthly:       IDL.Text,
    premiumYearly:        IDL.Text,
    contractorProMonthly: IDL.Text,
    contractorProYearly:  IDL.Text,
  });
  const StripeConfig = IDL.Record({
    secretKey:  IDL.Text,
    priceIds:   StripePriceIds,
    successUrl: IDL.Text,
    cancelUrl:  IDL.Text,
  });
  return IDL.Service({
    subscribe: IDL.Func(
      [Tier],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    getPriceQuote: IDL.Func(
      [Tier],
      [IDL.Variant({ ok: IDL.Nat, err: Error })],
      []
    ),
    grantSubscription: IDL.Func(
      [IDL.Principal, Tier],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    getMySubscription: IDL.Func(
      [],
      [IDL.Variant({ ok: Subscription, err: Error })],
      ["query"]
    ),
    getPricing: IDL.Func(
      [Tier],
      [PricingInfo],
      ["query"]
    ),
    getAllPricing: IDL.Func(
      [],
      [IDL.Vec(PricingInfo)],
      ["query"]
    ),
    getSubscriptionStats: IDL.Func(
      [],
      [SubscriptionStats],
      ["query"]
    ),
    // ── Stripe ──
    configureStripe: IDL.Func(
      [StripeConfig],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    isStripeConfigured: IDL.Func(
      [],
      [IDL.Bool],
      ["query"]
    ),
    createStripeCheckoutSession: IDL.Func(
      [Tier, BillingPeriod, IDL.Opt(GiftMeta)],
      [IDL.Variant({ ok: CheckoutSession, err: Error })],
      []
    ),
    verifyStripeSession: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    redeemGift: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    listPendingGifts: IDL.Func(
      [],
      [IDL.Variant({ ok: IDL.Vec(PendingGift), err: Error })],
      ["query"]
    ),
    initAdmins: IDL.Func(
      [IDL.Vec(IDL.Principal)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type PlanTier     = "Free" | "Pro" | "Premium" | "ContractorFree" | "ContractorPro";
export type BillingCycle = "Monthly" | "Yearly";

export interface GiftMeta {
  recipientEmail: string;
  recipientName:  string;
  senderName:     string;
  giftMessage:    string;
  deliveryDate:   string;
}

export interface Plan {
  tier:           PlanTier;
  price:          number;
  period:         "month" | "year" | "free";
  features:       string[];
  propertyLimit:  number;
  photosPerJob:   number;
  quoteRequests:  number;
}

export const PLANS: Plan[] = [
  {
    tier: "Free",
    price: 0,
    period: "free",
    features: [
      "1 property",
      "2 photos per job",
      "3 quote requests/month",
      "Basic blockchain record",
      "Public HomeGentic report",
    ],
    propertyLimit: 1,
    photosPerJob: 2,
    quoteRequests: 3,
  },
  {
    tier: "Pro",
    price: 10,
    period: "month",
    features: [
      "5 properties",
      "10 photos per job",
      "10 quote requests/month",
      "Verified badge",
      "Priority support",
      "Export PDF report",
      "Contractor marketplace access",
    ],
    propertyLimit: 5,
    photosPerJob: 10,
    quoteRequests: 10,
  },
  {
    tier: "Premium",
    price: 20,
    period: "month",
    features: [
      "20 properties",
      "30 photos per job",
      "Unlimited quote requests",
      "Premium verified badge",
      "Contractor marketplace access",
      "Value analytics dashboard",
      "Priority verification",
    ],
    propertyLimit: 20,
    photosPerJob: 30,
    quoteRequests: Infinity,
  },
  {
    tier: "ContractorFree",
    price: 0,
    period: "free",
    features: [
      "Contractor profile listing",
      "5 photos per job",
      "Receive leads from HomeGentic homeowners",
      "$15 referral fee per verified job",
      "Basic trust score",
      "Job completion certificates",
    ],
    propertyLimit: 0,
    photosPerJob: 5,
    quoteRequests: Infinity,
  },
  {
    tier: "ContractorPro",
    price: 30,
    period: "month",
    features: [
      "Contractor profile listing",
      "Lead notifications",
      "Job completion certificates",
      "Trust score display",
      "Customer reviews",
      "Earnings dashboard",
    ],
    propertyLimit: 0,
    photosPerJob: 50,
    quoteRequests: Infinity,
  },
];

// Annual plans: same features as monthly, price = 10 months (2 months free).
export const ANNUAL_PLANS: Plan[] = PLANS
  .filter((p) => p.tier === "Pro" || p.tier === "Premium")
  .map((p) => ({ ...p, price: p.price * 10, period: "year" as const }));

// ─── Actor ────────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: PAYMENT_CANISTER_ID });
  }
  return _actor;
}

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
    if (!PAYMENT_CANISTER_ID) return;
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

  async getMySubscription(): Promise<{ tier: PlanTier; expiresAt: number | null }> {
    if (!PAYMENT_CANISTER_ID) return { tier: "Free", expiresAt: null };
    const a = await getActor();
    const result = await a.getMySubscription();
    if ("err" in result) return { tier: "Free", expiresAt: null };
    const sub = result.ok;
    const tierKey   = Object.keys(sub.tier)[0] as PlanTier;
    const expiresNs = Number(sub.expiresAt);
    return {
      tier:      tierKey,
      expiresAt: expiresNs === 0 ? null : expiresNs / 1_000_000,
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

  /** Subscribe to an annual plan (Pro or Premium). Sets expiresAt = now + 365 days on-chain. */
  async subscribeAnnual(
    tier: "Pro" | "Premium",
    onStep?: (step: "quoting" | "approving" | "confirming") => void,
  ): Promise<void> {
    if (!PAYMENT_CANISTER_ID) return;
    return this.subscribe(tier, onStep);
  },

  async cancel(): Promise<void> {
    return this.subscribe("Free");
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

  pause(months: 1 | 2 | 3): void {
    const resumeAt = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem("homegentic_sub_paused_until", String(resumeAt));
  },

  resume(): void {
    localStorage.removeItem("homegentic_sub_paused_until");
  },

  getPauseState(): { pausedUntil: number; daysLeft: number } | null {
    const raw = localStorage.getItem("homegentic_sub_paused_until");
    if (!raw) return null;
    const pausedUntil = Number(raw);
    if (Date.now() >= pausedUntil) {
      localStorage.removeItem("homegentic_sub_paused_until");
      return null;
    }
    const daysLeft = Math.ceil((pausedUntil - Date.now()) / (24 * 60 * 60 * 1000));
    return { pausedUntil, daysLeft };
  },

  async hasPaidFor(_feature: string): Promise<boolean> {
    const sub = await this.getMySubscription();
    return sub.tier !== "Free";
  },

  getPlan(tier: PlanTier): Plan {
    return PLANS.find((p) => p.tier === tier) ?? PLANS[0];
  },

  async getPricing(tier: PlanTier): Promise<{ priceUSD: number; periodDays: number; propertyLimit: number; photosPerJob: number; quoteRequestsPerMonth: number } | null> {
    if (!PAYMENT_CANISTER_ID) return null;
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
    if (!PAYMENT_CANISTER_ID) return [];
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
    _actor = null;
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
    if (!PAYMENT_CANISTER_ID) throw new Error("Payment canister not deployed");
    const a = await getActor();

    const giftArg = gift
      ? [{ recipientEmail: gift.recipientEmail, recipientName: gift.recipientName,
           senderName: gift.senderName, giftMessage: gift.giftMessage,
           deliveryDate: gift.deliveryDate }]
      : [];

    const result = await a.createStripeCheckoutSession(
      { [tier]: null },
      { [billing]: null },
      giftArg,
    );

    if ("err" in result) {
      const key    = Object.keys(result.err)[0];
      const detail = (result.err as any)[key];
      throw new Error(typeof detail === "string" ? detail : key);
    }

    // Redirect to Stripe-hosted checkout page
    window.location.href = result.ok.url;
  },

  /**
   * Verify a completed Stripe session (called from /payment-success).
   * Returns { type: "subscription", sub } for self-upgrades or
   * { type: "gift", giftToken } for gift purchases.
   */
  async verifyStripeSession(
    sessionId: string,
  ): Promise<{ type: "subscription" } | { type: "gift"; giftToken: string }> {
    if (!PAYMENT_CANISTER_ID) throw new Error("Payment canister not deployed");
    const a = await getActor();
    const result = await a.verifyStripeSession(sessionId);

    if ("ok" in result) return { type: "subscription" };

    // Backend returns #err(#NotFound) as the gift sentinel
    const key = Object.keys(result.err)[0];
    if (key === "NotFound") return { type: "gift", giftToken: sessionId };

    const detail = (result.err as any)[key];
    throw new Error(typeof detail === "string" ? detail : key);
  },

  /** Redeem a pending gift using the token emailed to the recipient. */
  async redeemGift(giftToken: string): Promise<void> {
    if (!PAYMENT_CANISTER_ID) throw new Error("Payment canister not deployed");
    const a = await getActor();
    const result = await a.redeemGift(giftToken);
    if ("err" in result) {
      const key    = Object.keys(result.err)[0];
      const detail = (result.err as any)[key];
      throw new Error(typeof detail === "string" ? detail : key);
    }
  },
};
