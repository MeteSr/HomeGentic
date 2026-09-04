// Candid interface for the listing canister — keep in sync with backend/listing/main.mo
export const idlFactory = ({ IDL }: any) => {
  const BidRequestStatus = IDL.Variant({
    Open: IDL.Null, Awarded: IDL.Null, Cancelled: IDL.Null,
  });
  const ProposalStatus = IDL.Variant({
    Pending: IDL.Null, Accepted: IDL.Null, Rejected: IDL.Null, Withdrawn: IDL.Null,
  });
  const WindowDays = IDL.Variant({ Three: IDL.Null, Seven: IDL.Null, Fourteen: IDL.Null });
  const MessageRole = IDL.Variant({ seller: IDL.Null, agent: IDL.Null });

  const ListingBidRequest = IDL.Record({
    id:               IDL.Text,
    propertyId:       IDL.Text,
    homeowner:        IDL.Principal,
    address:          IDL.Text,
    city:             IDL.Text,
    county:           IDL.Text,
    zipCode:          IDL.Text,
    homeownerEmail:   IDL.Text,
    beds:             IDL.Opt(IDL.Nat),
    baths:            IDL.Opt(IDL.Nat),
    sqft:             IDL.Opt(IDL.Nat),
    targetListDate:   IDL.Int,
    desiredSalePrice: IDL.Opt(IDL.Nat),
    notes:            IDL.Text,
    windowDays:       WindowDays,
    bidDeadline:      IDL.Int,
    status:           BidRequestStatus,
    feePaid:          IDL.Bool,
    createdAt:        IDL.Int,
  });

  const BidRequestSummary = IDL.Record({
    id:               IDL.Text,
    city:             IDL.Text,
    county:           IDL.Text,
    zipCode:          IDL.Text,
    beds:             IDL.Opt(IDL.Nat),
    baths:            IDL.Opt(IDL.Nat),
    sqft:             IDL.Opt(IDL.Nat),
    targetListDate:   IDL.Int,
    desiredSalePrice: IDL.Opt(IDL.Nat),
    notes:            IDL.Text,
    windowDays:       WindowDays,
    bidDeadline:      IDL.Int,
    status:           BidRequestStatus,
    proposalCount:    IDL.Nat,
    openSlots:        IDL.Nat,
    createdAt:        IDL.Int,
  });

  const DerivedSignals = IDL.Record({
    estNetToSellerCents: IDL.Nat,
    pctVsCompsBps:       IDL.Int,
    overCompFlag:        IDL.Bool,
    thinCompsFlag:       IDL.Bool,
  });

  const AgentRecordSnapshot = IDL.Record({
    closedInZip:        IDL.Nat,
    avgDom:              IDL.Nat,
    saleToListRatioBps: IDL.Nat,
    withdrawnUnsold:     IDL.Nat,
    commitmentsUnmet:    IDL.Nat,
  });

  const ListingProposal = IDL.Record({
    id:                    IDL.Text,
    requestId:             IDL.Text,
    agentId:               IDL.Principal,
    agentName:             IDL.Text,
    agentEmail:            IDL.Text,
    agentBrokerage:        IDL.Text,
    letter:                IDL.Text,
    commissionBps:         IDL.Nat,
    suggestedListCents:    IDL.Nat,
    cmaSummary:            IDL.Text,
    marketingPlan:         IDL.Text,
    marketingCommitments:  IDL.Vec(IDL.Text),
    estimatedDaysOnMarket: IDL.Nat,
    includedServices:      IDL.Vec(IDL.Text),
    validUntil:            IDL.Int,
    coverLetter:           IDL.Text,
    status:                ProposalStatus,
    derived:               DerivedSignals,
    agentRecord:           AgentRecordSnapshot,
    createdAt:             IDL.Int,
  });

  const MaskedProposal = IDL.Record({
    id:                    IDL.Text,
    requestId:             IDL.Text,
    letter:                IDL.Text,
    commissionBps:         IDL.Nat,
    suggestedListCents:    IDL.Nat,
    cmaSummary:            IDL.Text,
    marketingPlan:         IDL.Text,
    marketingCommitments:  IDL.Vec(IDL.Text),
    estimatedDaysOnMarket: IDL.Nat,
    status:                ProposalStatus,
    derived:               DerivedSignals,
    agentRecord:           AgentRecordSnapshot,
    isMine:                IDL.Bool,
    agentName:             IDL.Opt(IDL.Text),
    agentEmail:            IDL.Opt(IDL.Text),
    agentBrokerage:        IDL.Opt(IDL.Text),
    createdAt:             IDL.Int,
  });

  const Message = IDL.Record({
    id:           IDL.Text,
    proposalId:   IDL.Text,
    authorRole:   MessageRole,
    scrubbedBody: IDL.Text,
    redactions:   IDL.Vec(IDL.Text),
    sentAt:       IDL.Int,
  });

  const CompsConfig = IDL.Record({ medianCents: IDL.Nat, saleCount: IDL.Nat });
  const PhotoReviewState = IDL.Record({ flagged: IDL.Bool, reviewed: IDL.Bool });

  const Error = IDL.Variant({
    NotFound: IDL.Null, NotAuthorized: IDL.Null, InvalidInput: IDL.Text,
    AlreadyCancelled: IDL.Null, DeadlinePassed: IDL.Null, SlotsFull: IDL.Null,
  });

  const PanoramaEntry = IDL.Record({ roomLabel: IDL.Text, photoId: IDL.Text });

  const PublicFsboListing = IDL.Record({
    propertyId:        IDL.Text,
    homeowner:         IDL.Principal,
    listPriceCents:    IDL.Nat,
    activatedAt:       IDL.Int,
    address:           IDL.Text,
    city:              IDL.Text,
    state:             IDL.Text,
    zipCode:           IDL.Text,
    propertyType:      IDL.Text,
    yearBuilt:         IDL.Nat,
    squareFeet:        IDL.Nat,
    bedrooms:          IDL.Nat,
    bathrooms:         IDL.Nat,
    verificationLevel: IDL.Text,
    score:             IDL.Opt(IDL.Nat),
    verifiedJobCount:  IDL.Nat,
    description:       IDL.Opt(IDL.Text),
    photoUrl:          IDL.Opt(IDL.Text),
    hasPublicReport:   IDL.Bool,
    systemHighlights:  IDL.Vec(IDL.Text),
  });

  return IDL.Service({
    activateFsboListing: IDL.Func([PublicFsboListing], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    deactivateFsboListing: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    listActiveFsboListings: IDL.Func([], [IDL.Vec(PublicFsboListing)], ["query"]),

    createBidRequest: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Text, IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat), IDL.Opt(IDL.Nat), IDL.Int, IDL.Opt(IDL.Nat), IDL.Text, WindowDays],
      [IDL.Variant({ ok: ListingBidRequest, err: Error })],
      []
    ),
    getMyBidRequests: IDL.Func([], [IDL.Vec(ListingBidRequest)], ["query"]),
    getBidRequest: IDL.Func([IDL.Text], [IDL.Variant({ ok: ListingBidRequest, err: Error })], ["query"]),
    cancelBidRequest: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getOpenBidRequests: IDL.Func([], [IDL.Vec(BidRequestSummary)], ["query"]),

    flagPhotoForReview: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    reviewPhoto: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPhotoReviewState: IDL.Func([IDL.Text], [IDL.Opt(PhotoReviewState)], ["query"]),

    submitProposal: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Nat, IDL.Text, IDL.Text, IDL.Vec(IDL.Text), IDL.Nat, IDL.Vec(IDL.Text), IDL.Int, IDL.Text],
      [IDL.Variant({ ok: ListingProposal, err: Error })],
      []
    ),
    withdrawProposal: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getProposalsForRequest: IDL.Func([IDL.Text], [IDL.Vec(MaskedProposal)], ["query"]),
    getBidProgress: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Record({ count: IDL.Nat, sealed: IDL.Bool }), err: Error })], ["query"]),
    getMyProposals: IDL.Func([], [IDL.Vec(ListingProposal)], ["query"]),

    acceptProposal: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Text, err: Error })], []),
    markListingFeePaid: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),

    postMessage: IDL.Func([IDL.Text, IDL.Text, MessageRole], [IDL.Variant({ ok: Message, err: Error })], []),
    getThread: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(Message), err: Error })], ["query"]),

    setCompsMedian: IDL.Func([IDL.Text, IDL.Nat, IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getCompsMedian: IDL.Func([IDL.Text], [IDL.Opt(CompsConfig)], ["query"]),
    setPlatformFeeCents: IDL.Func([IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPlatformFee: IDL.Func([], [IDL.Nat], ["query"]),

    addListingPhoto: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getListingPhotos: IDL.Func([IDL.Text], [IDL.Vec(IDL.Text)], ["query"]),
    removeListingPhoto: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    reorderListingPhotos: IDL.Func([IDL.Text, IDL.Vec(IDL.Text)], [IDL.Variant({ ok: IDL.Null, err: Error })], []),

    setPropertyCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setJobCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setReportCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setMarketCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setAgentCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    setFeeCanisterId: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),

    addPanorama: IDL.Func([IDL.Text, IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPanoramas: IDL.Func([IDL.Text], [IDL.Vec(PanoramaEntry)], ["query"]),
    removePanorama: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
  });
};
