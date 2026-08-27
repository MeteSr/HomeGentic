import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/quote";
import { ibeEncryptAmount, ibeDecryptBids, type RevealedBid as SealedRevealedBid } from "./sealedBid";
export { idlFactory };

const QUOTE_CANISTER_ID = (process.env as any).QUOTE_CANISTER_ID || "";

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type Urgency = "low" | "medium" | "high" | "emergency";
export type QuoteRequestStatus = "open" | "quoted" | "accepted" | "closed" | "cancelled";
export type QuoteStatus = "pending" | "accepted" | "rejected" | "expired";

export interface QuoteRequest {
  id:               string;
  propertyId:       string;
  homeowner:        string;   // principal text
  serviceType:      string;
  urgency:          Urgency;
  description:      string;
  status:           QuoteRequestStatus;
  zipCode?:         string;   // 5-digit zip for location filtering; undefined = visible to all
  createdAt:        number;   // ms
  closeAt?:         number;   // ms — bid window close time; undefined = no sealed-bid window
  minTrustScore?:   number;   // contractor trustScore must be >= this
  minJobsCompleted?: number;  // contractor jobsCompleted must be >= this
  minReviews?:      number;   // contractor reviewCount must be >= this
  maxBids?:         number;   // max bids cap (3 or 5)
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

function mapVariant<T>(map: Record<string, T>, raw: any, field: string): T {
  const key = Object.keys(raw)[0];
  const val = map[key];
  if (val === undefined) throw new Error(`Unknown canister variant for ${field}: "${key}"`);
  return val;
}

function fromRequest(raw: any): QuoteRequest {
  const closeAtArr          = raw.closeAt          as bigint[]  | undefined;
  const zipArr              = raw.zipCode           as string[]  | undefined;
  const minTrustScoreArr    = raw.minTrustScore     as bigint[]  | undefined;
  const minJobsCompletedArr = raw.minJobsCompleted  as bigint[]  | undefined;
  const minReviewsArr       = raw.minReviews        as bigint[]  | undefined;
  const maxBidsArr          = raw.maxBids           as bigint[]  | undefined;
  return {
    id:               raw.id,
    propertyId:       raw.propertyId,
    homeowner:        raw.homeowner.toText(),
    serviceType:      Object.keys(raw.serviceType)[0],
    urgency:          mapVariant(URGENCY_MAP, raw.urgency, "urgency"),
    description:      raw.description,
    status:           mapVariant(REQUEST_STATUS_MAP, raw.status, "requestStatus"),
    zipCode:          zipArr && zipArr.length > 0 ? zipArr[0] : undefined,
    createdAt:        Number(raw.createdAt) / 1_000_000,
    closeAt:          closeAtArr && closeAtArr.length > 0
                        ? Number(closeAtArr[0]) / 1_000_000
                        : undefined,
    minTrustScore:    minTrustScoreArr && minTrustScoreArr.length > 0
                        ? Number(minTrustScoreArr[0]) : undefined,
    minJobsCompleted: minJobsCompletedArr && minJobsCompletedArr.length > 0
                        ? Number(minJobsCompletedArr[0]) : undefined,
    minReviews:       minReviewsArr && minReviewsArr.length > 0
                        ? Number(minReviewsArr[0]) : undefined,
    maxBids:          maxBidsArr && maxBidsArr.length > 0
                        ? Number(maxBidsArr[0]) : undefined,
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
    status:     mapVariant(QUOTE_STATUS_MAP, raw.status, "quoteStatus"),
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
      { [urgencyKey]: null },
      req.zipCode        ? [req.zipCode]                             : [],
      req.minTrustScore    != null ? [BigInt(req.minTrustScore)]    : [],
      req.minJobsCompleted != null ? [BigInt(req.minJobsCompleted)] : [],
      req.minReviews       != null ? [BigInt(req.minReviews)]       : [],
      req.maxBids          != null ? [BigInt(req.maxBids)]          : []
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

  async getOpenRequestsForMe(): Promise<QuoteRequest[]> {
    if (!QUOTE_CANISTER_ID) return [];
    const a = await getActor();
    return (await a.getOpenRequestsForMe() as any[]).map(fromRequest);
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
    if (typeof window !== "undefined" && (window as any).__e2e_quotes) {
      return (window as any).__e2e_quotes as Quote[];
    }
    if (typeof window !== "undefined" && (window as any).__e2e_properties) {
      return [];
    }
    const a = await getActor();
    return (await a.getMyQuotes() as any[]).map(fromQuote);
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

  // ── vetKeys IBE sealed-bid methods ──────────────────────────────────────────

  /**
   * Returns the canister's BLS12-381 IBE public key for the sealed-bid context.
   * Contractors call this before encrypting bid amounts.
   */
  async getIbePublicKey(): Promise<Uint8Array> {
    const a = await getActor();
    const bytes = await a.getIbePublicKey();
    return new Uint8Array(bytes);
  },

  /**
   * Encrypt amountCents with the canister's IBE public key and submit the sealed bid.
   *
   * @param requestId            - The sealed-bid request to bid on.
   * @param amountCents          - Bid amount in US cents.
   * @param timelineDays         - Projected completion time.
   * @param homeownerPrincipalText - `QuoteRequest.homeowner` (principal text).
   */
  async submitSealedBidEncrypted(
    requestId:              string,
    amountCents:            number,
    timelineDays:           number,
    homeownerPrincipalText: string,
  ): Promise<{ id: string; requestId: string; timelineDays: number; submittedAt: number }> {
    const { Principal } = await import("@dfinity/principal");
    const pubKeyBytes = await this.getIbePublicKey();
    const homeownerBytes = Principal.fromText(homeownerPrincipalText).toUint8Array();
    const ciphertextBytes = await ibeEncryptAmount(pubKeyBytes, homeownerBytes, amountCents);

    const a = await getActor();
    const result = await a.submitSealedBid(requestId, Array.from(ciphertextBytes), BigInt(timelineDays));
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }
    const b = result.ok;
    return {
      id:           b.id,
      requestId:    b.requestId,
      timelineDays: Number(b.timelineDays),
      submittedAt:  Number(b.submittedAt) / 1_000_000,
    };
  },

  /**
   * Reveal all sealed bids after the bid window closes.
   * Derives the homeowner's IBE key from the canister and decrypts each bid locally.
   *
   * @param requestId  - The sealed-bid request whose bids to reveal.
   * @param myPrincipalText - The caller's principal text (must be the homeowner).
   * @returns Decrypted bid amounts with isWinner set for the lowest price.
   */
  async revealBidsDecrypted(
    requestId:      string,
    myPrincipalText: string,
  ): Promise<SealedRevealedBid[]> {
    const { TransportSecretKey } = await import("@dfinity/vetkeys");
    const { Principal }          = await import("@dfinity/principal");

    const tsk = TransportSecretKey.random();
    const tpk = tsk.publicKeyBytes();

    const a = await getActor();
    const result = await a.revealBidsEncrypted(requestId, Array.from(tpk));
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = result.err[key];
      throw new Error(typeof val === "string" ? val : key);
    }

    const pubKeyBytes      = await this.getIbePublicKey();
    const myPrincipalBytes = Principal.fromText(myPrincipalText).toUint8Array();
    const encryptedKeyBytes = new Uint8Array(result.ok.encryptedKey);

    const rawBids = (result.ok.bids as any[]).map((b: any) => ({
      id:           b.id as string,
      requestId:    b.requestId as string,
      contractor:   b.contractor.toText() as string,
      ciphertext:   Array.from(b.ciphertext as number[]),
      timelineDays: Number(b.timelineDays),
      submittedAt:  b.submittedAt as bigint,
    }));

    return ibeDecryptBids(encryptedKeyBytes, pubKeyBytes, myPrincipalBytes, tsk, rawBids);
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
