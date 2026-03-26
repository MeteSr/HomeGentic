import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const QUOTE_CANISTER_ID = (process.env as any).QUOTE_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
  const ServiceType = IDL.Variant({
    Roofing: IDL.Null, HVAC: IDL.Null, Plumbing: IDL.Null, Electrical: IDL.Null,
    Painting: IDL.Null, Flooring: IDL.Null, Windows: IDL.Null, Landscaping: IDL.Null,
  });
  const UrgencyLevel = IDL.Variant({
    Low: IDL.Null, Medium: IDL.Null, High: IDL.Null, Emergency: IDL.Null,
  });
  const RequestStatus = IDL.Variant({
    Open: IDL.Null, Quoted: IDL.Null, Accepted: IDL.Null, Closed: IDL.Null,
  });
  const QuoteStatus = IDL.Variant({
    Pending: IDL.Null, Accepted: IDL.Null, Rejected: IDL.Null, Expired: IDL.Null,
  });
  const QuoteRequest = IDL.Record({
    id:          IDL.Text,
    propertyId:  IDL.Text,
    homeowner:   IDL.Principal,
    serviceType: ServiceType,
    description: IDL.Text,
    urgency:     UrgencyLevel,
    status:      RequestStatus,
    createdAt:   IDL.Int,
  });
  const Quote = IDL.Record({
    id:         IDL.Text,
    requestId:  IDL.Text,
    contractor: IDL.Principal,
    amount:     IDL.Nat,
    timeline:   IDL.Nat,
    validUntil: IDL.Int,
    status:     QuoteStatus,
    createdAt:  IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    Unauthorized: IDL.Null,
    InvalidInput: IDL.Text,
  });
  return IDL.Service({
    createQuoteRequest: IDL.Func(
      [IDL.Text, ServiceType, IDL.Text, UrgencyLevel],
      [IDL.Variant({ ok: QuoteRequest, err: Error })],
      []
    ),
    getQuoteRequest: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: QuoteRequest, err: Error })],
      ["query"]
    ),
    getMyQuoteRequests: IDL.Func([], [IDL.Vec(QuoteRequest)], ["query"]),
    submitQuote: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Nat, IDL.Int],
      [IDL.Variant({ ok: Quote, err: Error })],
      []
    ),
    getQuotesForRequest: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(Quote), err: Error })],
      ["query"]
    ),
    acceptQuote: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Quote, err: Error })],
      []
    ),
    closeQuoteRequest: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: QuoteRequest, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type Urgency = "low" | "medium" | "high" | "emergency";
export type QuoteRequestStatus = "open" | "quoted" | "accepted" | "closed";
export type QuoteStatus = "pending" | "accepted" | "rejected" | "expired";

export interface QuoteRequest {
  id:          string;
  propertyId:  string;
  homeowner:   string;   // principal text
  serviceType: string;
  urgency:     Urgency;
  description: string;
  status:      QuoteRequestStatus;
  createdAt:   number;   // ms
}

export interface Quote {
  id:         string;
  requestId:  string;
  contractor: string;  // principal text
  amount:     number;  // cents
  timeline:   number;  // days to complete
  validUntil: number;  // ms timestamp
  status:     QuoteStatus;
  createdAt:  number;  // ms
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

const MOCK_REQUESTS: QuoteRequest[] = [];

// ─── Actor ────────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: QUOTE_CANISTER_ID });
  }
  return _actor;
}

// ─── Converters ───────────────────────────────────────────────────────────────

const URGENCY_MAP: Record<string, Urgency> = {
  Low: "low", Medium: "medium", High: "high", Emergency: "emergency",
};
const REQUEST_STATUS_MAP: Record<string, QuoteRequestStatus> = {
  Open: "open", Quoted: "quoted", Accepted: "accepted", Closed: "closed",
};
const QUOTE_STATUS_MAP: Record<string, QuoteStatus> = {
  Pending: "pending", Accepted: "accepted", Rejected: "rejected", Expired: "expired",
};

function fromRequest(raw: any): QuoteRequest {
  return {
    id:          raw.id,
    propertyId:  raw.propertyId,
    homeowner:   raw.homeowner.toText(),
    serviceType: Object.keys(raw.serviceType)[0],
    urgency:     URGENCY_MAP[Object.keys(raw.urgency)[0]] ?? "medium",
    description: raw.description,
    status:      REQUEST_STATUS_MAP[Object.keys(raw.status)[0]] ?? "open",
    createdAt:   Number(raw.createdAt) / 1_000_000,
  };
}

function fromQuote(raw: any): Quote {
  return {
    id:         raw.id,
    requestId:  raw.requestId,
    contractor: raw.contractor.toText(),
    amount:     Number(raw.amount),
    timeline:   Number(raw.timeline),
    validUntil: Number(raw.validUntil) / 1_000_000,
    status:     QUOTE_STATUS_MAP[Object.keys(raw.status)[0]] ?? "pending",
    createdAt:  Number(raw.createdAt) / 1_000_000,
  };
}

function unwrapRequest(result: any): QuoteRequest {
  if ("ok" in result) return fromRequest(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const quoteService = {
  async createRequest(
    req: Omit<QuoteRequest, "id" | "createdAt" | "status" | "homeowner">
  ): Promise<QuoteRequest> {
    if (!QUOTE_CANISTER_ID) {
      const r: QuoteRequest = {
        ...req,
        homeowner: "local",
        id:        String(Date.now()),
        status:    "open",
        createdAt: Date.now(),
      };
      MOCK_REQUESTS.push(r);
      return r;
    }
    const a = await getActor();
    // Capitalize first letter to match the canister variant (Low, Medium, High, Emergency)
    const urgencyKey = req.urgency.charAt(0).toUpperCase() + req.urgency.slice(1);
    const result = await a.createQuoteRequest(
      req.propertyId,
      { [req.serviceType]: null },
      req.description,
      { [urgencyKey]: null }
    );
    return unwrapRequest(result);
  },

  async getRequests(): Promise<QuoteRequest[]> {
    if (!QUOTE_CANISTER_ID) return [...MOCK_REQUESTS];
    const a = await getActor();
    return (await a.getMyQuoteRequests() as any[]).map(fromRequest);
  },

  async getRequest(id: string): Promise<QuoteRequest | undefined> {
    if (!QUOTE_CANISTER_ID) return MOCK_REQUESTS.find((r) => r.id === id);
    const a = await getActor();
    const result = await a.getQuoteRequest(id);
    if ("err" in result) return undefined;
    return fromRequest(result.ok);
  },

  async getQuotesForRequest(requestId: string): Promise<Quote[]> {
    if (!QUOTE_CANISTER_ID) return [];
    const a = await getActor();
    const result = await a.getQuotesForRequest(requestId);
    if ("err" in result) return [];
    return (result.ok as any[]).map(fromQuote);
  },

  async accept(quoteId: string): Promise<void> {
    if (!QUOTE_CANISTER_ID) return;
    const a = await getActor();
    const result = await a.acceptQuote(quoteId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  async close(requestId: string): Promise<void> {
    if (!QUOTE_CANISTER_ID) return;
    const a = await getActor();
    const result = await a.closeQuoteRequest(requestId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  getQuotaForTier(tier: string): number {
    const limits: Record<string, number> = {
      Free: 3, Pro: 10, Premium: 10, ContractorPro: 0,
    };
    return limits[tier] ?? 3;
  },

  reset() {
    _actor = null;
  },
};
