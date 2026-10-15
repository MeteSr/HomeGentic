/**
 * Plan tiers and their limits — mirrors frontend/src/services/planConstants.ts,
 * the tier table in CLAUDE.md and agents/voice/agentLimiter.ts. The payment
 * canister is the source of truth for which tier a principal is on.
 */
import { HttpAgent } from "@icp-sdk/core/agent";
import { idlFactory } from "../declarations/payment";
import { actorFor, nsToMs, tag } from "./canister";

export type PlanTier = "Free" | "Pro" | "ContractorFree" | "ContractorPro";

export interface Subscription {
  tier:        PlanTier;
  /** ms epoch; 0 when there's no paid subscription. */
  expiresAt:   number;
  cancelled:   boolean;
}

export interface PlanLimits {
  propertyLimit:   number;
  photosPerJob:    number;
  openQuotes:      number;   // Infinity = unlimited
  agentCalls:      number;
  agentPeriod:     "day" | "week";
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  Free:           { propertyLimit: 1,  photosPerJob: 5,  openQuotes: 3,        agentCalls: 10, agentPeriod: "week" },
  Pro:            { propertyLimit: 20, photosPerJob: 30, openQuotes: Infinity, agentCalls: 10, agentPeriod: "day" },
  ContractorFree: { propertyLimit: 0,  photosPerJob: 5,  openQuotes: Infinity, agentCalls: 0,  agentPeriod: "week" },
  ContractorPro:  { propertyLimit: 0,  photosPerJob: 50, openQuotes: Infinity, agentCalls: 10, agentPeriod: "day" },
};

export const PRO_PRICE_LABEL            = "$59 a year";
export const CONTRACTOR_PRO_PRICE_LABEL = "$40 a month";

/** What the upgrade screen lists for each paid plan. */
export const PRO_FEATURES = [
  "20 properties",
  "30 photos per job",
  "Unlimited quote requests",
  "10 AI calls a day",
  "Shared property access",
  "PDF export",
];

export const CONTRACTOR_PRO_FEATURES = [
  "No referral fees on winning bids",
  "Lead notifications",
  "Customer reviews",
  "Earnings dashboard",
  "Trust score display",
  "50 photos per job",
];

export function isPaid(tier: PlanTier): boolean {
  return tier === "Pro" || tier === "ContractorPro";
}

export function isContractorTier(tier: PlanTier): boolean {
  return tier === "ContractorFree" || tier === "ContractorPro";
}

/** Display name: "Free", "Pro", "Contractor Free", "Contractor Pro". */
export function tierName(tier: PlanTier): string {
  return tier.replace("Contractor", "Contractor ");
}

/**
 * Normalises a tier for the signed-in role: a contractor with no subscription
 * is ContractorFree, not Free.
 */
export function tierForRole(tier: PlanTier, contractor: boolean): PlanTier {
  if (!contractor) return isContractorTier(tier) ? "Free" : tier;
  if (tier === "Pro" || tier === "ContractorPro") return "ContractorPro";
  return "ContractorFree";
}

// ── Contractor referral fee ──────────────────────────────────────────────────
// Same rule as frontend/src/services/referralService.ts: 3% of each winning bid
// sourced through a HomeGentic quote request, $20 minimum. ContractorPro pays none.

export const REFERRAL_FEE_RATE        = 0.03;
export const REFERRAL_FEE_FLOOR_CENTS = 2000;

export function referralFeeCents(jobAmountCents: number, tier: PlanTier): number {
  if (tier === "ContractorPro") return 0;
  return Math.max(REFERRAL_FEE_FLOOR_CENTS, Math.round(jobAmountCents * REFERRAL_FEE_RATE));
}

export function isFeeFloored(jobAmountCents: number): boolean {
  return jobAmountCents * REFERRAL_FEE_RATE < REFERRAL_FEE_FLOOR_CENTS;
}

// ── Canister ─────────────────────────────────────────────────────────────────

const PAYMENT_CANISTER_ID = process.env.EXPO_PUBLIC_PAYMENT_CANISTER_ID ?? "";

/** The caller's subscription. No subscription (NotFound) means Free. */
export async function getMySubscription(agent?: HttpAgent): Promise<Subscription> {
  const free: Subscription = { tier: "Free", expiresAt: 0, cancelled: false };
  if (!PAYMENT_CANISTER_ID) return free;
  const result = await actorFor(idlFactory, PAYMENT_CANISTER_ID, agent).getMySubscription();
  if (!("ok" in result)) return free;
  const sub = result.ok;
  const expiresAt = nsToMs(sub.expiresAt);
  // An expired paid plan falls back to Free, matching payment.getTierForPrincipal.
  if (expiresAt > 0 && expiresAt < Date.now()) return free;
  return { tier: tag<PlanTier>(sub.tier), expiresAt, cancelled: sub.cancelledAt.length > 0 };
}
