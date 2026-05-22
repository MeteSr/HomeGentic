// Candid interface for the payment canister — keep in sync with backend/payment/main.mo
export const idlFactory = ({ IDL }: any) => {
  const Tier = IDL.Variant({
    Free: IDL.Null, Basic: IDL.Null, Pro: IDL.Null, Premium: IDL.Null,
    ContractorFree: IDL.Null, ContractorPro: IDL.Null,
  });
  const BillingPeriod = IDL.Variant({ Monthly: IDL.Null, Yearly: IDL.Null });
  const Subscription = IDL.Record({
    owner:       IDL.Principal,
    tier:        Tier,
    expiresAt:   IDL.Int,
    createdAt:   IDL.Int,
    cancelledAt: IDL.Opt(IDL.Int),
  });
  const Error = IDL.Variant({
    NotFound:      IDL.Null,
    NotAuthorized: IDL.Null,
    PaymentFailed: IDL.Text,
    RateLimited:   IDL.Null,
    InvalidInput:  IDL.Text,
  });
  const PricingInfo = IDL.Record({
    tier:                  Tier,
    priceUSD:              IDL.Nat,
    periodDays:            IDL.Nat,
    propertyLimit:         IDL.Nat,
    photosPerJob:          IDL.Nat,
    quoteRequestsPerMonth: IDL.Nat,
  });
  const SubscriptionStats = IDL.Record({
    total:           IDL.Nat,
    free:            IDL.Nat,
    basic:           IDL.Nat,
    pro:             IDL.Nat,
    premium:         IDL.Nat,
    contractorFree:  IDL.Nat,
    contractorPro:   IDL.Nat,
    activePaid:      IDL.Nat,
    estimatedMrrUsd: IDL.Nat,
  });
  const GiftMeta = IDL.Record({
    recipientEmail: IDL.Text,
    recipientName:  IDL.Text,
    senderName:     IDL.Text,
    giftMessage:    IDL.Text,
    deliveryDate:   IDL.Text,
  });
  const CheckoutSession = IDL.Record({ id: IDL.Text, url: IDL.Text });
  const PendingGift = IDL.Record({
    giftToken:      IDL.Text,
    tier:           Tier,
    billing:        BillingPeriod,
    recipientEmail: IDL.Text,
    recipientName:  IDL.Text,
    senderName:     IDL.Text,
    giftMessage:    IDL.Text,
    deliveryDate:   IDL.Text,
    createdAt:      IDL.Int,
    redeemedBy:     IDL.Opt(IDL.Principal),
  });
  const StripePriceIds = IDL.Record({
    basicMonthly:         IDL.Text,
    basicYearly:          IDL.Text,
    proMonthly:           IDL.Text,
    proYearly:            IDL.Text,
    premiumMonthly:       IDL.Text,
    premiumYearly:        IDL.Text,
    contractorProMonthly: IDL.Text,
    contractorProYearly:  IDL.Text,
  });
  const StripeConfig = IDL.Record({
    secretKey:  IDL.Text,
    priceIds:   StripePriceIds,
    successUrl: IDL.Text,
    cancelUrl:  IDL.Text,
  });
  return IDL.Service({
    subscribe: IDL.Func(
      [Tier],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    getPriceQuote: IDL.Func(
      [Tier],
      [IDL.Variant({ ok: IDL.Nat, err: Error })],
      []
    ),
    grantSubscription: IDL.Func(
      [IDL.Principal, Tier],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    getMySubscription: IDL.Func(
      [],
      [IDL.Variant({ ok: Subscription, err: Error })],
      ["query"]
    ),
    cancelSubscription: IDL.Func(
      [],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    getPricing: IDL.Func(
      [Tier],
      [PricingInfo],
      ["query"]
    ),
    getAllPricing: IDL.Func(
      [],
      [IDL.Vec(PricingInfo)],
      ["query"]
    ),
    getSubscriptionStats: IDL.Func(
      [],
      [SubscriptionStats],
      ["query"]
    ),
    // ── Stripe ──
    configureStripe: IDL.Func(
      [StripeConfig],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    isStripeConfigured: IDL.Func(
      [],
      [IDL.Bool],
      ["query"]
    ),
    createStripeCheckoutSession: IDL.Func(
      [Tier, BillingPeriod, IDL.Opt(GiftMeta)],
      [IDL.Variant({ ok: CheckoutSession, err: Error })],
      []
    ),
    verifyStripeSession: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    redeemGift: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Subscription, err: Error })],
      []
    ),
    listPendingGifts: IDL.Func(
      [],
      [IDL.Variant({ ok: IDL.Vec(PendingGift), err: Error })],
      ["query"]
    ),
    initAdmins: IDL.Func(
      [IDL.Vec(IDL.Principal)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setTierCanisterIds: IDL.Func(
      [IDL.Principal, IDL.Principal, IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // ── Agent credit top-ups (#89) ──
    getMyAgentCredits: IDL.Func(
      [],
      [IDL.Nat],
      ["query"]
    ),
    adminGrantAgentCredits: IDL.Func(
      [IDL.Principal, IDL.Nat],
      [IDL.Variant({ ok: IDL.Nat, err: Error })],
      []
    ),
  });
};
