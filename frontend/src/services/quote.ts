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
    setPropertyCanisterId: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
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

// ─── Mock seed data (static fixtures for UI display) ─────────────────────────

const SEED_MY_REQUESTS: QuoteRequest[] = [
  { id: "MY_REQ_1", propertyId: "prop_1", homeowner: "local", serviceType: "HVAC",     urgency: "high",   description: "AC unit not cooling. 12-year-old unit — needs diagnosis.", status: "quoted",   createdAt: Date.now() - 86400000 * 3 },
  { id: "MY_REQ_2", propertyId: "prop_1", homeowner: "local", serviceType: "Roofing",  urgency: "medium", description: "Several shingles missing after last storm. Small attic leak.", status: "open",     createdAt: Date.now() - 86400000 * 8 },
  { id: "MY_REQ_3", propertyId: "prop_1", homeowner: "local", serviceType: "Plumbing", urgency: "low",    description: "Slow drain in master bathroom. Snaking hasn't resolved it.", status: "accepted", createdAt: Date.now() - 86400000 * 14 },
];

const SEED_MY_BIDS: Quote[] = [
  { id: "QUOTE_101", requestId: "REQ_101", contractor: "local", amount: 185000, timeline: 3,  validUntil: Date.now() - 86400000 * 30, status: "accepted",  createdAt: Date.now() - 86400000 * 90 },
  { id: "QUOTE_102", requestId: "REQ_102", contractor: "local", amount: 320000, timeline: 5,  validUntil: Date.now() - 86400000 * 20, status: "rejected",  createdAt: Date.now() - 86400000 * 75 },
  { id: "QUOTE_103", requestId: "REQ_103", contractor: "local", amount: 95000,  timeline: 2,  validUntil: Date.now() - 86400000 * 10, status: "accepted",  createdAt: Date.now() - 86400000 * 60 },
  { id: "QUOTE_104", requestId: "REQ_104", contractor: "local", amount: 440000, timeline: 7,  validUntil: Date.now() - 86400000 * 5,  status: "rejected",  createdAt: Date.now() - 86400000 * 45 },
  { id: "QUOTE_105", requestId: "REQ_105", contractor: "local", amount: 210000, timeline: 4,  validUntil: Date.now() - 86400000 * 2,  status: "accepted",  createdAt: Date.now() - 86400000 * 30 },
  { id: "QUOTE_106", requestId: "REQ_106", contractor: "local", amount: 75000,  timeline: 1,  validUntil: Date.now() + 86400000 * 10, status: "pending",   createdAt: Date.now() - 86400000 * 5  },
  { id: "QUOTE_107", requestId: "REQ_107", contractor: "local", amount: 560000, timeline: 10, validUntil: Date.now() + 86400000 * 20, status: "pending",   createdAt: Date.now() - 86400000 * 2  },
];

const SEED_OPEN_REQUESTS: QuoteRequest[] = [
  {
    id: "REQ_1", propertyId: "prop_1", homeowner: "owner-principal-1",
    serviceType: "HVAC", urgency: "high",
    description: "AC unit stopped cooling last week. Unit is 12 years old. Needs diagnosis and likely refrigerant recharge or compressor inspection.",
    status: "open", createdAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: "REQ_2", propertyId: "prop_2", homeowner: "owner-principal-2",
    serviceType: "Roofing", urgency: "medium",
    description: "Several shingles missing after last storm. Small leak visible in attic near chimney flashing. Need repair estimate before next rain.",
    status: "open", createdAt: Date.now() - 1000 * 60 * 60 * 18,
  },
  {
    id: "REQ_3", propertyId: "prop_3", homeowner: "owner-principal-3",
    serviceType: "Plumbing", urgency: "emergency",
    description: "Pipe burst under kitchen sink — water shut off at main. Need emergency repair ASAP. 1960s copper piping throughout.",
    status: "quoted", createdAt: Date.now() - 1000 * 60 * 30,
  },
  {
    id: "REQ_4", propertyId: "prop_4", homeowner: "owner-principal-4",
    serviceType: "Electrical", urgency: "medium",
    description: "Breaker keeps tripping on kitchen circuit. GFCIs installed but issue persists. 200A panel, house built 1998.",
    status: "open", createdAt: Date.now() - 1000 * 60 * 60 * 48,
  },
  {
    id: "REQ_5", propertyId: "prop_5", homeowner: "owner-principal-5",
    serviceType: "Flooring", urgency: "low",
    description: "Refinish 900 sq ft of original hardwood oak floors. Some boards need replacement. Looking for quotes before scheduling.",
    status: "open", createdAt: Date.now() - 1000 * 60 * 60 * 72,
  },
];

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
  const mockRequests: QuoteRequest[] = [...SEED_MY_REQUESTS];
  const mockMyBids: Quote[]          = [...SEED_MY_BIDS];
  const mockOpenRequests: QuoteRequest[] = [...SEED_OPEN_REQUESTS];
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
    if (!QUOTE_CANISTER_ID) {
      if (tier) {
        const quota = this.getQuotaForTier(tier);
        if (quota > 0) {
          const openCount = mockRequests.filter((r) => r.status === "open").length;
          if (openCount >= quota) throw new Error(`Open quote limit reached for ${tier} tier (${openCount}/${quota}). Close an existing request or upgrade your plan.`);
        }
      }
      const r: QuoteRequest = {
        ...req,
        homeowner: "local",
        id:        String(Date.now()),
        status:    "open",
        createdAt: Date.now(),
      };
      mockRequests.push(r);
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
    if (!QUOTE_CANISTER_ID) {
      // E2E override: replace seed data with injected fixture requests
      const e2e = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_quote_requests;
      return e2e ? (e2e as QuoteRequest[]) : [...mockRequests];
    }
    const a = await getActor();
    return (await a.getMyQuoteRequests() as any[]).map(fromRequest);
  },

  async getOpenRequests(): Promise<QuoteRequest[]> {
    if (!QUOTE_CANISTER_ID) return [...mockOpenRequests];
    const a = await getActor();
    return (await a.getOpenRequests() as any[]).map(fromRequest);
  },

  async submitQuote(
    requestId: string,
    amountCents: number,
    timelineDays: number,
    validUntilMs: number
  ): Promise<Quote> {
    if (!QUOTE_CANISTER_ID) {
      const q: Quote = {
        id: `QUOTE_${Date.now()}`, requestId,
        contractor: "local",
        amount: amountCents, timeline: timelineDays,
        validUntil: validUntilMs, status: "pending", createdAt: Date.now(),
      };
      const existing = mockQuotesByRequest.get(requestId) ?? [];
      mockQuotesByRequest.set(requestId, [...existing, q]);
      mockMyBids.push(q);
      return q;
    }
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
    if (!QUOTE_CANISTER_ID) {
      const fromSeed = mockRequests.find((r) => r.id === id);
      if (fromSeed) return fromSeed;
      // Playwright e2e injection
      const e2eRequests = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_quote_requests;
      return e2eRequests ? (e2eRequests as QuoteRequest[]).find((r) => r.id === id) : undefined;
    }
    const a = await getActor();
    const result = await a.getQuoteRequest(id);
    if ("err" in result) return undefined;
    return fromRequest(result.ok);
  },

  async getBidCountMap(requestIds: string[]): Promise<Record<string, number>> {
    if (!QUOTE_CANISTER_ID) {
      const map: Record<string, number> = {};
      for (const id of requestIds) {
        const stored = mockQuotesByRequest.get(id);
        if (stored) {
          map[id] = stored.length;
        } else {
          const req = mockRequests.find((r) => r.id === id);
          map[id] = req?.status === "accepted" ? 3 : req?.status === "quoted" ? 2 : 0;
        }
      }
      return map;
    }
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
    if (!QUOTE_CANISTER_ID) return [...mockMyBids];
    // No dedicated canister endpoint yet — return empty; canister can add getMyQuotes later
    return [];
  },

  async getQuotesForRequest(requestId: string): Promise<Quote[]> {
    if (!QUOTE_CANISTER_ID) {
      const fromMap = mockQuotesByRequest.get(requestId) ?? [];
      // Playwright e2e injection
      const e2eQuotes = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_quotes;
      const fromWindow = e2eQuotes
        ? (e2eQuotes as Quote[]).filter((q) => q.requestId === requestId)
        : [];
      return [...fromMap, ...fromWindow];
    }
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
    mockRequests.push(...SEED_MY_REQUESTS);
    mockMyBids.length = 0;
    mockMyBids.push(...SEED_MY_BIDS);
    mockOpenRequests.length = 0;
    mockOpenRequests.push(...SEED_OPEN_REQUESTS);
    mockQuotesByRequest.clear();
  },
  };
}

export const quoteService = createQuoteService();
