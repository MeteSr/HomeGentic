import { HttpAgent } from "@icp-sdk/core/agent";

export interface SubmitBidInput {
  requestId:    string;
  amountCents:  number;
  timelineDays: number;
  notes:        string | null;
}

export interface Bid {
  id:           string;
  requestId:    string;
  amountCents:  number;
  timelineDays: number;
  notes:        string | null;
  submittedAt:  number;  // ms
}

export async function submitBid(_input: SubmitBidInput, _agent?: HttpAgent): Promise<Bid> {
  throw new Error("Not implemented: submitBid — wire to quote canister submitQuote");
}
