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
}

export interface ChatRequest {
  message: string;
  context: AgentContext;
}
