// Generated from ../declarations/payment.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  | { InvalidInput: string }
  | { PaymentFailed: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { RateLimited: null };

export type Tier = { Pro: null } | { Free: null } | { ContractorPro: null } | { ContractorFree: null };

export type Subscription = {
  expiresAt: bigint;
  owner: Principal;
  createdAt: bigint;
  tier: Tier;
  cancelledAt: [] | [bigint];
};

export type StripeConfig = {
  cancelUrl: string;
  secretKey: string;
  priceIds: StripePriceIds;
  successUrl: string;
};

export type StripePriceIds = {
  premiumMonthly: string;
  contractorProYearly: string;
  contractorProMonthly: string;
  proMonthly: string;
  basicYearly: string;
  basicMonthly: string;
  proYearly: string;
  premiumYearly: string;
};

export type BillingPeriod = { Monthly: null } | { Yearly: null };

export type GiftMeta = {
  giftMessage: string;
  deliveryDate: string;
  senderName: string;
  recipientName: string;
  recipientEmail: string;
};

export type CheckoutSession = {
  id: string;
  url: string;
};

export type PricingInfo = {
  periodDays: bigint;
  tier: Tier;
  quoteRequestsPerMonth: bigint;
  propertyLimit: bigint;
  priceUSD: bigint;
  photosPerJob: bigint;
};

export type SubscriptionStats = {
  pro: bigint;
  total: bigint;
  contractorPro: bigint;
  free: bigint;
  estimatedMrrUsd: bigint;
  contractorFree: bigint;
  activePaid: bigint;
};

export type PendingGift = {
  redeemedBy: [] | [Principal];
  giftMessage: string;
  createdAt: bigint;
  tier: Tier;
  deliveryDate: string;
  billing: BillingPeriod;
  senderName: string;
  recipientName: string;
  giftToken: string;
  recipientEmail: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addStripeRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  adminActivateStripeSubscription: ActorMethod<[Principal, Tier, bigint], { ok: Subscription } | { err: Error }>;
  adminGrantAgentCredits: ActorMethod<[Principal, bigint], { ok: bigint } | { err: Error }>;
  cancelSubscription: ActorMethod<[], { ok: Subscription } | { err: Error }>;
  configureStripe: ActorMethod<[StripeConfig], { ok: null } | { err: Error }>;
  consumeAgentCredit: ActorMethod<[Principal], { ok: bigint } | { err: Error }>;
  createStripeCheckoutSession: ActorMethod<
    [Tier, BillingPeriod, [] | [GiftMeta]],
    { ok: CheckoutSession } | { err: Error }
  >;
  getAllPricing: ActorMethod<[], PricingInfo[]>;
  getMyAgentCredits: ActorMethod<[], bigint>;
  getMyHandoffGrant: ActorMethod<[], [] | [bigint]>;
  getMySubscription: ActorMethod<[], { ok: Subscription } | { err: Error }>;
  getPriceQuote: ActorMethod<[Tier], { ok: bigint } | { err: Error }>;
  getPricing: ActorMethod<[Tier], PricingInfo>;
  getSubscriptionStats: ActorMethod<[], SubscriptionStats>;
  getTierForPrincipal: ActorMethod<[Principal], Tier>;
  grantHandoffYear: ActorMethod<[Principal, string], { ok: Subscription } | { err: Error }>;
  grantSubscription: ActorMethod<[Principal, Tier], { ok: Subscription } | { err: Error }>;
  initAdmins: ActorMethod<[Principal[], string], { ok: null } | { err: Error }>;
  isAdminPrincipal: ActorMethod<[Principal], boolean>;
  isStripeConfigured: ActorMethod<[], boolean>;
  listPendingGifts: ActorMethod<[], { ok: PendingGift[] } | { err: Error }>;
  listStripeRelays: ActorMethod<[], Principal[]>;
  redeemGift: ActorMethod<[string], { ok: Subscription } | { err: Error }>;
  removeStripeRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setBootstrapNonce: ActorMethod<[string], undefined>;
  stripeActivateSubscription: ActorMethod<[Principal, Tier, bigint, string], { ok: Subscription } | { err: Error }>;
  stripeGrantAgentCredits: ActorMethod<[Principal, bigint, string], { ok: bigint } | { err: Error }>;
  stripeRecordGift: ActorMethod<[string, Tier, BillingPeriod, GiftMeta], { ok: null } | { err: Error }>;
  subscribe: ActorMethod<[Tier], { ok: Subscription } | { err: Error }>;
  verifyStripeSession: ActorMethod<[string], { ok: Subscription } | { err: Error }>;
}
