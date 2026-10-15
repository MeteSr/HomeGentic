export interface PropertyContext {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: string;
  yearBuilt: number;
  squareFeet: number;
  verificationLevel: string;
}

export interface JobContext {
  id: string;
  serviceType: string;
  description: string;
  contractorName?: string;
  amount: number; // cents
  status: string;
  date: string;
  warrantyMonths?: number;
}

export interface WarrantyAlert {
  jobId: string;
  serviceType: string;
  daysRemaining: number;
  expiryDate: string; // YYYY-MM-DD
}

export interface MilestoneCoaching {
  milestone:      number;
  milestoneLabel: string;
  ptsNeeded:      number;
  action:         string;
  isFree:         boolean;
}

export interface ScoreTrend {
  delta:             number;
  trend:             "up" | "down" | "flat";
  previousScore:     number | null;
  milestoneCoaching: MilestoneCoaching | null;
}

export interface ScoreBreakdown {
  verifiedJobPts:  number;
  valuePts:        number;
  verificationPts: number;
  diversityPts:    number;
}

export interface ScoreEvent {
  label:    string;
  pts:      number;
  category: string;
}

export interface ScoreContext {
  score:        number;
  grade:        string;
  breakdown:    ScoreBreakdown;
  recentEvents: ScoreEvent[];
  /** Plain-English tips on what would increase the score next. */
  nextActions:  string[];
}

export interface SystemForecast {
  systemName:          string;
  urgency:             "Critical" | "Soon" | "Watch" | "Good";
  yearsRemaining:      number;
  percentLifeUsed:     number;
  replacementCostLow:  number;
  replacementCostHigh: number;
  recommendation:      string;
}

export interface MaintenanceForecastContext {
  propertyAddress:  string;
  predictions:      SystemForecast[];
  urgentCount:      number;
  criticalSystems:  string[];
  totalBudgetLow:   number;
  totalBudgetHigh:  number;
  climateZone:      string;
}

export interface RecommendationSummary {
  name:                  string;
  estimatedCostDollars:  number;
  estimatedRoiPercent:   number;
  priority:              string;
  rationale:             string;
}

export interface ContractorContext {
  name:          string;
  specialties:   string[];
  trustScore:    number;
  jobsCompleted: number;
  isVerified:    boolean;
}

export interface QuoteRequestSummary {
  id:                   string;
  serviceType:          string;
  description:          string;
  urgency:              string;
  status:               string;
  bidCount:             number;
  lowestBidDollars?:    number;
  lowestBidContractor?: string;
}

/** The caller's plan, as the app shows it — lets the agent answer plan questions. */
export interface PlanContext {
  tier:          string;   // "Free" | "Pro" | "ContractorFree" | "ContractorPro"
  propertyLimit: number;
  summary:       string;   // e.g. "Pro covers 20 properties, shared access and PDF export"
}

/** A job waiting on the contractor's (or homeowner's) signature. */
export interface ContractorSignatureContext {
  serviceType:   string;
  address:       string;
  amountDollars: number;
  awaiting:      "contractor" | "homeowner";
}

/** Winning bids this month with the referral fee each one carries. */
export interface ContractorEarningsContext {
  month:           string;   // "October 2026"
  jobs:            { label: string; amountDollars: number; feeDollars: number }[];
  feeTotalDollars: number;
  feeRule:         string;   // e.g. "3% of each winning bid, $20 minimum" or "waived on Contractor Pro"
}

export interface AgentContext {
  properties:            PropertyContext[];
  recentJobs:            JobContext[];
  expiringWarranties:    WarrantyAlert[];
  pendingSignatureJobIds: string[];
  openQuoteCount:        number;
  openQuoteRequests?:    QuoteRequestSummary[];
  score?:                ScoreContext;
  scoreTrend?:           ScoreTrend;
  topRecommendations?:   RecommendationSummary[];
  maintenanceForecast?:  MaintenanceForecastContext;
  role?:                 "Homeowner" | "Contractor" | "Realtor";
  contractorProfile?:    ContractorContext;
  plan?:                 PlanContext;
  contractorSignatures?: ContractorSignatureContext[];
  contractorEarnings?:   ContractorEarningsContext;
  /** Authenticated ICP principal — set server-side from x-icp-principal header, not trusted from client. */
  principal?:            string;
}

export interface ChatRequest {
  message: string;
  context: AgentContext;
}
