export interface PropertyContext {
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
  serviceType: string;
  description: string;
  contractorName: string;
  amount: number; // cents
  status: string;
}

export interface AgentContext {
  properties: PropertyContext[];
  recentJobs: JobContext[];
}

export interface ChatRequest {
  message: string;
  context: AgentContext;
}
