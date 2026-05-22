// Candid interface for the listing canister — keep in sync with backend/listing/main.mo
export const idlFactory = ({ IDL }: any) => {
  const BidRequestStatus = IDL.Variant({
    Open: IDL.Null, Awarded: IDL.Null, Cancelled: IDL.Null,
  });
  const ProposalStatus = IDL.Variant({
    Pending: IDL.Null, Accepted: IDL.Null, Rejected: IDL.Null, Withdrawn: IDL.Null,
  });
  const ListingBidRequest = IDL.Record({
    id:               IDL.Text,
    propertyId:       IDL.Text,
    homeowner:        IDL.Principal,
    targetListDate:   IDL.Int,
    desiredSalePrice: IDL.Opt(IDL.Nat),
    notes:            IDL.Text,
    bidDeadline:      IDL.Int,
    status:           BidRequestStatus,
    createdAt:        IDL.Int,
  });
  const ListingProposal = IDL.Record({
    id:                    IDL.Text,
    requestId:             IDL.Text,
    agentId:               IDL.Principal,
    agentName:             IDL.Text,
    agentBrokerage:        IDL.Text,
    commissionBps:         IDL.Nat,
    cmaSummary:            IDL.Text,
    marketingPlan:         IDL.Text,
    estimatedDaysOnMarket: IDL.Nat,
    estimatedSalePrice:    IDL.Nat,
    includedServices:      IDL.Vec(IDL.Text),
    validUntil:            IDL.Int,
    coverLetter:           IDL.Text,
    status:                ProposalStatus,
    createdAt:             IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound: IDL.Null, NotAuthorized: IDL.Null, InvalidInput: IDL.Text,
    AlreadyCancelled: IDL.Null, DeadlinePassed: IDL.Null,
  });
  const PanoramaEntry = IDL.Record({
    roomLabel: IDL.Text,
    photoId:   IDL.Text,
  });
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
    activateFsboListing: IDL.Func(
      [PublicFsboListing],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    deactivateFsboListing: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    listActiveFsboListings: IDL.Func([], [IDL.Vec(PublicFsboListing)], ["query"]),
    createBidRequest: IDL.Func(
      [IDL.Text, IDL.Int, IDL.Opt(IDL.Nat), IDL.Text, IDL.Int],
      [IDL.Variant({ ok: ListingBidRequest, err: Error })],
      []
    ),
    getMyBidRequests: IDL.Func([], [IDL.Vec(ListingBidRequest)], ["query"]),
    getBidRequest: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: ListingBidRequest, err: Error })],
      ["query"]
    ),
    cancelBidRequest: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getOpenBidRequests: IDL.Func([], [IDL.Vec(ListingBidRequest)], ["query"]),
    submitProposal: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Nat, IDL.Text, IDL.Text, IDL.Nat, IDL.Nat, IDL.Vec(IDL.Text), IDL.Int, IDL.Text],
      [IDL.Variant({ ok: ListingProposal, err: Error })],
      []
    ),
    getProposalsForRequest: IDL.Func(
      [IDL.Text],
      [IDL.Vec(ListingProposal)],
      ["query"]
    ),
    getMyProposals: IDL.Func([], [IDL.Vec(ListingProposal)], ["query"]),
    acceptProposal: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    addListingPhoto: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getListingPhotos: IDL.Func([IDL.Text], [IDL.Vec(IDL.Text)], ["query"]),
    removeListingPhoto: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    reorderListingPhotos: IDL.Func(
      [IDL.Text, IDL.Vec(IDL.Text)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setPropertyCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setJobCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setReportCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setMarketCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    addPanorama: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getPanoramas: IDL.Func([IDL.Text], [IDL.Vec(PanoramaEntry)], ["query"]),
    removePanorama: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};
