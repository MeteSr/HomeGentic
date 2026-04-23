/**
 * Static plan definitions — pure data, no canister calls.
 *
 * Kept in a separate file so that tests which mock @/services/payment
 * never accidentally suppress these constants (they're not part of the
 * mock surface).
 */

export type PlanTier     = "Free" | "Basic" | "Pro" | "Premium" | "ContractorFree" | "ContractorPro" | "RealtorFree" | "RealtorPro";
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
    features: [],
    propertyLimit: 0,
    photosPerJob: 0,
    quoteRequests: 0,
  },
  {
    tier: "Basic",
    price: 10,
    period: "month",
    features: [
      "1 property",
      "5 photos per job",
      "3 quote requests/month",
      "5 AI agent calls/day",
      "Blockchain-backed maintenance record",
      "Public HomeGentic report",
      "Warranty Wallet",
      "Recurring Services",
      "Market Intelligence",
      "Insurance Defense Mode",
      "5-Year Maintenance Calendar",
      "Contractor marketplace access",
      "Score breakdown",
      "PDF export",
    ],
    propertyLimit: 1,
    photosPerJob: 5,
    quoteRequests: 3,
  },
  {
    tier: "Pro",
    price: 20,
    period: "month",
    features: [
      "Everything in Basic",
      "5 properties",
      "10 photos per job",
      "10 quote requests/month",
      "10 AI agent calls/day",
      "Verified badge",
      "Priority support",
      "Export PDF report",
    ],
    propertyLimit: 5,
    photosPerJob: 10,
    quoteRequests: 10,
  },
  {
    tier: "Premium",
    price: 40,
    period: "month",
    features: [
      "Everything in Pro",
      "20 properties",
      "30 photos per job",
      "Unlimited quote requests",
      "20 AI agent calls/day",
      "Premium verified badge",
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
  {
    tier: "RealtorFree",
    price: 0,
    period: "free",
    features: [
      "Realtor profile listing",
      "Bid on homeowner FSBO listing requests",
      "5 photos per bid proposal",
      "$100 per won bid",
      "Basic performance score",
      "Job completion certificates",
    ],
    propertyLimit: 0,
    photosPerJob: 5,
    quoteRequests: Infinity,
  },
  {
    tier: "RealtorPro",
    price: 30,
    period: "month",
    features: [
      "Everything in Realtor Free",
      "Unlimited bid proposals",
      "50 photos per bid proposal",
      "10 AI agent calls/day",
      "Priority placement in agent search",
      "Verified Realtor badge",
      "Performance analytics dashboard",
      "Customer reviews",
    ],
    propertyLimit: 0,
    photosPerJob: 50,
    quoteRequests: Infinity,
  },
];

// Annual plans: same features as monthly, price = 10 months (2 months free).
export const ANNUAL_PLANS: Plan[] = PLANS
  .filter((p) => p.tier === "Basic" || p.tier === "Pro" || p.tier === "Premium")
  .map((p) => ({ ...p, price: p.price * 10, period: "year" as const }));

export const ANNUAL_CONTRACTOR_PLANS: Plan[] = PLANS
  .filter((p) => p.tier === "ContractorFree" || p.tier === "ContractorPro")
  .map((p) => p.price === 0 ? p : { ...p, price: p.price * 10, period: "year" as const });

export const ANNUAL_REALTOR_PLANS: Plan[] = PLANS
  .filter((p) => p.tier === "RealtorFree" || p.tier === "RealtorPro")
  .map((p) => p.price === 0 ? p : { ...p, price: p.price * 10, period: "year" as const });
