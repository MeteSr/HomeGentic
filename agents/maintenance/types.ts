// Mirror of backend/maintenance/main.mo output types

export type UrgencyLevel = "Critical" | "Soon" | "Watch" | "Good";

export interface SystemPrediction {
  systemName: string;
  lastServiceYear: number;
  percentLifeUsed: number;
  yearsRemaining: number;
  urgency: UrgencyLevel;
  estimatedCostLowCents: number;
  estimatedCostHighCents: number;
  recommendation: string;
  diyViable: boolean;
}

export interface AnnualTask {
  task: string;
  frequency: string;
  season: string | null;
  estimatedCost: string;
  diyViable: boolean;
}

export interface MaintenanceReport {
  systemPredictions: SystemPrediction[];
  annualTasks: AnnualTask[];
  totalBudgetLowCents: number;
  totalBudgetHighCents: number;
  generatedAt: number;
}
