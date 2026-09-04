import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/listing";
export { idlFactory };

const LISTING_CANISTER_ID = (process.env as any).LISTING_CANISTER_ID || "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PanoramaEntry {
  roomLabel: string;
  photoId:   string;
}

export type BidRequestStatus = "Open" | "Awarded" | "Cancelled";
export type ProposalStatus   = "Pending" | "Accepted" | "Rejected" | "Withdrawn";
export type WindowDays       = "Three" | "Seven" | "Fourteen";
export type MessageRole      = "seller" | "agent";

export interface DerivedSignals {
  estNetToSellerCents: number;
  pctVsCompsBps:       number;
  overCompFlag:        boolean;
  thinCompsFlag:       boolean;
}

export interface AgentRecordSnapshot {
  closedInZip:        number;
  avgDom:              number;
  saleToListRatioBps: number;
  withdrawnUnsold:     number;
  commitmentsUnmet:    number;
}

export interface ListingBidRequest {
  id:               string;
  propertyId:       string;
  homeowner:        string;
  address:          string;   // "" when redacted (invariant 01)
  city:             string;
  county:           string;
  zipCode:          string;
  homeownerEmail:   string;   // "" when redacted
  beds:             number | null;
  baths:            number | null;
  sqft:             number | null;
  targetListDate:   number;   // ms epoch
  desiredSalePrice: number | null;
  notes:            string;
  windowDays:       WindowDays;
  bidDeadline:      number;   // ms epoch
  status:           BidRequestStatus;
  feePaid:          boolean;
  createdAt:        number;
}

export interface BidRequestSummary {
  id:               string;
  city:             string;
  county:           string;
  zipCode:          string;
  beds:             number | null;
  baths:            number | null;
  sqft:             number | null;
  targetListDate:   number;
  desiredSalePrice: number | null;
  notes:            string;
  windowDays:       WindowDays;
  bidDeadline:      number;
  status:           BidRequestStatus;
  proposalCount:    number;
  openSlots:        number;
  createdAt:        number;
}

export interface ListingProposal {
  id:                    string;
  requestId:             string;
  agentId:               string;
  agentName:             string;
  agentEmail:            string;
  agentBrokerage:        string;
  letter:                string;
  commissionBps:         number;
  suggestedListCents:    number;
  cmaSummary:            string;
  marketingPlan:         string;
  marketingCommitments:  string[];
  estimatedDaysOnMarket: number;
  includedServices:      string[];
  validUntil:            number;
  coverLetter:           string;
  status:                ProposalStatus;
  derived:               DerivedSignals;
  agentRecord:           AgentRecordSnapshot;
  createdAt:             number;
}

/** Board view — masked (letter, no name) until feePaid or the caller's own bid. */
export interface MaskedProposal {
  id:                    string;
  requestId:             string;
  letter:                string;
  commissionBps:         number;
  suggestedListCents:    number;
  cmaSummary:            string;
  marketingPlan:         string;
  marketingCommitments:  string[];
  estimatedDaysOnMarket: number;
  status:                ProposalStatus;
  derived:               DerivedSignals;
  agentRecord:           AgentRecordSnapshot;
  isMine:                boolean;
  agentName:             string | null;
  agentEmail:            string | null;
  agentBrokerage:        string | null;
  createdAt:             number;
}

export interface ThreadMessage {
  id:           string;
  proposalId:   string;
  authorRole:   MessageRole;
  scrubbedBody: string;
  redactions:   string[];
  sentAt:       number;
}

export interface CompsConfig {
  medianCents: number;
  saleCount:   number;
}

export interface CreateBidRequestInput {
  propertyId:       string;
  address:          string;
  city:             string;
  county:           string;
  zipCode:          string;
  homeownerEmail:   string;
  beds?:            number | null;
  baths?:           number | null;
  sqft?:            number | null;
  targetListDate:   number;   // ms epoch
  desiredSalePrice?: number | null;
  notes:            string;
  windowDays:       WindowDays;
}

export interface SubmitProposalInput {
  commissionBps:         number;
  suggestedListCents:    number;
  cmaSummary:            string;
  marketingPlan:         string;
  marketingCommitments:  string[];
  estimatedDaysOnMarket: number;
  includedServices:      string[];
  validUntil:            number;  // ms epoch
  coverLetter:           string;
}

function toWindowDaysVariant(w: WindowDays) {
  return { [w]: null };
}

function fromWindowDays(raw: any): WindowDays {
  return Object.keys(raw)[0] as WindowDays;
}

function optToNullableNumber(opt: any[]): number | null {
  return opt.length > 0 ? Number(opt[0]) : null;
}

function fromRawRequest(raw: any): ListingBidRequest {
  return {
    id:               raw.id,
    propertyId:       raw.propertyId,
    homeowner:        raw.homeowner.toText(),
    address:          raw.address,
    city:             raw.city,
    county:           raw.county,
    zipCode:          raw.zipCode,
    homeownerEmail:   raw.homeownerEmail,
    beds:             optToNullableNumber(raw.beds),
    baths:            optToNullableNumber(raw.baths),
    sqft:             optToNullableNumber(raw.sqft),
    targetListDate:   Number(raw.targetListDate / 1_000_000n),
    desiredSalePrice: optToNullableNumber(raw.desiredSalePrice),
    notes:            raw.notes,
    windowDays:       fromWindowDays(raw.windowDays),
    bidDeadline:      Number(raw.bidDeadline / 1_000_000n),
    status:           Object.keys(raw.status)[0] as BidRequestStatus,
    feePaid:          raw.feePaid,
    createdAt:        Number(raw.createdAt / 1_000_000n),
  };
}

function fromRawSummary(raw: any): BidRequestSummary {
  return {
    id:               raw.id,
    city:             raw.city,
    county:           raw.county,
    zipCode:          raw.zipCode,
    beds:             optToNullableNumber(raw.beds),
    baths:            optToNullableNumber(raw.baths),
    sqft:             optToNullableNumber(raw.sqft),
    targetListDate:   Number(raw.targetListDate / 1_000_000n),
    desiredSalePrice: optToNullableNumber(raw.desiredSalePrice),
    notes:            raw.notes,
    windowDays:       fromWindowDays(raw.windowDays),
    bidDeadline:      Number(raw.bidDeadline / 1_000_000n),
    status:           Object.keys(raw.status)[0] as BidRequestStatus,
    proposalCount:    Number(raw.proposalCount),
    openSlots:        Number(raw.openSlots),
    createdAt:        Number(raw.createdAt / 1_000_000n),
  };
}

function fromRawDerived(raw: any): DerivedSignals {
  return {
    estNetToSellerCents: Number(raw.estNetToSellerCents),
    pctVsCompsBps:       Number(raw.pctVsCompsBps),
    overCompFlag:        raw.overCompFlag,
    thinCompsFlag:       raw.thinCompsFlag,
  };
}

function fromRawAgentRecord(raw: any): AgentRecordSnapshot {
  return {
    closedInZip:        Number(raw.closedInZip),
    avgDom:              Number(raw.avgDom),
    saleToListRatioBps: Number(raw.saleToListRatioBps),
    withdrawnUnsold:     Number(raw.withdrawnUnsold),
    commitmentsUnmet:    Number(raw.commitmentsUnmet),
  };
}

function fromRawProposal(raw: any): ListingProposal {
  return {
    id:                    raw.id,
    requestId:             raw.requestId,
    agentId:               raw.agentId.toText(),
    agentName:             raw.agentName,
    agentEmail:            raw.agentEmail,
    agentBrokerage:        raw.agentBrokerage,
    letter:                raw.letter,
    commissionBps:         Number(raw.commissionBps),
    suggestedListCents:    Number(raw.suggestedListCents),
    cmaSummary:            raw.cmaSummary,
    marketingPlan:         raw.marketingPlan,
    marketingCommitments:  raw.marketingCommitments,
    estimatedDaysOnMarket: Number(raw.estimatedDaysOnMarket),
    includedServices:      raw.includedServices,
    validUntil:            Number(raw.validUntil / 1_000_000n),
    coverLetter:           raw.coverLetter,
    status:                Object.keys(raw.status)[0] as ProposalStatus,
    derived:               fromRawDerived(raw.derived),
    agentRecord:           fromRawAgentRecord(raw.agentRecord),
    createdAt:             Number(raw.createdAt / 1_000_000n),
  };
}

function fromRawMasked(raw: any): MaskedProposal {
  return {
    id:                    raw.id,
    requestId:             raw.requestId,
    letter:                raw.letter,
    commissionBps:         Number(raw.commissionBps),
    suggestedListCents:    Number(raw.suggestedListCents),
    cmaSummary:            raw.cmaSummary,
    marketingPlan:         raw.marketingPlan,
    marketingCommitments:  raw.marketingCommitments,
    estimatedDaysOnMarket: Number(raw.estimatedDaysOnMarket),
    status:                Object.keys(raw.status)[0] as ProposalStatus,
    derived:               fromRawDerived(raw.derived),
    agentRecord:           fromRawAgentRecord(raw.agentRecord),
    isMine:                raw.isMine,
    agentName:             raw.agentName.length > 0 ? raw.agentName[0] : null,
    agentEmail:            raw.agentEmail.length > 0 ? raw.agentEmail[0] : null,
    agentBrokerage:        raw.agentBrokerage.length > 0 ? raw.agentBrokerage[0] : null,
    createdAt:             Number(raw.createdAt / 1_000_000n),
  };
}

function fromRawMessage(raw: any): ThreadMessage {
  return {
    id:           raw.id,
    proposalId:   raw.proposalId,
    authorRole:   Object.keys(raw.authorRole)[0] as MessageRole,
    scrubbedBody: raw.scrubbedBody,
    redactions:   raw.redactions,
    sentAt:       Number(raw.sentAt / 1_000_000n),
  };
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createListingService() {
  let _actor: any = null;

  async function getActor() {
    if (_actor) return _actor;
    const agent = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent, canisterId: LISTING_CANISTER_ID });
    return _actor;
  }

  return {
  reset() { _actor = null; },

  // ── Homeowner: bid request lifecycle ────────────────────────────────────────

  async createBidRequest(input: CreateBidRequestInput): Promise<ListingBidRequest> {
    const actor = await getActor();
    const result = await actor.createBidRequest(
      input.propertyId, input.address, input.city, input.county, input.zipCode,
      input.homeownerEmail,
      input.beds != null ? [BigInt(input.beds)] : [],
      input.baths != null ? [BigInt(input.baths)] : [],
      input.sqft != null ? [BigInt(input.sqft)] : [],
      BigInt(input.targetListDate) * 1_000_000n,
      input.desiredSalePrice != null ? [BigInt(input.desiredSalePrice)] : [],
      input.notes,
      toWindowDaysVariant(input.windowDays),
    );
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return fromRawRequest(result.ok);
  },

  async getMyBidRequests(): Promise<ListingBidRequest[]> {
    const actor = await getActor();
    const raw = await actor.getMyBidRequests();
    return raw.map(fromRawRequest);
  },

  async getBidRequest(id: string): Promise<ListingBidRequest | null> {
    const actor = await getActor();
    const result = await actor.getBidRequest(id);
    if ("err" in result) return null;
    return fromRawRequest(result.ok);
  },

  async cancelBidRequest(id: string): Promise<void> {
    const actor = await getActor();
    const result = await actor.cancelBidRequest(id);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  /** Masked opportunity feed for the agent browse screen (A2). Slot count only — invariant 03. */
  async getOpenBidRequests(): Promise<BidRequestSummary[]> {
    const actor = await getActor();
    const raw = await actor.getOpenBidRequests();
    return raw.map(fromRawSummary);
  },

  // ── H1 photo review gate (v1 manual-flag stand-in for a real scan) ─────────

  async flagPhotoForReview(photoId: string): Promise<void> {
    const actor = await getActor();
    const result = await actor.flagPhotoForReview(photoId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  async reviewPhoto(photoId: string): Promise<void> {
    const actor = await getActor();
    const result = await actor.reviewPhoto(photoId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  async getPhotoReviewState(photoId: string): Promise<{ flagged: boolean; reviewed: boolean } | null> {
    const actor = await getActor();
    const raw = await actor.getPhotoReviewState(photoId);
    return raw.length > 0 ? raw[0] : null;
  },

  // ── Agent: proposal lifecycle ───────────────────────────────────────────────

  async submitProposal(requestId: string, input: SubmitProposalInput): Promise<ListingProposal> {
    const actor = await getActor();
    const result = await actor.submitProposal(
      requestId,
      BigInt(input.commissionBps),
      BigInt(input.suggestedListCents),
      input.cmaSummary,
      input.marketingPlan,
      input.marketingCommitments,
      BigInt(input.estimatedDaysOnMarket),
      input.includedServices,
      BigInt(input.validUntil) * 1_000_000n,
      input.coverLetter,
    );
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return fromRawProposal(result.ok);
  },

  async withdrawProposal(proposalId: string): Promise<void> {
    const actor = await getActor();
    const result = await actor.withdrawProposal(proposalId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  /** Sealed until three bids or the window closes (invariant 02); masked until feePaid (invariant 04). */
  async getProposalsForRequest(requestId: string): Promise<MaskedProposal[]> {
    const actor = await getActor();
    const raw = await actor.getProposalsForRequest(requestId);
    return raw.map(fromRawMasked);
  },

  async getBidProgress(requestId: string): Promise<{ count: number; sealed: boolean }> {
    const actor = await getActor();
    const result = await actor.getBidProgress(requestId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return { count: Number(result.ok.count), sealed: result.ok.sealed };
  },

  async getMyProposals(): Promise<ListingProposal[]> {
    const actor = await getActor();
    const raw = await actor.getMyProposals();
    return raw.map(fromRawProposal);
  },

  // ── Homeowner: selection & payment-gated award ──────────────────────────────

  /**
   * Selects a winner without revealing identity or closing other bids.
   * Returns the fee canister's feeId — the caller starts a Stripe Checkout
   * session with it. Nothing unmasks until that payment settles — see
   * markListingFeePaid, driven only by the webhook (invariant 04).
   */
  async acceptProposal(proposalId: string): Promise<string> {
    const actor = await getActor();
    const result = await actor.acceptProposal(proposalId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return result.ok;
  },

  // ── Anonymous message thread (H4) ───────────────────────────────────────────

  async postMessage(proposalId: string, rawBody: string, authorRole: MessageRole): Promise<ThreadMessage> {
    const actor = await getActor();
    const result = await actor.postMessage(proposalId, rawBody, { [authorRole]: null });
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return fromRawMessage(result.ok);
  },

  async getThread(proposalId: string): Promise<ThreadMessage[]> {
    const actor = await getActor();
    const result = await actor.getThread(proposalId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return result.ok.map(fromRawMessage);
  },

  // ── Comps & platform fee (admin-configured, read by everyone) ──────────────

  async getCompsMedian(zipCode: string): Promise<CompsConfig | null> {
    const actor = await getActor();
    const raw = await actor.getCompsMedian(zipCode);
    if (raw.length === 0) return null;
    return { medianCents: Number(raw[0].medianCents), saleCount: Number(raw[0].saleCount) };
  },

  async getPlatformFee(): Promise<number> {
    const actor = await getActor();
    return Number(await actor.getPlatformFee());
  },

  // ── Listing photos (FSBO feature — shared with the agent-marketplace H1 photo grid) ─

  /**
   * Associate a photo (already uploaded to the photo canister) with a FSBO
   * listing, appending it to the ordered list.  Enforces the 15-photo cap.
   */
  async addListingPhoto(propertyId: string, photoId: string): Promise<void> {
    const actor = await getActor();
    const result = await actor.addListingPhoto(propertyId, photoId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  /** Returns the ordered photo IDs for a listing (first = cover image). */
  async getListingPhotos(propertyId: string): Promise<string[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_listing_photo_order) {
      const orderMap = (window as any).__e2e_listing_photo_order as Record<string, string[]>;
      return orderMap[propertyId] ?? [];
    }
    const actor = await getActor();
    return await actor.getListingPhotos(propertyId) as string[];
  },

  /** Remove a photo from the listing's ordered photo list. */
  async removeListingPhoto(propertyId: string, photoId: string): Promise<void> {
    const actor = await getActor();
    const result = await actor.removeListingPhoto(propertyId, photoId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  /**
   * Replace the photo ordering.  All supplied IDs must already be in the list;
   * only their sequence is allowed to change.
   */
  async reorderListingPhotos(propertyId: string, photoIds: string[]): Promise<void> {
    const actor = await getActor();
    const result = await actor.reorderListingPhotos(propertyId, photoIds);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  // ── Panoramas (issue #308) ────────────────────────────────────────────────────

  async addPanorama(propertyId: string, roomLabel: string, photoId: string): Promise<void> {
    if (!LISTING_CANISTER_ID) return;
    const actor = await getActor();
    const result = await actor.addPanorama(propertyId, roomLabel, photoId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  async getPanoramas(propertyId: string): Promise<PanoramaEntry[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_panoramas) {
      const map = (window as any).__e2e_panoramas as Record<string, PanoramaEntry[]>;
      return map[propertyId] ?? [];
    }
    if (!LISTING_CANISTER_ID) return [];
    const actor = await getActor();
    const raw = (await actor.getPanoramas(propertyId)) as Array<{ roomLabel: string; photoId: string }>;
    return raw.map((r) => ({ roomLabel: r.roomLabel, photoId: r.photoId }));
  },

  async removePanorama(propertyId: string, roomLabel: string): Promise<void> {
    if (!LISTING_CANISTER_ID) return;
    const actor = await getActor();
    const result = await actor.removePanorama(propertyId, roomLabel);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  // ── Public FSBO search index ─────────────────────────────────────────────────

  async listActiveFsboListings(): Promise<import("./fsbo").FsboPublicListing[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_fsbo_listings) {
      return (window as any).__e2e_fsbo_listings as import("./fsbo").FsboPublicListing[];
    }
    if (!LISTING_CANISTER_ID) return [];
    const actor = await getActor();
    const raw = (await actor.listActiveFsboListings()) as any[];
    return raw.map((r: any) => ({
      propertyId:        r.propertyId,
      listPriceCents:    Number(r.listPriceCents),
      activatedAt:       Number(r.activatedAt) / 1_000_000,
      address:           r.address,
      city:              r.city,
      state:             r.state,
      zipCode:           r.zipCode,
      propertyType:      r.propertyType as import("./fsbo").PropertyType,
      yearBuilt:         Number(r.yearBuilt),
      squareFeet:        Number(r.squareFeet),
      bedrooms:          Number(r.bedrooms),
      bathrooms:         Number(r.bathrooms),
      verificationLevel: r.verificationLevel as import("./fsbo").VerificationLevel,
      score:             r.score[0] != null ? Number(r.score[0]) : undefined,
      verifiedJobCount:  Number(r.verifiedJobCount),
      description:       r.description[0] ?? undefined,
      photoUrl:          r.photoUrl[0] ?? undefined,
      hasPublicReport:   r.hasPublicReport,
      systemHighlights:  r.systemHighlights as string[],
    }));
  },

  async activateFsboListing(listing: import("./fsbo").FsboPublicListing & { homeowner: string }): Promise<void> {
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const actor = await getActor();
    const result = await actor.activateFsboListing({
      ...listing,
      homeowner:        P.fromText(listing.homeowner),
      listPriceCents:   BigInt(listing.listPriceCents),
      activatedAt:      BigInt(Math.round(listing.activatedAt * 1_000_000)),
      yearBuilt:        BigInt(listing.yearBuilt),
      squareFeet:       BigInt(listing.squareFeet),
      bedrooms:         BigInt(listing.bedrooms),
      bathrooms:        BigInt(listing.bathrooms),
      score:            listing.score != null ? [BigInt(listing.score)] : [],
      description:      listing.description != null ? [listing.description] : [],
      photoUrl:         listing.photoUrl != null ? [listing.photoUrl] : [],
      systemHighlights: listing.systemHighlights ?? [],
    });
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  async deactivateFsboListing(propertyId: string): Promise<void> {
    const actor = await getActor();
    const result = await actor.deactivateFsboListing(propertyId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },
  };
}

export const listingService = createListingService();
