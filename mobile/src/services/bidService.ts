import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { IDL }              from "@icp-sdk/core/candid";
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

const quoteIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const QuoteStatus = I.Variant({
    Pending:  I.Null,
    Accepted: I.Null,
    Rejected: I.Null,
    Expired:  I.Null,
  } as Record<string, IDL.Type>);

  const Quote = I.Record({
    id:         I.Text,
    requestId:  I.Text,
    contractor: I.Principal,
    amount:     I.Nat,
    timeline:   I.Nat,
    validUntil: I.Int,
    status:     QuoteStatus,
    createdAt:  I.Int,
  });

  const Error = I.Variant({
    NotFound:     I.Null,
    Unauthorized: I.Null,
    InvalidInput: I.Text,
  } as Record<string, IDL.Type>);

  return I.Service({
    // submitQuote(requestId, amountCents, timelineDays, validUntilNs)
    submitQuote: I.Func(
      [I.Text, I.Nat, I.Nat, I.Int],
      [I.Variant({ ok: Quote, err: Error })],
      []
    ),
  });
};

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
