import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { idlFactory as quoteIdlFactory } from "@homegentic/shared/declarations/quote";
import { idlFactory as contractorIdlFactory } from "@homegentic/shared/declarations/contractor";
import { getIcpAgent }      from "./icpAgent";
import type { Urgency }     from "./quoteFormService";

export type QuoteRequestStatus = "open" | "quoted" | "accepted" | "closed";

export interface QuoteRequest {
  id:          string;
  propertyId:  string;
  serviceType: string;
  urgency:     Urgency;
  description: string;
  status:      QuoteRequestStatus;
  createdAt:   number;  // ms
  /** When bidding closes (ms), if the homeowner set a deadline. */
  closeAt:     number | null;
}

export interface Bid {
  id:             string;
  requestId:      string;
  contractorId:   string;
  contractorName: string;
  verified:       boolean;
  jobsCompleted:  number;
  amountCents:    number;
  timelineDays:   number;
  status:         "Pending" | "Accepted" | "Rejected" | "Expired";
}

export interface CreateQuoteInput {
  propertyId:  string;
  serviceType: string;
  urgency:     Urgency;
  description: string;
}

// ── Canister wiring ───────────────────────────────────────────────────────────

const QUOTE_CANISTER_ID = process.env.EXPO_PUBLIC_QUOTE_CANISTER_ID ?? "";


// ── Converters ────────────────────────────────────────────────────────────────

const URGENCY_MAP: Record<string, Urgency> = {
  Low: "low", Medium: "medium", High: "high", Emergency: "emergency",
};
const STATUS_MAP: Record<string, QuoteRequestStatus> = {
  Open: "open", Quoted: "quoted", Accepted: "accepted", Closed: "closed", Cancelled: "closed",
};

function fromRaw(raw: any): QuoteRequest {
  return {
    id:          raw.id,
    propertyId:  raw.propertyId,
    serviceType: Object.keys(raw.serviceType)[0],
    urgency:     URGENCY_MAP[Object.keys(raw.urgency)[0]] ?? "medium",
    description: raw.description,
    status:      STATUS_MAP[Object.keys(raw.status)[0]] ?? "open",
    createdAt:   Number(raw.createdAt) / 1_000_000,
    closeAt:     raw.closeAt?.length ? Number(raw.closeAt[0]) / 1_000_000 : null,
  };
}

function unwrap<T>(result: any): T {
  if ("ok" in result) return result.ok as T;
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

function getActor(agent: HttpAgent) {
  return Actor.createActor(quoteIdlFactory as any, {
    agent,
    canisterId: QUOTE_CANISTER_ID,
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getMyQuoteRequests(
  _propertyId: string,
  agent?: HttpAgent,
): Promise<QuoteRequest[]> {
  const a = getActor(agent ?? getIcpAgent());
  const raw: any[] = await (a as any).getMyQuoteRequests();
  return raw.map(fromRaw);
}

export async function createQuoteRequest(
  input: CreateQuoteInput,
  agent?: HttpAgent,
): Promise<QuoteRequest> {
  const a = getActor(agent ?? getIcpAgent());
  // Canister urgency variant key is capitalised: "Low", "Medium", "High", "Emergency"
  const urgencyKey = input.urgency.charAt(0).toUpperCase() + input.urgency.slice(1);
  const result = await (a as any).createQuoteRequest(
    input.propertyId,
    { [input.serviceType]: null },
    input.description,
    { [urgencyKey]: null },
    [], [], [], [], [],           // zipCode, minTrustScore, minJobsCompleted, minReviews, maxBids
  );
  return fromRaw(unwrap(result));
}

const CONTRACTOR_CANISTER_ID = process.env.EXPO_PUBLIC_CONTRACTOR_CANISTER_ID ?? "";

/** Bids on a request, cheapest first, with each contractor's name and record. */
export async function getBids(requestId: string, agent?: HttpAgent): Promise<Bid[]> {
  const ag = agent ?? getIcpAgent();
  const raw: any[] = unwrap(await (getActor(ag) as any).getQuotesForRequest(requestId));
  const contractors = CONTRACTOR_CANISTER_ID
    ? Actor.createActor(contractorIdlFactory, { agent: ag, canisterId: CONTRACTOR_CANISTER_ID }) as any
    : null;
  const profiles = await Promise.all(raw.map((q) =>
    contractors ? contractors.getContractor(q.contractor).then((r: any) => ("ok" in r ? r.ok : null)).catch(() => null) : null,
  ));
  return raw
    .map((q, i) => ({
      id:             q.id,
      requestId:      q.requestId,
      contractorId:   q.contractor.toText(),
      contractorName: profiles[i]?.name ?? "Contractor",
      verified:       !!profiles[i]?.isVerified,
      jobsCompleted:  profiles[i] ? Number(profiles[i].jobsCompleted) : 0,
      amountCents:    Number(q.amount),
      timelineDays:   Number(q.timeline),
      status:         Object.keys(q.status)[0] as Bid["status"],
    }))
    .sort((a, b) => a.amountCents - b.amountCents);
}

/** Accepts a bid; the request closes and the other bids are declined. */
export async function acceptBid(quoteId: string, agent?: HttpAgent): Promise<void> {
  unwrap(await (getActor(agent ?? getIcpAgent()) as any).acceptQuote(quoteId));
}

/** Requests still collecting bids — what counts toward the Free plan's limit. */
export function isOpenRequest(r: QuoteRequest): boolean {
  return r.status === "open" || r.status === "quoted";
}
