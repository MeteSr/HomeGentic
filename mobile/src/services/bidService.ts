import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { idlFactory as quoteIdlFactory } from "../declarations/quote";
import { getIcpAgent }      from "./icpAgent";

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
  const a = Actor.createActor(quoteIdlFactory as any, {
    agent: ag,
    canisterId: QUOTE_CANISTER_ID,
  });

  // Valid-until: 30 days from now, expressed in nanoseconds
  const validUntilNs = BigInt(Date.now() + 30 * 24 * 60 * 60 * 1000) * 1_000_000n;

  const result = await (a as any).submitQuote(
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
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

/** Request ids this contractor has already bid on — the lead card shows "Bid sent". */
export async function getMyBidRequestIds(agent?: HttpAgent): Promise<Set<string>> {
  const a = Actor.createActor(quoteIdlFactory as any, { agent: agent ?? getIcpAgent(), canisterId: QUOTE_CANISTER_ID });
  const raw: any[] = await (a as any).getMyQuotes();
  return new Set(raw.map((q) => q.requestId as string));
}
