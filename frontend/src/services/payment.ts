import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const PAYMENT_CANISTER_ID = (process.env as any).PAYMENT_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
  const Tier = IDL.Variant({
    Free: IDL.Null, Pro: IDL.Null, Premium: IDL.Null, ContractorPro: IDL.Null,
  });
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
  });
  const PricingInfo = IDL.Record({
    tier:                  Tier,
    priceUSD:              IDL.Nat,
    periodDays:            IDL.Nat,
    propertyLimit:         IDL.Nat,
    photosPerJob:          IDL.Nat,
    quoteRequestsPerMonth: IDL.Nat,
  });
  return IDL.Service({
    subscribe: IDL.Func(
      [Tier],
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
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type PlanTier = "Free" | "Pro" | "Premium" | "ContractorPro";

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
      "5 photos per job",
      "3 quote requests/month",
      "Basic blockchain record",
      "Public HomeFax report",
    ],
    propertyLimit: 1,
    photosPerJob: 5,
    quoteRequests: 3,
  },
  {
    tier: "Pro",
    price: 10,
    period: "month",
    features: [
      "5 properties",
      "20 photos per job",
      "10 quote requests/month",
      "Verified badge",
      "Priority support",
      "Export PDF report",
    ],
    propertyLimit: 5,
    photosPerJob: 20,
    quoteRequests: 10,
  },
  {
    tier: "Premium",
    price: 49,
    period: "month",
    features: [
      "Unlimited properties",
      "Unlimited photos",
      "Unlimited quote requests",
      "Premium verified badge",
      "Contractor marketplace access",
      "Value analytics dashboard",
      "Priority verification",
    ],
    propertyLimit: Infinity,
    photosPerJob: Infinity,
    quoteRequests: Infinity,
  },
  {
    tier: "ContractorPro",
    price: 49,
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
  async subscribe(tier: PlanTier): Promise<void> {
    if (!PAYMENT_CANISTER_ID) return;
    const a = await getActor();
    const result = await a.subscribe({ [tier]: null });
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
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

  /** Activate a subscription tier on-chain. Returns dashboard URL (no payment redirect for ICP-native). */
  async initiate(tier: PlanTier): Promise<{ url: string }> {
    await this.subscribe(tier);
    return { url: "/dashboard" };
  },

  async cancel(): Promise<void> {
    return this.subscribe("Free");
  },

  /** Record cancellation timestamp in localStorage (8.3.2). */
  recordCancellation(): void {
    localStorage.setItem("homefax_cancelled_at", String(Date.now()));
  },

  /** Returns { cancelledAt } if the account was cancelled, null otherwise (8.3.2). */
  getCancellationInfo(): { cancelledAt: number } | null {
    const raw = localStorage.getItem("homefax_cancelled_at");
    if (!raw) return null;
    return { cancelledAt: Number(raw) };
  },

  pause(months: 1 | 2 | 3): void {
    const resumeAt = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem("homefax_sub_paused_until", String(resumeAt));
  },

  resume(): void {
    localStorage.removeItem("homefax_sub_paused_until");
  },

  getPauseState(): { pausedUntil: number; daysLeft: number } | null {
    const raw = localStorage.getItem("homefax_sub_paused_until");
    if (!raw) return null;
    const pausedUntil = Number(raw);
    if (Date.now() >= pausedUntil) {
      localStorage.removeItem("homefax_sub_paused_until");
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
};
