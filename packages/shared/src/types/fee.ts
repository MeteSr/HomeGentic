// Generated from ../declarations/fee.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error = { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null } | { AlreadyExists: null };

export type FeeRecord = {
  id: string;
  status: FeeStatus;
  requestId: string;
  createdAt: bigint;
  homeownerId: Principal;
  agentId: Principal;
  amountCents: bigint;
  updatedAt: bigint;
  proposalId: string;
};

export type FeeStatus = { Owed: null } | { Paid: null } | { Invoiced: null } | { Waived: null };

export type ReferralFee = {
  id: string;
  status: ReferralFeeStatus;
  serviceType: string;
  requestId: string;
  createdAt: bigint;
  jobId: [] | [string];
  quoteId: string;
  propertyId: string;
  feeCents: bigint;
  updatedAt: bigint;
  bidCents: bigint;
  acceptedAt: [] | [bigint];
  homeowner: Principal;
  paymentRef: string;
  dueAt: [] | [bigint];
  contractor: Principal;
  payUrl: string;
  failedAt: [] | [bigint];
  reason: string;
};

export type ReferralFeeStatus =
  { Due: null } | { Paid: null } | { PaymentFailed: null } | { Waived: null } | { Pending: null };

export type ReferralCard = {
  termsVersion: string;
  paymentMethodId: string;
  agreedAt: bigint;
  last4: string;
  customerId: string;
  brand: string;
};

export type ReferralBid = {
  serviceType: string;
  requestId: string;
  quoteId: string;
  propertyId: string;
  bidAt: bigint;
  bidCents: bigint;
  homeowner: Principal;
  contractor: Principal;
};

export type BidCheck = { ok: null } | { overdue: null } | { needsCard: null };

export type ChargeItem = {
  fee: ReferralFee;
  card: [] | [ReferralCard];
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addAdmin: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  addReferralRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  getAllFees: ActorMethod<[], { ok: FeeRecord[] } | { err: Error }>;
  getAllReferralFees: ActorMethod<[], { ok: ReferralFee[] } | { err: Error }>;
  getFeeForRequest: ActorMethod<[string], [] | [FeeRecord]>;
  getFeesDue: ActorMethod<[], { ok: FeeRecord[] } | { err: Error }>;
  getMyFees: ActorMethod<[], FeeRecord[]>;
  getMyReferralCard: ActorMethod<[], [] | [ReferralCard]>;
  getMyReferralFees: ActorMethod<[], ReferralFee[]>;
  initAdmins: ActorMethod<[Principal[], string], { ok: null } | { err: Error }>;
  markFeeInvoiced: ActorMethod<[string], { ok: FeeRecord } | { err: Error }>;
  markFeePaid: ActorMethod<[string], { ok: FeeRecord } | { err: Error }>;
  metrics: ActorMethod<
    [],
    {
      owedCents: bigint;
      isPaused: boolean;
      totalFees: bigint;
      paidCents: bigint;
    }
  >;
  pause: ActorMethod<[[] | [bigint]], { ok: null } | { err: Error }>;
  recordFeeOwed: ActorMethod<[string, string, Principal, Principal, bigint], { ok: FeeRecord } | { err: Error }>;
  recordReferralAccepted: ActorMethod<[string], { ok: [] | [ReferralFee] } | { err: Error }>;
  recordReferralBid: ActorMethod<[ReferralBid], { ok: null } | { err: Error }>;
  recordReferralJobVerified: ActorMethod<
    [string, Principal, string, string],
    { ok: [] | [ReferralFee] } | { err: Error }
  >;
  referralBidAllowed: ActorMethod<[Principal], BidCheck>;
  relayMarkReferralFeeFailed: ActorMethod<[string, string, string], { ok: ReferralFee } | { err: Error }>;
  relayMarkReferralFeePaid: ActorMethod<[string, string], { ok: ReferralFee } | { err: Error }>;
  relaySetReferralCard: ActorMethod<[Principal, ReferralCard], { ok: null } | { err: Error }>;
  removeAdmin: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  removeReferralRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setBootstrapNonce: ActorMethod<[string], undefined>;
  setJobCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setListingCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setQuoteCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setUpdateRateLimit: ActorMethod<[bigint], { ok: null } | { err: Error }>;
  takeDueReferralFees: ActorMethod<[], { ok: ChargeItem[] } | { err: Error }>;
  unpause: ActorMethod<[], { ok: null } | { err: Error }>;
  waiveFee: ActorMethod<[string], { ok: FeeRecord } | { err: Error }>;
  waiveReferralFee: ActorMethod<[string, string], { ok: ReferralFee } | { err: Error }>;
}
