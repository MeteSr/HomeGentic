import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const QUOTE_CANISTER_ID = (process.env as any).QUOTE_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const ServiceType = IDL.Variant({
    Roofing: IDL.Null, HVAC: IDL.Null, Plumbing: IDL.Null, Electrical: IDL.Null,
    Painting: IDL.Null, Flooring: IDL.Null, Windows: IDL.Null, Landscaping: IDL.Null,
  });
  const UrgencyLevel = IDL.Variant({
    Low: IDL.Null, Medium: IDL.Null, High: IDL.Null, Emergency: IDL.Null,
  });
  const RequestStatus = IDL.Variant({
    Open: IDL.Null, Quoted: IDL.Null, Accepted: IDL.Null, Closed: IDL.Null, Cancelled: IDL.Null,
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
    closeAt:     IDL.Opt(IDL.Int),
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
    getOpenRequests: IDL.Func([], [IDL.Vec(QuoteRequest)], ["query"]),
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
    cancelQuoteRequest: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(IDL.Principal), err: Error })],
      []
    ),
    setPropertyCanisterId: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type Urgency = "low" | "medium" | "high" | "emergency";
export type QuoteRequestStatus = "open" | "quoted" | "accepted" | "closed" | "cancelled";
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
  closeAt?:    number;   // ms — bid window close time; undefined = no sealed-bid window
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

// ─── Converters ───────────────────────────────────────────────────────────────

const URGENCY_MAP: Record<string, Urgency> = {
  Low: "low", Medium: "medium", High: "high", Emergency: "emergency",
};
const REQUEST_STATUS_MAP: Record<string, QuoteRequestStatus> = {
  Open: "open", Quoted: "quoted", Accepted: "accepted", Closed: "closed", Cancelled: "cancelled",
};
const QUOTE_STATUS_MAP: Record<string, QuoteStatus> = {
  Pending: "pending", Accepted: "accepted", Rejected: "rejected", Expired: "expired",
};

function fromRequest(raw: any): QuoteRequest {
  const closeAtArr = raw.closeAt as bigint[] | undefined;
  return {
    id:          raw.id,
    propertyId:  raw.propertyId,
    homeowner:   raw.homeowner.toText(),
    serviceType: Object.keys(raw.serviceType)[0],
    urgency:     URGENCY_MAP[Object.keys(raw.urgency)[0]] ?? "medium",
    description: raw.description,
    status:      REQUEST_STATUS_MAP[Object.keys(raw.status)[0]] ?? "open",
    createdAt:   Number(raw.createdAt) / 1_000_000,
    closeAt:     closeAtArr && closeAtArr.length > 0
                   ? Number(closeAtArr[0]) / 1_000_000
                   : undefined,
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

// ─── Service factory ──────────────────────────────────────────────────────────

function createQuoteService() {
  let _actor: any = null;
  // E2E-only mock state — only populated via window.__e2e_* injection from Playwright
  const mockRequests: QuoteRequest[] = [];
  const mockMyBids: Quote[]          = [];
  const mockOpenRequests: QuoteRequest[] = [];
  const mockQuotesByRequest = new Map<string, Quote[]>();

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: QUOTE_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async createRequest(
    req: Omit<QuoteRequest, "id" | "createdAt" | "status" | "homeowner">,
    tier?: string
  ): Promise<QuoteRequest> {
    // E2E bypass: when running in Playwright tests, create an in-memory mock request
    if (typeof window !== "undefined" && (window as any).__e2e_properties) {
      const newReq: QuoteRequest = {
        id: String(Date.now()),
        ...req,
        homeowner: "test-e2e-principal",
        status: "open",
        createdAt: Date.now(),
      };
      mockRequests.push(newReq);
      return newReq;
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
    if (typeof window !== "undefined" && (window as any).__e2e_quote_requests) {
      return [...(window as any).__e2e_quote_requests as QuoteRequest[], ...mockRequests];
    }
    if (mockRequests.length > 0) return mockRequests;
    const a = await getActor();
    return (await a.getMyQuoteRequests() as any[]).map(fromRequest);
  },

  async getOpenRequests(): Promise<QuoteRequest[]> {
    if (!QUOTE_CANISTER_ID) return [];
    const a = await getActor();
    return (await a.getOpenRequests() as any[]).map(fromRequest);
  },

  async submitQuote(
    requestId: string,
    amountCents: number,
    timelineDays: number,
    validUntilMs: number
  ): Promise<Quote> {
    const a = await getActor();
    const result = await a.submitQuote(
      requestId,
      BigInt(amountCents),
      BigInt(timelineDays),
      BigInt(validUntilMs * 1_000_000) // ms → ns
    );
    if ("ok" in result) return fromQuote(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getRequest(id: string): Promise<QuoteRequest | undefined> {
    if (typeof window !== "undefined" && (window as any).__e2e_quote_requests) {
      const reqs = (window as any).__e2e_quote_requests as QuoteRequest[];
      return reqs.find((r) => r.id === id) ?? mockRequests.find((r) => r.id === id);
    }
    const fromMock = mockRequests.find((r) => r.id === id);
    if (fromMock) return fromMock;
    const a = await getActor();
    const result = await a.getQuoteRequest(id);
    if ("err" in result) return undefined;
    return fromRequest(result.ok);
  },

  async getBidCountMap(requestIds: string[]): Promise<Record<string, number>> {
    const results = await Promise.allSettled(
      requestIds.map((id) => this.getQuotesForRequest(id).then((qs) => [id, qs.length] as [string, number]))
    );
    const map: Record<string, number> = {};
    for (const r of results) {
      if (r.status === "fulfilled") map[r.value[0]] = r.value[1];
    }
    return map;
  },

  async getMyBids(): Promise<Quote[]> {
    // No dedicated canister endpoint yet — return empty; canister can add getMyQuotes later
    return [];
  },

  async getQuotesForRequest(requestId: string): Promise<Quote[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_quotes) {
      const quotes = (window as any).__e2e_quotes as Quote[];
      return quotes.filter((q) => q.requestId === requestId);
    }
    // E2E mode without pre-injected quotes: return empty (no bids on a just-created request)
    if (typeof window !== "undefined" && (window as any).__e2e_properties) {
      return [];
    }
    const a = await getActor();
    const result = await a.getQuotesForRequest(requestId);
    if ("err" in result) return [];
    return (result.ok as any[]).map(fromQuote);
  },

  async accept(quoteId: string): Promise<void> {
    if (typeof window !== "undefined" && (window as any).__e2e_quotes) {
      return; // E2E mode: no-op — UI applies optimistic status update
    }
    const a = await getActor();
    const result = await a.acceptQuote(quoteId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  async close(requestId: string): Promise<void> {
    const a = await getActor();
    const result = await a.closeQuoteRequest(requestId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      throw new Error(key);
    }
  },

  async cancel(requestId: string): Promise<void> {
    const a = await getActor();
    const result = await a.cancelQuoteRequest(requestId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  getQuotaForTier(tier: string): number {
    const limits: Record<string, number> = {
      Free: 3, Pro: 10, Premium: 10, ContractorPro: 0,
    };
    return limits[tier] ?? 3;
  },

  /** Returns true if the quote's validity window has passed. */
  isQuoteExpired(quote: Quote): boolean {
    return Date.now() > quote.validUntil;
  },

  /** Returns a new array sorted by urgency: emergency > high > medium > low. */
  sortByUrgency(requests: QuoteRequest[]): QuoteRequest[] {
    const ORDER: Record<Urgency, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
    return [...requests].sort((a, b) => ORDER[a.urgency] - ORDER[b.urgency]);
  },

  reset() {
    _actor = null;
    mockRequests.length = 0;
    mockMyBids.length = 0;
    mockOpenRequests.length = 0;
    mockQuotesByRequest.clear();
  },
  };
}

export const quoteService = createQuoteService();
