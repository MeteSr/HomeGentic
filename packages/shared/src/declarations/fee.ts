// Candid interface for the fee canister — keep in sync with backend/fee/main.mo
export const idlFactory = ({ IDL }: any) => {
  const FeeStatus = IDL.Variant({ Owed: IDL.Null, Invoiced: IDL.Null, Paid: IDL.Null, Waived: IDL.Null });
  const FeeRecord = IDL.Record({
    id:          IDL.Text,
    requestId:   IDL.Text,
    proposalId:  IDL.Text,
    agentId:     IDL.Principal,
    homeownerId: IDL.Principal,
    amountCents: IDL.Nat,
    status:      FeeStatus,
    createdAt:   IDL.Int,
    updatedAt:   IDL.Int,
  });
  const ReferralBid = IDL.Record({
    quoteId:     IDL.Text,
    requestId:   IDL.Text,
    contractor:  IDL.Principal,
    homeowner:   IDL.Principal,
    propertyId:  IDL.Text,
    serviceType: IDL.Text,
    bidCents:    IDL.Nat,
    bidAt:       IDL.Int,
  });
  const ReferralFeeStatus = IDL.Variant({
    Pending: IDL.Null, Due: IDL.Null, Paid: IDL.Null, PaymentFailed: IDL.Null, Waived: IDL.Null,
  });
  const ReferralFee = IDL.Record({
    id:          IDL.Text,
    quoteId:     IDL.Text,
    requestId:   IDL.Text,
    contractor:  IDL.Principal,
    homeowner:   IDL.Principal,
    propertyId:  IDL.Text,
    serviceType: IDL.Text,
    bidCents:    IDL.Nat,
    feeCents:    IDL.Nat,
    status:      ReferralFeeStatus,
    reason:      IDL.Text,
    acceptedAt:  IDL.Opt(IDL.Int),
    jobId:       IDL.Opt(IDL.Text),
    dueAt:       IDL.Opt(IDL.Int),
    paymentRef:  IDL.Text,
    payUrl:      IDL.Text,
    failedAt:    IDL.Opt(IDL.Int),
    createdAt:   IDL.Int,
    updatedAt:   IDL.Int,
  });
  const ReferralCard = IDL.Record({
    customerId:      IDL.Text,
    paymentMethodId: IDL.Text,
    brand:           IDL.Text,
    last4:           IDL.Text,
    agreedAt:        IDL.Int,
    termsVersion:    IDL.Text,
  });
  const BidCheck = IDL.Variant({ ok: IDL.Null, needsCard: IDL.Null, overdue: IDL.Null });
  const ChargeItem = IDL.Record({ fee: ReferralFee, card: IDL.Opt(ReferralCard) });
  const Error = IDL.Variant({
    NotFound: IDL.Null, NotAuthorized: IDL.Null, AlreadyExists: IDL.Null, InvalidInput: IDL.Text,
  });

  return IDL.Service({
    recordFeeOwed: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Principal, IDL.Principal, IDL.Nat],
      [IDL.Variant({ ok: FeeRecord, err: Error })],
      []
    ),
    getFeeForRequest: IDL.Func([IDL.Text], [IDL.Opt(FeeRecord)], ["query"]),
    getMyFees: IDL.Func([], [IDL.Vec(FeeRecord)], ["query"]),
    getAllFees: IDL.Func([], [IDL.Variant({ ok: IDL.Vec(FeeRecord), err: Error })], ["query"]),
    getFeesDue: IDL.Func([], [IDL.Variant({ ok: IDL.Vec(FeeRecord), err: Error })], ["query"]),
    markFeeInvoiced: IDL.Func([IDL.Text], [IDL.Variant({ ok: FeeRecord, err: Error })], []),
    markFeePaid: IDL.Func([IDL.Text], [IDL.Variant({ ok: FeeRecord, err: Error })], []),
    waiveFee: IDL.Func([IDL.Text], [IDL.Variant({ ok: FeeRecord, err: Error })], []),
    // Contractor Free referral fee (3% of a winning bid, $20 minimum)
    referralBidAllowed: IDL.Func([IDL.Principal], [BidCheck], ["query"]),
    recordReferralBid: IDL.Func([ReferralBid], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    recordReferralAccepted: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Opt(ReferralFee), err: Error })], []),
    recordReferralJobVerified: IDL.Func(
      [IDL.Text, IDL.Principal, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(ReferralFee), err: Error })],
      []
    ),
    takeDueReferralFees: IDL.Func([], [IDL.Variant({ ok: IDL.Vec(ChargeItem), err: Error })], []),
    relayMarkReferralFeePaid: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: ReferralFee, err: Error })], []),
    relayMarkReferralFeeFailed: IDL.Func([IDL.Text, IDL.Text, IDL.Text], [IDL.Variant({ ok: ReferralFee, err: Error })], []),
    relaySetReferralCard: IDL.Func([IDL.Principal, ReferralCard], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getMyReferralCard: IDL.Func([], [IDL.Opt(ReferralCard)], ["query"]),
    getMyReferralFees: IDL.Func([], [IDL.Vec(ReferralFee)], ["query"]),
    getAllReferralFees: IDL.Func([], [IDL.Variant({ ok: IDL.Vec(ReferralFee), err: Error })], ["query"]),
    waiveReferralFee: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: ReferralFee, err: Error })], []),
    setQuoteCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setJobCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    addReferralRelay: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    removeReferralRelay: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setListingCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setUpdateRateLimit: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    initAdmins: IDL.Func([IDL.Vec(IDL.Principal), IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setBootstrapNonce: IDL.Func([IDL.Text], [], []),
    addAdmin: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    removeAdmin: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    pause: IDL.Func([IDL.Opt(IDL.Nat)], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    unpause: IDL.Func([], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    metrics: IDL.Func([], [IDL.Record({
      totalFees: IDL.Nat, owedCents: IDL.Nat, paidCents: IDL.Nat, isPaused: IDL.Bool,
    })], ["query"]),
  });
};
