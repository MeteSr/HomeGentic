// Candid interface for the quote canister — keep in sync with backend/quote/main.mo
import { serviceTypeIdl } from "../serviceTypes";
export const idlFactory = ({ IDL }: any) => {
  const ServiceType = serviceTypeIdl(IDL);
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
    id:               IDL.Text,
    propertyId:       IDL.Text,
    homeowner:        IDL.Principal,
    serviceType:      ServiceType,
    description:      IDL.Text,
    urgency:          UrgencyLevel,
    status:           RequestStatus,
    zipCode:          IDL.Opt(IDL.Text),
    createdAt:        IDL.Int,
    closeAt:          IDL.Opt(IDL.Int),
    minTrustScore:    IDL.Opt(IDL.Nat),
    minJobsCompleted: IDL.Opt(IDL.Nat),
    minReviews:       IDL.Opt(IDL.Nat),
    maxBids:          IDL.Opt(IDL.Nat),
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
  // Sealed-bid types
  const SealedBid = IDL.Record({
    id:           IDL.Text,
    requestId:    IDL.Text,
    contractor:   IDL.Principal,
    ciphertext:   IDL.Vec(IDL.Nat8),
    timelineDays: IDL.Nat,
    submittedAt:  IDL.Int,
  });
  const RevealedBid = IDL.Record({
    id:           IDL.Text,
    requestId:    IDL.Text,
    contractor:   IDL.Principal,
    amountCents:  IDL.Nat,
    timelineDays: IDL.Nat,
    submittedAt:  IDL.Int,
    isWinner:     IDL.Bool,
  });
  const SealedBidReveal = IDL.Record({
    encryptedKey: IDL.Vec(IDL.Nat8),
    bids:         IDL.Vec(SealedBid),
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput: IDL.Text,
    Paused: IDL.Null,
    RateLimited: IDL.Null,
    Unavailable: IDL.Text,
  });
  const UsageCategory = IDL.Variant({ Electric: IDL.Null, Gas: IDL.Null, Water: IDL.Null });
  const UsageMonth = IDL.Record({
    month:       IDL.Text,
    amountCents: IDL.Nat,
    usage:       IDL.Opt(IDL.Float64),
  });
  const UsageSeries = IDL.Record({
    category: UsageCategory,
    unit:     IDL.Opt(IDL.Text),
    months:   IDL.Vec(UsageMonth),
  });
  const UsageSummary = IDL.Record({ series: IDL.Vec(UsageSeries), asOf: IDL.Text });
  const UnitResult = IDL.Variant({ ok: IDL.Null, err: Error });
  const VisitSlot = IDL.Record({ startsAt: IDL.Int, endsAt: IDL.Int });
  const VisitStatus = IDL.Variant({
    TimesOffered:      IDL.Null,
    Booked:            IDL.Null,
    NewTimesRequested: IDL.Null,
    Cancelled:         IDL.Null,
  });
  const VisitBooking = IDL.Record({
    quoteId:   IDL.Text,
    requestId: IDL.Text,
    status:    VisitStatus,
    offered:   IDL.Vec(VisitSlot),
    booked:    IDL.Opt(VisitSlot),
    note:      IDL.Text,
    updatedAt: IDL.Int,
  });
  const VisitResult = IDL.Variant({ ok: VisitBooking, err: Error });
  const PayoutAccount = IDL.Record({
    accountId:       IDL.Text,
    transfersActive: IDL.Bool,
    payoutsEnabled:  IDL.Bool,
    updatedAt:       IDL.Int,
  });
  const JobPaymentMethod = IDL.Variant({ Bank: IDL.Null, Card: IDL.Null });
  const JobPaymentStatus = IDL.Variant({
    Started: IDL.Null, Processing: IDL.Null, Paid: IDL.Null, Failed: IDL.Null,
  });
  const JobPayment = IDL.Record({
    quoteId:          IDL.Text,
    requestId:        IDL.Text,
    contractor:       IDL.Principal,
    homeowner:        IDL.Principal,
    method:           JobPaymentMethod,
    bidCents:         IDL.Nat,
    amountCents:      IDL.Nat,
    platformFeeCents: IDL.Nat,
    referralFeeCents: IDL.Nat,
    status:           JobPaymentStatus,
    checkoutRef:      IDL.Text,
    paymentRef:       IDL.Text,
    createdAt:        IDL.Int,
    updatedAt:        IDL.Int,
  });
  const PaymentTerms = IDL.Record({
    quoteId:          IDL.Text,
    requestId:        IDL.Text,
    contractor:       IDL.Principal,
    homeowner:        IDL.Principal,
    accountId:        IDL.Text,
    bidCents:         IDL.Nat,
    cardCents:        IDL.Nat,
    referralFeeCents: IDL.Nat,
  });
  const PaymentUpdate = IDL.Record({ payment: JobPayment, refundCents: IDL.Nat });

  return IDL.Service({
    getApiDoc: IDL.Func([], [IDL.Text], ["query"]),
    attachUsageSummary: IDL.Func([IDL.Text, UsageSummary], [UnitResult], []),
    removeUsageSummary: IDL.Func([IDL.Text], [UnitResult], []),
    getUsageSummary:    IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Opt(UsageSummary), err: Error })], []),
    // #721: subtype of an Other request (key from serviceTypes.ts SERVICE_SUBTYPES)
    setQuoteRequestSubtype:  IDL.Func([IDL.Text, IDL.Opt(IDL.Text)], [UnitResult], []),
    getQuoteRequestSubtypes: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Text))], ["query"]),
    // Visit times on an accepted quote
    offerVisitTimes:     IDL.Func([IDL.Text, IDL.Vec(VisitSlot), IDL.Text], [VisitResult], []),
    bookVisitTime:       IDL.Func([IDL.Text, IDL.Nat], [VisitResult], []),
    askForNewVisitTimes: IDL.Func([IDL.Text], [VisitResult], []),
    cancelVisit:         IDL.Func([IDL.Text], [VisitResult], []),
    getVisitBookings:    IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(VisitBooking)], ["query"]),
    // In-app payments (Stripe Connect)
    cardPriceFor:           IDL.Func([IDL.Nat], [IDL.Nat], ["query"]),
    getMyPayoutAccount:     IDL.Func([], [IDL.Opt(PayoutAccount)], ["query"]),
    getPayoutReady:         IDL.Func([IDL.Vec(IDL.Principal)], [IDL.Vec(IDL.Tuple(IDL.Principal, IDL.Bool))], ["query"]),
    getJobPayments:         IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(JobPayment)], ["query"]),
    addPaymentRelay:        IDL.Func([IDL.Principal], [UnitResult], []),
    removePaymentRelay:     IDL.Func([IDL.Principal], [UnitResult], []),
    relaySetPayoutAccount:  IDL.Func([IDL.Principal, PayoutAccount], [UnitResult], []),
    relayPrepareJobPayment: IDL.Func([IDL.Text, IDL.Principal], [IDL.Variant({ ok: PaymentTerms, err: Error })], []),
    relayRecordJobPayment:  IDL.Func(
      [IDL.Text, IDL.Principal, JobPaymentMethod, IDL.Nat, IDL.Text],
      [IDL.Variant({ ok: JobPayment, err: Error })],
      []
    ),
    relayUpdateJobPayment:  IDL.Func(
      [IDL.Text, IDL.Text, JobPaymentStatus, IDL.Text],
      [IDL.Variant({ ok: PaymentUpdate, err: Error })],
      []
    ),
    createQuoteRequest: IDL.Func(
      [IDL.Text, ServiceType, IDL.Text, UrgencyLevel, IDL.Opt(IDL.Text),
       IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: QuoteRequest, err: Error })],
      []
    ),
    getQuoteRequest: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: QuoteRequest, err: Error })],
      ["query"]
    ),
    getMyQuoteRequests: IDL.Func([], [IDL.Vec(QuoteRequest)], ["query"]),
    deleteMyData: IDL.Func([], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
    getMyQuotes: IDL.Func([], [IDL.Vec(Quote)], ["query"]),
    getLocalPriceStats: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(IDL.Record({
      low: IDL.Nat, median: IDL.Nat, high: IDL.Nat, sampleSize: IDL.Nat, area: IDL.Text,
    }))], ["query"]),
    getOpenRequests: IDL.Func([], [IDL.Vec(QuoteRequest)], ["query"]),
    getOpenRequestsPage: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(QuoteRequest)], ["query"]),
    getOpenRequestsForMe: IDL.Func([], [IDL.Vec(QuoteRequest)], []),
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
    // Sealed-bid methods
    createSealedBidRequest: IDL.Func(
      [IDL.Text, ServiceType, IDL.Text, UrgencyLevel, IDL.Int,
       IDL.Opt(IDL.Text), IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: QuoteRequest, err: Error })],
      []
    ),
    submitSealedBid: IDL.Func(
      [IDL.Text, IDL.Vec(IDL.Nat8), IDL.Nat],
      [IDL.Variant({ ok: SealedBid, err: Error })],
      []
    ),
    getMyBid: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: SealedBid, err: Error })],
      ["query"]
    ),
    revealBids: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(RevealedBid), err: Error })],
      []
    ),
    getRevealedBids: IDL.Func(
      [IDL.Text],
      [IDL.Vec(RevealedBid)],
      ["query"]
    ),
    // vetKeys IBE methods
    getIbePublicKey: IDL.Func([], [IDL.Vec(IDL.Nat8)], []),
    revealBidsEncrypted: IDL.Func(
      [IDL.Text, IDL.Vec(IDL.Nat8)],
      [IDL.Variant({ ok: SealedBidReveal, err: Error })],
      []
    ),
    setPropertyCanisterId: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setFeeCanisterId: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};
