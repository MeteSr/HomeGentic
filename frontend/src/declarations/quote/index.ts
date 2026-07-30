// Candid interface for the quote canister — keep in sync with backend/quote/main.mo
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
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput: IDL.Text,
  });
  return IDL.Service({
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
    getMyQuotes: IDL.Func([], [IDL.Vec(Quote)], ["query"]),
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
    setPropertyCanisterId: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};
