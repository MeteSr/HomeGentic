// Generated from ../declarations/listing.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type OfferResult = { ok: FsboOffer } | { err: Error };

export type FsboOffer = {
  id: string;
  status: FsboOfferStatus;
  closeDate: bigint;
  earnestMoneyCents: bigint;
  hasEscalationClause: boolean;
  offerAmountCents: bigint;
  propertyId: string;
  counters: FsboCounter[];
  buyerName: string;
  contingencies: string[];
  loggedAt: bigint;
};

export type FsboOfferStatus = { Countered: null } | { Active: null } | { Rejected: null } | { Accepted: null };

export type FsboCounter = {
  id: string;
  createdAt: bigint;
  amountCents: bigint;
  notes: string;
  fromSeller: boolean;
};

export type Error =
  | { InvalidInput: string }
  | { DeadlinePassed: null }
  | { SlotsFull: null }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { AlreadyCancelled: null };

export type PublicFsboListing = {
  propertyType: string;
  systemHighlights: string[];
  bedrooms: bigint;
  activatedAt: bigint;
  city: string;
  squareFeet: bigint;
  description: [] | [string];
  photoUrl: [] | [string];
  propertyId: string;
  hasPublicReport: boolean;
  listPriceCents: bigint;
  zipCode: string;
  score: [] | [bigint];
  state: string;
  address: string;
  verificationLevel: string;
  bathrooms: bigint;
  homeowner: Principal;
  verifiedJobCount: bigint;
  yearBuilt: bigint;
};

export type WindowDays = { Seven: null } | { Fourteen: null } | { Three: null };

export type ListingBidRequest = {
  id: string;
  status: BidRequestStatus;
  homeownerEmail: string;
  targetListDate: bigint;
  desiredSalePrice: [] | [bigint];
  beds: [] | [bigint];
  city: string;
  createdAt: bigint;
  sqft: [] | [bigint];
  feePaid: boolean;
  propertyId: string;
  zipCode: string;
  address: string;
  notes: string;
  baths: [] | [bigint];
  county: string;
  windowDays: WindowDays;
  homeowner: Principal;
  bidDeadline: bigint;
};

export type BidRequestStatus = { Open: null } | { Awarded: null } | { Cancelled: null };

export type CompsConfig = {
  medianCents: bigint;
  saleCount: bigint;
};

export type FsboDraft = {
  startedAt: bigint;
  owner: Principal;
  step: bigint;
  description: [] | [string];
  listPriceCents: bigint;
  updatedAt: bigint;
};

export type FsboPricePoint = {
  recordedAt: bigint;
  priceCents: bigint;
};

export type ListingProposal = {
  id: string;
  status: ProposalStatus;
  agentRecord: AgentRecordSnapshot;
  marketingPlan: string;
  suggestedListCents: bigint;
  requestId: string;
  cmaSummary: string;
  createdAt: bigint;
  commissionBps: bigint;
  agentName: string;
  coverLetter: string;
  agentId: Principal;
  agentBrokerage: string;
  marketingCommitments: string[];
  derived: DerivedSignals;
  agentEmail: string;
  estimatedDaysOnMarket: bigint;
  letter: string;
  includedServices: string[];
  validUntil: bigint;
};

export type ProposalStatus = { Withdrawn: null } | { Rejected: null } | { Accepted: null } | { Pending: null };

export type AgentRecordSnapshot = {
  commitmentsUnmet: bigint;
  saleToListRatioBps: bigint;
  withdrawnUnsold: bigint;
  closedInZip: bigint;
  avgDom: bigint;
};

export type DerivedSignals = {
  pctVsCompsBps: bigint;
  estNetToSellerCents: bigint;
  thinCompsFlag: boolean;
  overCompFlag: boolean;
};

export type NotifyEvent = {
  seq: bigint;
  kind: string;
  createdAt: bigint;
  recipient: [] | [Principal];
  summary: string;
  refId: string;
};

export type BidRequestSummary = {
  id: string;
  status: BidRequestStatus;
  targetListDate: bigint;
  desiredSalePrice: [] | [bigint];
  beds: [] | [bigint];
  city: string;
  createdAt: bigint;
  sqft: [] | [bigint];
  zipCode: string;
  notes: string;
  baths: [] | [bigint];
  proposalCount: bigint;
  county: string;
  windowDays: WindowDays;
  bidDeadline: bigint;
  openSlots: bigint;
};

export type PanoramaEntry = {
  roomLabel: string;
  photoId: string;
};

export type PhotoReviewState = {
  reviewed: boolean;
  flagged: boolean;
};

export type MaskedProposal = {
  id: string;
  status: ProposalStatus;
  agentRecord: AgentRecordSnapshot;
  marketingPlan: string;
  suggestedListCents: bigint;
  requestId: string;
  cmaSummary: string;
  createdAt: bigint;
  commissionBps: bigint;
  agentName: [] | [string];
  agentBrokerage: [] | [string];
  isMine: boolean;
  marketingCommitments: string[];
  derived: DerivedSignals;
  agentEmail: [] | [string];
  estimatedDaysOnMarket: bigint;
  letter: string;
};

export type ShowingRequest = {
  id: string;
  status: ShowingStatus;
  requester: Principal;
  contact: string;
  name: string;
  createdAt: bigint;
  propertyId: string;
  alternateTime: [] | [string];
  preferredTime: string;
};

export type ShowingStatus = { Accepted: null } | { Declined: null } | { AlternateProposed: null } | { Pending: null };

export type Message = {
  id: string;
  authorRole: MessageRole;
  scrubbedBody: string;
  sentAt: bigint;
  redactions: string[];
  proposalId: string;
};

export type MessageRole = { agent: null } | { seller: null };

export type FsboOfferInput = {
  closeDate: bigint;
  earnestMoneyCents: bigint;
  hasEscalationClause: boolean;
  offerAmountCents: bigint;
  buyerName: string;
  contingencies: string[];
};

export type ShowingResult = { ok: ShowingRequest } | { err: Error };

export type ShowingResponse = { Accept: null } | { ProposeAlternate: string } | { Decline: null };

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  acceptFsboOffer: ActorMethod<[string, string], OfferResult>;
  acceptProposal: ActorMethod<[string], { ok: string } | { err: Error }>;
  activateFsboListing: ActorMethod<[PublicFsboListing], { ok: null } | { err: Error }>;
  addListingPhoto: ActorMethod<[string, string], { ok: null } | { err: Error }>;
  addNotifier: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  addPanorama: ActorMethod<[string, string, string], { ok: null } | { err: Error }>;
  addShowingRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  cancelBidRequest: ActorMethod<[string], { ok: null } | { err: Error }>;
  counterFsboOffer: ActorMethod<[string, string, bigint, string, boolean], OfferResult>;
  createBidRequest: ActorMethod<
    [
      string,
      string,
      string,
      string,
      string,
      string,
      [] | [bigint],
      [] | [bigint],
      [] | [bigint],
      bigint,
      [] | [bigint],
      string,
      WindowDays,
    ],
    { ok: ListingBidRequest } | { err: Error }
  >;
  deactivateFsboListing: ActorMethod<[string], { ok: null } | { err: Error }>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  discardFsboDraft: ActorMethod<[string], { ok: null } | { err: Error }>;
  flagPhotoForReview: ActorMethod<[string], { ok: null } | { err: Error }>;
  getBidProgress: ActorMethod<
    [string],
    | {
        ok: {
          count: bigint;
          sealed: boolean;
        };
      }
    | { err: Error }
  >;
  getBidRequest: ActorMethod<[string], { ok: ListingBidRequest } | { err: Error }>;
  getCompsMedian: ActorMethod<[string], [] | [CompsConfig]>;
  getFsboDraft: ActorMethod<[string], [] | [FsboDraft]>;
  getFsboListing: ActorMethod<[string], [] | [PublicFsboListing]>;
  getFsboOffers: ActorMethod<[string], { ok: FsboOffer[] } | { err: Error }>;
  getFsboPriceHistory: ActorMethod<[string], FsboPricePoint[]>;
  getListingPhotos: ActorMethod<[string], string[]>;
  getMyBidRequests: ActorMethod<[], ListingBidRequest[]>;
  getMyProposals: ActorMethod<[], ListingProposal[]>;
  getNotificationEvents: ActorMethod<
    [bigint, bigint],
    | {
        ok: {
          latestSeq: bigint;
          events: NotifyEvent[];
        };
      }
    | { err: Error }
  >;
  getOpenBidRequests: ActorMethod<[], BidRequestSummary[]>;
  getOpenBidRequestsPage: ActorMethod<[bigint, bigint], BidRequestSummary[]>;
  getPanoramas: ActorMethod<[string], PanoramaEntry[]>;
  getPhotoReviewState: ActorMethod<[string], [] | [PhotoReviewState]>;
  getPlatformFee: ActorMethod<[], bigint>;
  getProposalsForRequest: ActorMethod<[string], MaskedProposal[]>;
  getShowingRequests: ActorMethod<[string], { ok: ShowingRequest[] } | { err: Error }>;
  getThread: ActorMethod<[string], { ok: Message[] } | { err: Error }>;
  isFsboScoreHidden: ActorMethod<[string], boolean>;
  listActiveFsboListings: ActorMethod<[], PublicFsboListing[]>;
  listActiveFsboListingsPage: ActorMethod<[bigint, bigint], PublicFsboListing[]>;
  logFsboOffer: ActorMethod<[string, FsboOfferInput], OfferResult>;
  markListingFeePaid: ActorMethod<[string, string], { ok: null } | { err: Error }>;
  postMessage: ActorMethod<[string, string, MessageRole], { ok: Message } | { err: Error }>;
  propertyTransferred: ActorMethod<[string], { ok: null } | { err: Error }>;
  rejectFsboOffer: ActorMethod<[string, string], OfferResult>;
  relayRequestShowing: ActorMethod<[string, Principal, string, string, string], ShowingResult>;
  removeListingPhoto: ActorMethod<[string, string], { ok: null } | { err: Error }>;
  removeNotifier: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  removePanorama: ActorMethod<[string, string], { ok: null } | { err: Error }>;
  removeShowingRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  reorderListingPhotos: ActorMethod<[string, string[]], { ok: null } | { err: Error }>;
  requestShowing: ActorMethod<[string, string, string, string], ShowingResult>;
  respondToShowing: ActorMethod<[string, string, ShowingResponse], ShowingResult>;
  reviewPhoto: ActorMethod<[string], { ok: null } | { err: Error }>;
  saveFsboDraft: ActorMethod<[string, bigint, [] | [string], bigint], { ok: FsboDraft } | { err: Error }>;
  setAgentCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setCompsMedian: ActorMethod<[string, bigint, bigint], { ok: null } | { err: Error }>;
  setFeeCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setFsboScoreVisible: ActorMethod<[string, boolean], { ok: PublicFsboListing } | { err: Error }>;
  setJobCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setMarketCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setPhotoCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setPlatformFeeCents: ActorMethod<[bigint], { ok: null } | { err: Error }>;
  setPropertyCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setReportCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  submitProposal: ActorMethod<
    [string, bigint, bigint, string, string, string[], bigint, string[], bigint, string],
    { ok: ListingProposal } | { err: Error }
  >;
  updateFsboPrice: ActorMethod<[string, bigint], { ok: PublicFsboListing } | { err: Error }>;
  withdrawProposal: ActorMethod<[string], { ok: null } | { err: Error }>;
}
