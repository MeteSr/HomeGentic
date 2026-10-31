// Generated from ../declarations/quote.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Quote = {
  id: string;
  status: QuoteStatus;
  requestId: string;
  createdAt: bigint;
  amount: bigint;
  contractor: Principal;
  validUntil: bigint;
  timeline: bigint;
};

export type QuoteStatus = { Rejected: null } | { Accepted: null } | { Expired: null } | { Pending: null };

export type Error = { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null };

export type UsageSummary = {
  asOf: string;
  series: UsageSeries[];
};

export type UsageSeries = {
  unit: [] | [string];
  category: UsageCategory;
  months: UsageMonth[];
};

export type UsageCategory = { Gas: null } | { Water: null } | { Electric: null };

export type UsageMonth = {
  month: string;
  amountCents: bigint;
  usage: [] | [number];
};

export type UnitResult = { ok: null } | { err: Error };

export type QuoteRequest = {
  id: string;
  status: RequestStatus;
  serviceType: ServiceType;
  urgency: UrgencyLevel;
  createdAt: bigint;
  minTrustScore: [] | [bigint];
  description: string;
  propertyId: string;
  zipCode: [] | [string];
  closeAt: [] | [bigint];
  maxBids: [] | [bigint];
  homeowner: Principal;
  minReviews: [] | [bigint];
  minJobsCompleted: [] | [bigint];
};

export type RequestStatus =
  { Quoted: null } | { Open: null } | { Closed: null } | { Accepted: null } | { Cancelled: null };

export type ServiceType =
  | { Solar: null }
  | { HVAC: null }
  | { Foundation: null }
  | { Pest: null }
  | { Pool: null }
  | { Plumbing: null }
  | { Painting: null }
  | { Concrete: null }
  | { Fencing: null }
  | { Gutters: null }
  | { Insulation: null }
  | { Landscaping: null }
  | { Drywall: null }
  | { Windows: null }
  | { Electrical: null }
  | { Flooring: null }
  | { Other: null }
  | { BathroomRemodel: null }
  | { Roofing: null }
  | { KitchenRemodel: null }
  | { GeneralHandyman: null };

export type UrgencyLevel = { Low: null } | { High: null } | { Medium: null } | { Emergency: null };

export type SealedBid = {
  id: string;
  requestId: string;
  ciphertext: Uint8Array | number[];
  timelineDays: bigint;
  submittedAt: bigint;
  contractor: Principal;
};

export type RevealedBid = {
  id: string;
  requestId: string;
  timelineDays: bigint;
  submittedAt: bigint;
  amountCents: bigint;
  isWinner: boolean;
  contractor: Principal;
};

export type SealedBidReveal = {
  bids: SealedBid[];
  encryptedKey: Uint8Array | number[];
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  acceptQuote: ActorMethod<[string], { ok: Quote } | { err: Error }>;
  attachUsageSummary: ActorMethod<[string, UsageSummary], UnitResult>;
  cancelQuoteRequest: ActorMethod<[string], { ok: Principal[] } | { err: Error }>;
  closeQuoteRequest: ActorMethod<[string], { ok: QuoteRequest } | { err: Error }>;
  createQuoteRequest: ActorMethod<
    [
      string,
      ServiceType,
      string,
      UrgencyLevel,
      [] | [string],
      [] | [bigint],
      [] | [bigint],
      [] | [bigint],
      [] | [bigint],
    ],
    { ok: QuoteRequest } | { err: Error }
  >;
  createSealedBidRequest: ActorMethod<
    [
      string,
      ServiceType,
      string,
      UrgencyLevel,
      bigint,
      [] | [string],
      [] | [bigint],
      [] | [bigint],
      [] | [bigint],
      [] | [bigint],
    ],
    { ok: QuoteRequest } | { err: Error }
  >;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  getIbePublicKey: ActorMethod<[], Uint8Array | number[]>;
  getLocalPriceStats: ActorMethod<
    [string, string],
    | []
    | [
        {
          low: bigint;
          area: string;
          high: bigint;
          sampleSize: bigint;
          median: bigint;
        },
      ]
  >;
  getMyBid: ActorMethod<[string], { ok: SealedBid } | { err: Error }>;
  getMyQuoteRequests: ActorMethod<[], QuoteRequest[]>;
  getMyQuotes: ActorMethod<[], Quote[]>;
  getOpenRequests: ActorMethod<[], QuoteRequest[]>;
  getOpenRequestsForMe: ActorMethod<[], QuoteRequest[]>;
  getOpenRequestsPage: ActorMethod<[bigint, bigint], QuoteRequest[]>;
  getQuoteRequest: ActorMethod<[string], { ok: QuoteRequest } | { err: Error }>;
  getQuotesForRequest: ActorMethod<[string], { ok: Quote[] } | { err: Error }>;
  getRevealedBids: ActorMethod<[string], RevealedBid[]>;
  getUsageSummary: ActorMethod<[string], { ok: [] | [UsageSummary] } | { err: Error }>;
  removeUsageSummary: ActorMethod<[string], UnitResult>;
  revealBids: ActorMethod<[string], { ok: RevealedBid[] } | { err: Error }>;
  revealBidsEncrypted: ActorMethod<[string, Uint8Array | number[]], { ok: SealedBidReveal } | { err: Error }>;
  setFeeCanisterId: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setPropertyCanisterId: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  submitQuote: ActorMethod<[string, bigint, bigint, bigint], { ok: Quote } | { err: Error }>;
  submitSealedBid: ActorMethod<[string, Uint8Array | number[], bigint], { ok: SealedBid } | { err: Error }>;
}
