import { HttpAgent } from "@dfinity/agent";

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

export async function submitBid(input: SubmitBidInput, _agent?: HttpAgent): Promise<Bid> {
  // TODO: replace with real canister call — quote.submitQuote(requestId, amount, timeline, notes)
  return {
    id:           `bid_${Date.now()}`,
    requestId:    input.requestId,
    amountCents:  input.amountCents,
    timelineDays: input.timelineDays,
    notes:        input.notes,
    submittedAt:  Date.now(),
  };
}
