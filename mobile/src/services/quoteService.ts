import { HttpAgent } from "@icp-sdk/core/agent";
import type { Urgency } from "./quoteFormService";

export type QuoteRequestStatus = "open" | "quoted" | "accepted" | "closed";

export interface QuoteRequest {
  id:          string;
  propertyId:  string;
  serviceType: string;
  urgency:     Urgency;
  description: string;
  status:      QuoteRequestStatus;
  createdAt:   number;  // ms
}

export interface CreateQuoteInput {
  propertyId:  string;
  serviceType: string;
  urgency:     Urgency;
  description: string;
}

export async function getMyQuoteRequests(
  _propertyId: string,
  _agent?: HttpAgent,
): Promise<QuoteRequest[]> {
  throw new Error("Not implemented: getMyQuoteRequests — wire to quote canister getMyQuoteRequests");
}

export async function createQuoteRequest(
  _input: CreateQuoteInput,
  _agent?: HttpAgent,
): Promise<QuoteRequest> {
  throw new Error("Not implemented: createQuoteRequest — wire to quote canister createQuoteRequest");
}
