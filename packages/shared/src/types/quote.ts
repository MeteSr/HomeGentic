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

export type Error =
  | { Paused: null }
  | { InvalidInput: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { RateLimited: null }
  | { Unavailable: string };

export type UnitResult = { ok: null } | { err: Error };

export type VisitResult = { ok: VisitBooking } | { err: Error };

export type VisitBooking = {
  status: VisitStatus;
  requestId: string;
  note: string;
  quoteId: string;
  booked: [] | [VisitSlot];
  updatedAt: bigint;
  offered: VisitSlot[];
};

export type VisitStatus = { NewTimesRequested: null } | { Booked: null } | { Cancelled: null } | { TimesOffered: null };

export type VisitSlot = {
  startsAt: bigint;
  endsAt: bigint;
};

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

export type JobPayment = {
  status: JobPaymentStatus;
  method: JobPaymentMethod;
  requestId: string;
  platformFeeCents: bigint;
  createdAt: bigint;
  quoteId: string;
  referralFeeCents: bigint;
  amountCents: bigint;
  updatedAt: bigint;
  checkoutRef: string;
  bidCents: bigint;
  homeowner: Principal;
  paymentRef: string;
  contractor: Principal;
};

export type JobPaymentStatus = { Started: null } | { Failed: null } | { Paid: null } | { Processing: null };

export type JobPaymentMethod = { Bank: null } | { Card: null };

export type SealedBid = {
  id: string;
  requestId: string;
  ciphertext: Uint8Array | number[];
  timelineDays: bigint;
  submittedAt: bigint;
  contractor: Principal;
};

export type PayoutAccount = {
  payoutsEnabled: boolean;
  transfersActive: boolean;
  accountId: string;
  updatedAt: bigint;
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

export type PaymentTerms = {
  requestId: string;
  accountId: string;
  quoteId: string;
  referralFeeCents: bigint;
  cardCents: bigint;
  bidCents: bigint;
  homeowner: Principal;
  contractor: Principal;
};

export type PaymentUpdate = {
  refundCents: bigint;
  payment: JobPayment;
};

export type SealedBidReveal = {
  bids: SealedBid[];
  encryptedKey: Uint8Array | number[];
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  acceptQuote: ActorMethod<[string], { ok: Quote } | { err: Error }>;
  addPaymentRelay: ActorMethod<[Principal], UnitResult>;
  askForNewVisitTimes: ActorMethod<[string], VisitResult>;
  attachUsageSummary: ActorMethod<[string, UsageSummary], UnitResult>;
  bookVisitTime: ActorMethod<[string, bigint], VisitResult>;
  cancelQuoteRequest: ActorMethod<[string], { ok: Principal[] } | { err: Error }>;
  cancelVisit: ActorMethod<[string], VisitResult>;
  cardPriceFor: ActorMethod<[bigint], bigint>;
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
  getApiDoc: ActorMethod<[], string>;
  getIbePublicKey: ActorMethod<[], Uint8Array | number[]>;
  getJobPayments: ActorMethod<[string[]], JobPayment[]>;
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
  getMyPayoutAccount: ActorMethod<[], [] | [PayoutAccount]>;
  getMyQuoteRequests: ActorMethod<[], QuoteRequest[]>;
  getMyQuotes: ActorMethod<[], Quote[]>;
  getOpenRequests: ActorMethod<[], QuoteRequest[]>;
  getOpenRequestsForMe: ActorMethod<[], QuoteRequest[]>;
  getOpenRequestsPage: ActorMethod<[bigint, bigint], QuoteRequest[]>;
  getPayoutReady: ActorMethod<[Principal[]], Array<[Principal, boolean]>>;
  getQuoteRequest: ActorMethod<[string], { ok: QuoteRequest } | { err: Error }>;
  getQuoteRequestSubtypes: ActorMethod<[string[]], Array<[string, string]>>;
  getQuotesForRequest: ActorMethod<[string], { ok: Quote[] } | { err: Error }>;
  getRevealedBids: ActorMethod<[string], RevealedBid[]>;
  getUsageSummary: ActorMethod<[string], { ok: [] | [UsageSummary] } | { err: Error }>;
  getVisitBookings: ActorMethod<[string[]], VisitBooking[]>;
  offerVisitTimes: ActorMethod<[string, VisitSlot[], string], VisitResult>;
  relayPrepareJobPayment: ActorMethod<[string, Principal], { ok: PaymentTerms } | { err: Error }>;
  relayRecordJobPayment: ActorMethod<
    [string, Principal, JobPaymentMethod, bigint, string],
    { ok: JobPayment } | { err: Error }
  >;
  relaySetPayoutAccount: ActorMethod<[Principal, PayoutAccount], UnitResult>;
  relayUpdateJobPayment: ActorMethod<
    [string, string, JobPaymentStatus, string],
    { ok: PaymentUpdate } | { err: Error }
  >;
  removePaymentRelay: ActorMethod<[Principal], UnitResult>;
  removeUsageSummary: ActorMethod<[string], UnitResult>;
  revealBids: ActorMethod<[string], { ok: RevealedBid[] } | { err: Error }>;
  revealBidsEncrypted: ActorMethod<[string, Uint8Array | number[]], { ok: SealedBidReveal } | { err: Error }>;
  setFeeCanisterId: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setPropertyCanisterId: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setQuoteRequestSubtype: ActorMethod<[string, [] | [string]], UnitResult>;
  submitQuote: ActorMethod<[string, bigint, bigint, bigint], { ok: Quote } | { err: Error }>;
  submitSealedBid: ActorMethod<[string, Uint8Array | number[], bigint], { ok: SealedBid } | { err: Error }>;
}
