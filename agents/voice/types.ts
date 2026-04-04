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

export interface RecommendationSummary {
  name:                  string;
  estimatedCostDollars:  number;
  estimatedRoiPercent:   number;
  priority:              string;
  rationale:             string;
}

export interface AgentContext {
  properties:            PropertyContext[];
  recentJobs:            JobContext[];
  expiringWarranties:    WarrantyAlert[];
  pendingSignatureJobIds: string[];
  openQuoteCount:        number;
  score?:                ScoreContext;
  topRecommendations?:   RecommendationSummary[];
}

export interface ChatRequest {
  message: string;
  context: AgentContext;
}
