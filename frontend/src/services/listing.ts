import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const LISTING_CANISTER_ID = (process.env as any).LISTING_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
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
    NotFound: IDL.Null, Unauthorized: IDL.Null, InvalidInput: IDL.Text,
    AlreadyCancelled: IDL.Null, DeadlinePassed: IDL.Null,
  });
  return IDL.Service({
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
  });
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type BidRequestStatus = "Open" | "Awarded" | "Cancelled";
export type ProposalStatus   = "Pending" | "Accepted" | "Rejected" | "Withdrawn";

export interface ListingBidRequest {
  id:               string;
  propertyId:       string;
  homeowner:        string;
  targetListDate:   number;
  desiredSalePrice: number | null;
  notes:            string;
  bidDeadline:      number;
  status:           BidRequestStatus;
  createdAt:        number;
}

export interface ListingProposal {
  id:                    string;
  requestId:             string;
  agentId:               string;
  agentName:             string;
  agentBrokerage:        string;
  commissionBps:         number;
  cmaSummary:            string;
  marketingPlan:         string;
  estimatedDaysOnMarket: number;
  estimatedSalePrice:    number;
  includedServices:      string[];
  validUntil:            number;
  coverLetter:           string;
  status:                ProposalStatus;
  createdAt:             number;
}

export interface SubmitProposalInput {
  agentName:             string;
  agentBrokerage:        string;
  commissionBps:         number;
  cmaSummary:            string;
  marketingPlan:         string;
  estimatedDaysOnMarket: number;
  estimatedSalePrice:    number;
  includedServices:      string[];
  validUntil:            number;
  coverLetter:           string;
}

export interface CreateBidRequestInput {
  propertyId:       string;
  targetListDate:   number;
  desiredSalePrice: number | null;
  notes:            string;
  bidDeadline:      number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Compute seller's net proceeds in cents.
 * @param salePrice    - sale price in cents
 * @param commissionBps - commission in basis points (e.g. 250 = 2.5%)
 * @param closingCostBps - closing costs in basis points (e.g. 200 = 2%)
 */
export function computeNetProceeds(
  salePrice: number,
  commissionBps: number,
  closingCostBps: number
): number {
  const commission   = Math.round(salePrice * commissionBps   / 10_000);
  const closingCosts = Math.round(salePrice * closingCostBps  / 10_000);
  return salePrice - commission - closingCosts;
}

/** Format basis points as a percentage string: 250 → "2.50%" */
export function formatCommission(bps: number): string {
  return (bps / 100).toFixed(2) + "%";
}

/** Returns true if the given deadline timestamp (ms) is in the past. */
export function isDeadlinePassed(deadlineMs: number): boolean {
  return deadlineMs <= Date.now();
}

// ─── Mock state ───────────────────────────────────────────────────────────────

let MOCK_REQUESTS: ListingBidRequest[] = [];
let MOCK_PROPOSALS: ListingProposal[]  = [];

// ─── Canister type converters ─────────────────────────────────────────────────

function fromRawRequest(raw: any): ListingBidRequest {
  const statusKey = Object.keys(raw.status)[0] as BidRequestStatus;
  return {
    id:               raw.id,
    propertyId:       raw.propertyId,
    homeowner:        raw.homeowner.toText(),
    targetListDate:   Number(raw.targetListDate),
    desiredSalePrice: raw.desiredSalePrice.length > 0 ? Number(raw.desiredSalePrice[0]) : null,
    notes:            raw.notes,
    bidDeadline:      Number(raw.bidDeadline),
    status:           statusKey,
    createdAt:        Number(raw.createdAt),
  };
}

function fromRawProposal(raw: any): ListingProposal {
  const statusKey = Object.keys(raw.status)[0] as ProposalStatus;
  return {
    id:                    raw.id,
    requestId:             raw.requestId,
    agentId:               raw.agentId.toText(),
    agentName:             raw.agentName,
    agentBrokerage:        raw.agentBrokerage,
    commissionBps:         Number(raw.commissionBps),
    cmaSummary:            raw.cmaSummary,
    marketingPlan:         raw.marketingPlan,
    estimatedDaysOnMarket: Number(raw.estimatedDaysOnMarket),
    estimatedSalePrice:    Number(raw.estimatedSalePrice),
    includedServices:      raw.includedServices,
    validUntil:            Number(raw.validUntil),
    coverLetter:           raw.coverLetter,
    status:                statusKey,
    createdAt:             Number(raw.createdAt),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (_actor) return _actor;
  const agent = await getAgent();
  _actor = Actor.createActor(idlFactory, { agent, canisterId: LISTING_CANISTER_ID });
  return _actor;
}

export const listingService = {
  reset() {
    _actor = null;
    MOCK_REQUESTS = [];
    MOCK_PROPOSALS = [];
  },

  // ── createBidRequest ────────────────────────────────────────────────────────
  async createBidRequest(input: CreateBidRequestInput): Promise<ListingBidRequest> {
    if (!LISTING_CANISTER_ID) {
      const req: ListingBidRequest = {
        id:               `BID_${Date.now()}`,
        propertyId:       input.propertyId,
        homeowner:        "local",
        targetListDate:   input.targetListDate,
        desiredSalePrice: input.desiredSalePrice,
        notes:            input.notes,
        bidDeadline:      input.bidDeadline,
        status:           "Open",
        createdAt:        Date.now(),
      };
      MOCK_REQUESTS.push(req);
      return { ...req };
    }
    const actor = await getActor();
    const result = await actor.createBidRequest(
      input.propertyId,
      BigInt(input.targetListDate),
      input.desiredSalePrice !== null ? [BigInt(input.desiredSalePrice)] : [],
      input.notes,
      BigInt(input.bidDeadline)
    );
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return fromRawRequest(result.ok);
  },

  // ── getMyBidRequests ────────────────────────────────────────────────────────
  async getMyBidRequests(): Promise<ListingBidRequest[]> {
    if (!LISTING_CANISTER_ID) {
      return [...MOCK_REQUESTS];
    }
    const actor = await getActor();
    const raw = await actor.getMyBidRequests();
    return raw.map(fromRawRequest);
  },

  // ── getBidRequest ───────────────────────────────────────────────────────────
  async getBidRequest(id: string): Promise<ListingBidRequest | null> {
    if (!LISTING_CANISTER_ID) {
      return MOCK_REQUESTS.find(r => r.id === id) ?? null;
    }
    const actor = await getActor();
    const result = await actor.getBidRequest(id);
    if ("err" in result) return null;
    return fromRawRequest(result.ok);
  },

  // ── cancelBidRequest ────────────────────────────────────────────────────────
  async cancelBidRequest(id: string): Promise<void> {
    if (!LISTING_CANISTER_ID) {
      const req = MOCK_REQUESTS.find(r => r.id === id);
      if (!req) throw new Error(`BidRequest ${id} not found`);
      if (req.status !== "Open") throw new Error(`BidRequest ${id} is not Open (status: ${req.status})`);
      req.status = "Cancelled";
      return;
    }
    const actor = await getActor();
    const result = await actor.cancelBidRequest(id);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  // ── getOpenBidRequests (agent view) ─────────────────────────────────────────
  async getOpenBidRequests(): Promise<ListingBidRequest[]> {
    if (!LISTING_CANISTER_ID) {
      return MOCK_REQUESTS.filter(
        r => r.status === "Open" && !isDeadlinePassed(r.bidDeadline)
      );
    }
    const actor = await getActor();
    const raw = await actor.getOpenBidRequests();
    return raw.map(fromRawRequest);
  },

  // ── submitProposal ──────────────────────────────────────────────────────────
  async submitProposal(requestId: string, input: SubmitProposalInput): Promise<ListingProposal> {
    if (!LISTING_CANISTER_ID) {
      const req = MOCK_REQUESTS.find(r => r.id === requestId);
      if (!req) throw new Error(`BidRequest ${requestId} not found`);
      if (req.status !== "Open") throw new Error(`BidRequest ${requestId} is not accepting proposals (status: ${req.status})`);

      const proposal: ListingProposal = {
        id:                    `PROP_${Date.now()}`,
        requestId,
        agentId:               "local",
        agentName:             input.agentName,
        agentBrokerage:        input.agentBrokerage,
        commissionBps:         input.commissionBps,
        cmaSummary:            input.cmaSummary,
        marketingPlan:         input.marketingPlan,
        estimatedDaysOnMarket: input.estimatedDaysOnMarket,
        estimatedSalePrice:    input.estimatedSalePrice,
        includedServices:      [...input.includedServices],
        validUntil:            input.validUntil,
        coverLetter:           input.coverLetter,
        status:                "Pending",
        createdAt:             Date.now(),
      };
      MOCK_PROPOSALS.push(proposal);
      return { ...proposal };
    }
    const actor = await getActor();
    const result = await actor.submitProposal(
      requestId,
      input.agentName, input.agentBrokerage,
      BigInt(input.commissionBps),
      input.cmaSummary, input.marketingPlan,
      BigInt(input.estimatedDaysOnMarket),
      BigInt(input.estimatedSalePrice),
      input.includedServices,
      BigInt(input.validUntil),
      input.coverLetter
    );
    if ("err" in result) throw new Error(JSON.stringify(result.err));
    return fromRawProposal(result.ok);
  },

  // ── getProposalsForRequest ───────────────────────────────────────────────────
  // Sealed-bid: proposals are hidden until the request's bidDeadline has passed.
  async getProposalsForRequest(requestId: string): Promise<ListingProposal[]> {
    if (!LISTING_CANISTER_ID) {
      const req = MOCK_REQUESTS.find(r => r.id === requestId);
      if (!req) return [];
      if (!isDeadlinePassed(req.bidDeadline)) return []; // still sealed
      return MOCK_PROPOSALS.filter(p => p.requestId === requestId);
    }
    const actor = await getActor();
    const raw = await actor.getProposalsForRequest(requestId);
    return raw.map(fromRawProposal);
  },

  // ── getMyProposals (agent view) ──────────────────────────────────────────────
  async getMyProposals(): Promise<ListingProposal[]> {
    if (!LISTING_CANISTER_ID) {
      return [...MOCK_PROPOSALS];
    }
    const actor = await getActor();
    const raw = await actor.getMyProposals();
    return raw.map(fromRawProposal);
  },

  // ── acceptProposal ───────────────────────────────────────────────────────────
  async acceptProposal(proposalId: string): Promise<void> {
    if (!LISTING_CANISTER_ID) {
      const proposal = MOCK_PROPOSALS.find(p => p.id === proposalId);
      if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

      // Mark the winner as Accepted
      proposal.status = "Accepted";

      // Mark all other proposals on the same request as Rejected
      MOCK_PROPOSALS
        .filter(p => p.requestId === proposal.requestId && p.id !== proposalId)
        .forEach(p => { p.status = "Rejected"; });

      // Mark the parent request as Awarded
      const req = MOCK_REQUESTS.find(r => r.id === proposal.requestId);
      if (req) req.status = "Awarded";

      return;
    }
    const actor = await getActor();
    const result = await actor.acceptProposal(proposalId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },
};
