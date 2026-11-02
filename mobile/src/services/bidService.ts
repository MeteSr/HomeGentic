import type { HttpAgent } from "@icp-sdk/core/agent";
import { idlFactory as quoteIdlFactory } from "@homegentic/shared/declarations/quote";
import { getIcpAgent }      from "./icpAgent";
import { actorFor } from "./canister";
import type { _SERVICE as QuoteCanister } from "@homegentic/shared/types/quote";
import { canisterError } from "@homegentic/shared/canisterError";

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

// ── Canister wiring ───────────────────────────────────────────────────────────

const QUOTE_CANISTER_ID = process.env.EXPO_PUBLIC_QUOTE_CANISTER_ID ?? "";


// ── Public API ────────────────────────────────────────────────────────────────

export async function submitBid(input: SubmitBidInput, agent?: HttpAgent): Promise<Bid> {
  const ag = agent ?? getIcpAgent();
  const a = actorFor<QuoteCanister>(quoteIdlFactory, QUOTE_CANISTER_ID, ag);

  // Valid-until: 30 days from now, expressed in nanoseconds
  const validUntilNs = BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000) * 1_000_000n;

  const result = await a.submitQuote(
    input.requestId,
    BigInt(input.amountCents),
    BigInt(input.timelineDays),
    validUntilNs,
  );

  if ("ok" in result) {
    const raw = result.ok;
    return {
      id:           raw.id,
      requestId:    raw.requestId,
      amountCents:  Number(raw.amount),
      timelineDays: Number(raw.timeline),
      notes:        input.notes,
      submittedAt:  Number(raw.createdAt) / 1_000_000,
    };
  }
  throw canisterError(result.err);
}

/** Request ids this contractor has already bid on — the lead card shows "Bid sent". */
export async function getMyBidRequestIds(agent?: HttpAgent): Promise<Set<string>> {
  const a = actorFor<QuoteCanister>(quoteIdlFactory, QUOTE_CANISTER_ID, agent ?? getIcpAgent());
  const raw: any[] = await a.getMyQuotes();
  return new Set(raw.map((q) => q.requestId as string));
}
