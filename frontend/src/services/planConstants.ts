/**
 * Static plan definitions — pure data, no canister calls.
 *
 * Kept in a separate file so that tests which mock @/services/payment
 * never accidentally suppress these constants (they're not part of the
 * mock surface).
 *
 * Free is no longer a fully-blocked tier: homeowners get 1 property, 5
 * photos/job, and 3 open quote requests for free (matching what the old
 * retired Basic tier offered), plus job logging, Bid to List access, and
 * the AI/intelligence feature set — Market Intelligence, Predictive
 * Maintenance, Warranty Wallet, Recurring Services, Sensors, and
 * delegated People management. Only Insurance Defense and Resale Ready
 * stay Pro-only. Free also gets its own AI agent-call allowance: 10/week
 * (not 10/day like Pro) — see agents/voice/agentLimiter.ts's TIER_PERIOD;
 * every call is pure cost against $0 revenue, so it's deliberately a much
 * smaller, weekly-paced allowance rather than Pro's daily one.
 *
 * Homeowner pricing is a single paid plan: Pro at $59/year (annual-only),
 * carrying the old Premium tier's property/photo/quote limits. Its AI
 * agent-call limit is the exception — it keeps its own original 10/day
 * cap rather than Premium's 20/day, since 20/day would run this tier at
 * a negative margin at the $59/year price (see docs/AI_RATE_LIMITS.md).
 * "Basic" and "Premium" remain valid PlanTier values and stay in the
 * backend's Tier variant purely so grandfathered subscribers from before
 * this change keep decoding and keep their existing limits until their
 * subscription expires — they are no longer offered anywhere as a
 * purchase option, so they're absent from PLANS below.
 */

export type PlanTier     = "Free" | "Basic" | "Pro" | "Premium" | "ContractorFree" | "ContractorPro";
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

// Contractor referral fee rate/floor live in services/referralService.ts
// (referralService.calculateFee / isFloored) — the single source of truth,
// shared by the admin referral pipeline and the Contractor Plan billing UI.

export const PLANS: Plan[] = [
  {
    tier: "Free",
    price: 0,
    period: "free",
    features: [
      "1 property",
      "5 photos per job",
      "Up to 3 open quote requests",
      "Job logging (DIY + contractor)",
      "Bid to List access",
      "10 AI agent calls/week",
      "Warranty Wallet",
      "Recurring Services",
      "Market Intelligence",
      "5-Year Maintenance Calendar",
      "Sensors",
    ],
    propertyLimit: 1,
    photosPerJob: 5,
    quoteRequests: 3,
  },
  {
    tier: "Pro",
    price: 59,
    period: "year",
    features: [
      "20 properties",
      "30 photos per job",
      "Unlimited quote requests",
      "10 AI agent calls/day",
      "Blockchain-backed maintenance record",
      "Public HomeGentic report",
      "Warranty Wallet",
      "Recurring Services",
      "Market Intelligence",
      "Insurance Defense Mode",
      "5-Year Maintenance Calendar",
      "Contractor marketplace access",
      "Verified badge",
      "Value analytics dashboard",
      "Priority verification & support",
      "Score breakdown",
      "PDF export",
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
      "3% referral fee per winning bid, $20 minimum",
      "Basic trust score",
      "Job completion certificates",
    ],
    propertyLimit: 0,
    photosPerJob: 5,
    quoteRequests: Infinity,
  },
  {
    tier: "ContractorPro",
    price: 40,
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

// Pro is the only homeowner plan and it's natively annual ($59/year) — there
// is no monthly variant to derive an annual price from anymore. Kept as an
// alias (rather than removed) so any remaining monthly/annual toggle in the
// UI can be retired without also having to chase down every import site.
export const ANNUAL_PLANS: Plan[] = PLANS;
