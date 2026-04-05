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

export type BidRequestStatus  = "Open" | "Awarded" | "Cancelled";
export type ProposalStatus    = "Pending" | "Accepted" | "Rejected" | "Withdrawn";
export type BidVisibility     = "open" | "inviteOnly";
export type CounterStatus     = "Pending" | "Accepted" | "Rejected";

/** Snapshot of the property's HomeGentic score at the time the bid request was created. */
export interface PropertySnapshot {
  score:             number;
  verifiedJobCount:  number;
  systemNotes:       string;  // e.g. "Roof: 8 yrs, HVAC: 5 yrs"
}

/** A single comparable sale entry for a CMA. */
export interface CMAComp {
  address:        string;
  salePriceCents: number;
  bedrooms:       number;
  bathrooms:      number;
  sqft:           number;
  soldDate:       string;  // ISO date string
}

/** Uploaded listing agreement, stored after agent acceptance. */
export interface ContractFile {
  name:       string;
  uploadedAt: number;
}

/** A homeowner's counter-offer on a submitted proposal. */
export interface CounterProposal {
  id:            string;
  proposalId:    string;
  requestId:     string;
  fromRole:      "homeowner" | "agent";
  commissionBps: number;
  notes:         string;
  status:        CounterStatus;
  createdAt:     number;
}

export interface CounterProposalInput {
  commissionBps: number;
  notes:         string;
}

// ─── 9.5.1 Milestone types ────────────────────────────────────────────────────

export type MilestoneKey =
  | "agreement_signed"
  | "listed_on_mls"
  | "first_showing"
  | "offer_received"
  | "under_contract"
  | "inspection"
  | "appraisal"
  | "closed";

export interface Milestone {
  key:          MilestoneKey;
  label:        string;
  completedAt:  number | null;
  completedBy:  "homeowner" | "agent" | null;
}

export const MILESTONE_STEPS: { key: MilestoneKey; label: string }[] = [
  { key: "agreement_signed", label: "Agreement Signed" },
  { key: "listed_on_mls",    label: "Listed on MLS" },
  { key: "first_showing",    label: "First Showing" },
  { key: "offer_received",   label: "Offer Received" },
  { key: "under_contract",   label: "In Escrow" },
  { key: "inspection",       label: "Inspection Complete" },
  { key: "appraisal",        label: "Appraisal Complete" },
  { key: "closed",           label: "Sale Closed" },
];

// ─── 9.5.2 Offer types ────────────────────────────────────────────────────────

export interface OfferEntry {
  id:                            string;
  requestId:                     string;
  offerAmountCents:              number;
  contingencies:                 string[];
  closeDate:                     string;
  loggedAt:                      number;
  deltaFromListingPriceCents:    number | null;
  deltaFromHomeGenticEstimateCents: number | null;
}

export interface LogOfferInput {
  offerAmountCents: number;
  contingencies:    string[];
  closeDate:        string;
}

// ─── 9.5.3 Transaction close types ───────────────────────────────────────────

export interface TransactionClose {
  requestId:           string;
  finalSalePriceCents: number;
  actualCloseDateMs:   number;
  homeGenticBaselineCents: number;
  actualPremiumCents:  number;
  recordedAt:          number;
}

export interface LogCloseInput {
  finalSalePriceCents: number;
  actualCloseDateMs:   number;
}

// ─── 9.5.4 Agent performance types ───────────────────────────────────────────

export interface AgentPerformanceRecord {
  requestId:              string;
  agentId:                string;
  estimatedDOM:           number;
  actualDOM:              number;
  estimatedSalePrice:     number;
  actualSalePrice:        number;
  promisedCommBps:        number;
  chargedCommBps:         number;
  domAccuracyScore:       number;
  priceAccuracyScore:     number;
  commissionHonestyScore: number;
  overallScore:           number;
  recordedAt:             number;
}

export interface LogAgentPerformanceInput {
  chargedCommBps: number;
}

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
  // 9.2.3
  propertySnapshot?: PropertySnapshot;
  // 9.2.4
  visibility:       BidVisibility;
  invitedAgentIds:  string[];
  // 9.4.5
  contractFile?:    ContractFile;
  // 9.5
  milestones?:      Milestone[];
  offers?:          OfferEntry[];
  closedData?:      TransactionClose;
  agentPerformance?: AgentPerformanceRecord;
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
  // 9.3.4
  cmaComps:              CMAComp[];
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
  // 9.3.4
  cmaComps?:             CMAComp[];
}

export interface CreateBidRequestInput {
  propertyId:       string;
  targetListDate:   number;
  desiredSalePrice: number | null;
  notes:            string;
  bidDeadline:      number;
  // 9.2.3
  propertySnapshot?: PropertySnapshot;
  // 9.2.4
  visibility?:      BidVisibility;
  invitedAgentIds?: string[];
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

/** Initialize a fresh milestone checklist with all steps pending. */
export function initMilestones(): Milestone[] {
  return MILESTONE_STEPS.map(({ key, label }) => ({
    key, label, completedAt: null, completedBy: null,
  }));
}

/** Compute delta between an offer and listing/HomeGentic price points. */
export function computeOfferDeltas(
  offerAmountCents: number,
  desiredSalePrice: number | null,
  homeGenticEstimateMidCents: number | null,
): { deltaFromListingPriceCents: number | null; deltaFromHomeGenticEstimateCents: number | null } {
  return {
    deltaFromListingPriceCents:    desiredSalePrice       !== null ? offerAmountCents - desiredSalePrice       : null,
    deltaFromHomeGenticEstimateCents: homeGenticEstimateMidCents !== null ? offerAmountCents - homeGenticEstimateMidCents : null,
  };
}

/** Compute agent accuracy scores (all 0–100) post-close. */
export function computeAgentPerformanceScore(
  estimatedDOM: number, actualDOM: number,
  estimatedSalePrice: number, actualSalePrice: number,
  promisedCommBps: number, chargedCommBps: number,
): { domAccuracyScore: number; priceAccuracyScore: number; commissionHonestyScore: number; overallScore: number } {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  const domAccuracyScore       = clamp(100 - Math.abs(actualDOM - estimatedDOM) / estimatedDOM * 100);
  const priceAccuracyScore     = clamp(100 - Math.abs(actualSalePrice - estimatedSalePrice) / estimatedSalePrice * 100);
  const extraBps               = Math.max(0, chargedCommBps - promisedCommBps);
  const commissionHonestyScore = clamp(100 - Math.floor(extraBps / 25) * 10);
  const overallScore           = Math.round(domAccuracyScore * 0.35 + priceAccuracyScore * 0.40 + commissionHonestyScore * 0.25);
  return { domAccuracyScore: Math.round(domAccuracyScore), priceAccuracyScore: Math.round(priceAccuracyScore), commissionHonestyScore, overallScore };
}

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
    visibility:       "open",
    invitedAgentIds:  [],
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
    cmaComps:              [],
  };
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createListingService() {
  let _actor: any = null;
  let requests:     ListingBidRequest[]      = [];
  let proposals:    ListingProposal[]        = [];
  let counters:     CounterProposal[]        = [];
  let perfRecords:  AgentPerformanceRecord[] = [];
  let _reqSeq     = 0;
  let _propSeq    = 0;
  let _counterSeq = 0;
  let _offerSeq   = 0;

  async function getActor() {
    if (_actor) return _actor;
    const agent = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent, canisterId: LISTING_CANISTER_ID });
    return _actor;
  }

  return {
  reset() {
    _actor      = null;
    requests    = [];
    proposals   = [];
    counters    = [];
    perfRecords = [];
    _reqSeq     = 0;
    _propSeq    = 0;
    _counterSeq = 0;
    _offerSeq   = 0;
  },

  // ── createBidRequest ────────────────────────────────────────────────────────
  async createBidRequest(input: CreateBidRequestInput): Promise<ListingBidRequest> {
    if (!LISTING_CANISTER_ID) {
      const req: ListingBidRequest = {
        id:               `BID_${++_reqSeq}`,
        propertyId:       input.propertyId,
        homeowner:        "local",
        targetListDate:   input.targetListDate,
        desiredSalePrice: input.desiredSalePrice,
        notes:            input.notes,
        bidDeadline:      input.bidDeadline,
        status:           "Open",
        createdAt:        Date.now(),
        propertySnapshot: input.propertySnapshot,
        visibility:       input.visibility       ?? "open",
        invitedAgentIds:  input.invitedAgentIds  ?? [],
      };
      requests.push(req);
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
      return [...requests];
    }
    const actor = await getActor();
    const raw = await actor.getMyBidRequests();
    return raw.map(fromRawRequest);
  },

  // ── getBidRequest ───────────────────────────────────────────────────────────
  async getBidRequest(id: string): Promise<ListingBidRequest | null> {
    if (!LISTING_CANISTER_ID) {
      return requests.find(r => r.id === id) ?? null;
    }
    const actor = await getActor();
    const result = await actor.getBidRequest(id);
    if ("err" in result) return null;
    return fromRawRequest(result.ok);
  },

  // ── cancelBidRequest ────────────────────────────────────────────────────────
  async cancelBidRequest(id: string): Promise<void> {
    if (!LISTING_CANISTER_ID) {
      const req = requests.find(r => r.id === id);
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
  // 9.2.4: inviteOnly requests are hidden from the general marketplace.
  async getOpenBidRequests(callerAgentId = "local"): Promise<ListingBidRequest[]> {
    if (!LISTING_CANISTER_ID) {
      return requests.filter(
        r => r.status === "Open"
          && !isDeadlinePassed(r.bidDeadline)
          && (r.visibility === "open" || r.invitedAgentIds.includes(callerAgentId))
      );
    }
    const actor = await getActor();
    const raw = await actor.getOpenBidRequests();
    return raw.map(fromRawRequest);
  },

  // ── submitProposal ──────────────────────────────────────────────────────────
  async submitProposal(requestId: string, input: SubmitProposalInput): Promise<ListingProposal> {
    if (!LISTING_CANISTER_ID) {
      const req = requests.find(r => r.id === requestId);
      if (!req) throw new Error(`BidRequest ${requestId} not found`);
      if (req.status !== "Open") throw new Error(`BidRequest ${requestId} is not accepting proposals (status: ${req.status})`);
      // 9.2.5: deadline enforcement
      if (isDeadlinePassed(req.bidDeadline)) throw new Error("Bid deadline has passed — no new proposals accepted");

      const proposal: ListingProposal = {
        id:                    `PROP_${++_propSeq}`,
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
        cmaComps:              input.cmaComps ? [...input.cmaComps] : [],
      };
      proposals.push(proposal);
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
      const req = requests.find(r => r.id === requestId);
      if (!req) return [];
      if (!isDeadlinePassed(req.bidDeadline)) return []; // still sealed
      return proposals.filter(p => p.requestId === requestId);
    }
    const actor = await getActor();
    const raw = await actor.getProposalsForRequest(requestId);
    return raw.map(fromRawProposal);
  },

  // ── getMyProposals (agent view) ──────────────────────────────────────────────
  async getMyProposals(): Promise<ListingProposal[]> {
    if (!LISTING_CANISTER_ID) {
      return [...proposals];
    }
    const actor = await getActor();
    const raw = await actor.getMyProposals();
    return raw.map(fromRawProposal);
  },

  // ── acceptProposal ───────────────────────────────────────────────────────────
  async acceptProposal(proposalId: string): Promise<void> {
    if (!LISTING_CANISTER_ID) {
      const proposal = proposals.find(p => p.id === proposalId);
      if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

      // Mark the winner as Accepted
      proposal.status = "Accepted";

      // Mark all other proposals on the same request as Rejected
      proposals
        .filter(p => p.requestId === proposal.requestId && p.id !== proposalId)
        .forEach(p => { p.status = "Rejected"; });

      // Mark the parent request as Awarded
      const req = requests.find(r => r.id === proposal.requestId);
      if (req) req.status = "Awarded";

      return;
    }
    const actor = await getActor();
    const result = await actor.acceptProposal(proposalId);
    if ("err" in result) throw new Error(JSON.stringify(result.err));
  },

  // ── uploadContract (9.4.5) ───────────────────────────────────────────────────
  async uploadContract(requestId: string, fileName: string): Promise<void> {
    if (!LISTING_CANISTER_ID) {
      const req = requests.find((r) => r.id === requestId);
      if (!req) throw new Error(`BidRequest ${requestId} not found`);
      req.contractFile = { name: fileName, uploadedAt: Date.now() };
      return;
    }
    // On-chain: would upload to photo canister and store hash here
    throw new Error("uploadContract requires deployed canister");
  },

  // ── counterProposal (9.4.6) ──────────────────────────────────────────────────
  async counterProposal(proposalId: string, input: CounterProposalInput): Promise<CounterProposal> {
    if (!LISTING_CANISTER_ID) {
      const proposal = proposals.find((p) => p.id === proposalId);
      if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
      const counter: CounterProposal = {
        id:            `COUNTER_${++_counterSeq}`,
        proposalId,
        requestId:     proposal.requestId,
        fromRole:      "homeowner",
        commissionBps: input.commissionBps,
        notes:         input.notes,
        status:        "Pending",
        createdAt:     Date.now(),
      };
      counters.push(counter);
      return { ...counter };
    }
    throw new Error("counterProposal requires deployed canister");
  },

  // ── respondToCounter (9.4.6) — agent accepts/rejects ────────────────────────
  async respondToCounter(counterId: string, response: "accept" | "reject"): Promise<void> {
    if (!LISTING_CANISTER_ID) {
      const counter = counters.find((c) => c.id === counterId);
      if (!counter) throw new Error(`Counter ${counterId} not found`);
      counter.status = response === "accept" ? "Accepted" : "Rejected";
      return;
    }
    throw new Error("respondToCounter requires deployed canister");
  },

  // ── getCountersForProposal (9.4.6) ───────────────────────────────────────────
  async getCountersForProposal(proposalId: string): Promise<CounterProposal[]> {
    if (!LISTING_CANISTER_ID) {
      return counters.filter((c) => c.proposalId === proposalId);
    }
    throw new Error("getCountersForProposal requires deployed canister");
  },

  // ── getMyCounters (9.4.6) — agent views counters on their proposals ──────────
  async getMyCounters(): Promise<CounterProposal[]> {
    if (!LISTING_CANISTER_ID) {
      const myProposalIds = new Set(proposals.map((p) => p.id));
      return counters.filter((c) => myProposalIds.has(c.proposalId));
    }
    throw new Error("getMyCounters requires deployed canister");
  },

  // ── updateMilestone (9.5.1) ──────────────────────────────────────────────────
  async updateMilestone(
    requestId: string,
    key: MilestoneKey,
    completedBy: "homeowner" | "agent",
  ): Promise<ListingBidRequest> {
    if (!LISTING_CANISTER_ID) {
      const req = requests.find((r) => r.id === requestId);
      if (!req) throw new Error(`BidRequest ${requestId} not found`);
      if (!req.milestones) req.milestones = initMilestones();
      const m = req.milestones.find((ms) => ms.key === key);
      if (m) { m.completedAt = Date.now(); m.completedBy = completedBy; }
      return { ...req, milestones: [...(req.milestones ?? [])] };
    }
    throw new Error("updateMilestone requires deployed canister");
  },

  // ── logOffer (9.5.2) ─────────────────────────────────────────────────────────
  async logOffer(requestId: string, input: LogOfferInput): Promise<OfferEntry> {
    if (!LISTING_CANISTER_ID) {
      const req = requests.find((r) => r.id === requestId);
      if (!req) throw new Error(`BidRequest ${requestId} not found`);
      const { deltaFromListingPriceCents, deltaFromHomeGenticEstimateCents } = computeOfferDeltas(
        input.offerAmountCents,
        req.desiredSalePrice,
        null,
      );
      const entry: OfferEntry = {
        id:                            `OFFER_${++_offerSeq}`,
        requestId,
        offerAmountCents:              input.offerAmountCents,
        contingencies:                 [...input.contingencies],
        closeDate:                     input.closeDate,
        loggedAt:                      Date.now(),
        deltaFromListingPriceCents,
        deltaFromHomeGenticEstimateCents,
      };
      if (!req.offers) req.offers = [];
      req.offers.push(entry);
      return { ...entry };
    }
    throw new Error("logOffer requires deployed canister");
  },

  // ── logClose (9.5.3) ─────────────────────────────────────────────────────────
  async logClose(requestId: string, input: LogCloseInput): Promise<TransactionClose> {
    if (!LISTING_CANISTER_ID) {
      const req = requests.find((r) => r.id === requestId);
      if (!req) throw new Error(`BidRequest ${requestId} not found`);
      const close: TransactionClose = {
        requestId,
        finalSalePriceCents: input.finalSalePriceCents,
        actualCloseDateMs:   input.actualCloseDateMs,
        homeGenticBaselineCents: 0,  // set from propertySnapshot.score in real impl
        actualPremiumCents:  0,
        recordedAt:          Date.now(),
      };
      req.closedData = close;
      // Auto-complete the "closed" milestone
      if (!req.milestones) req.milestones = initMilestones();
      const m = req.milestones.find((ms) => ms.key === "closed");
      if (m && !m.completedAt) { m.completedAt = input.actualCloseDateMs; m.completedBy = "homeowner"; }
      return { ...close };
    }
    throw new Error("logClose requires deployed canister");
  },

  // ── logAgentPerformance (9.5.4) ───────────────────────────────────────────────
  async logAgentPerformance(requestId: string, input: LogAgentPerformanceInput): Promise<AgentPerformanceRecord> {
    if (!LISTING_CANISTER_ID) {
      const req = requests.find((r) => r.id === requestId);
      if (!req) throw new Error(`BidRequest ${requestId} not found`);
      if (!req.closedData) throw new Error("Cannot log performance before close is recorded");
      const accepted = proposals.find((p) => p.requestId === requestId && p.status === "Accepted");
      if (!accepted) throw new Error("No accepted proposal found for this request");
      const listedMs = req.milestones?.find((m) => m.key === "listed_on_mls")?.completedAt ?? req.createdAt;
      const closedMs = req.milestones?.find((m) => m.key === "closed")?.completedAt ?? req.closedData.actualCloseDateMs;
      const actualDOM = Math.max(1, Math.round((closedMs - listedMs) / 86_400_000));
      const scores = computeAgentPerformanceScore(
        accepted.estimatedDaysOnMarket, actualDOM,
        accepted.estimatedSalePrice, req.closedData.finalSalePriceCents,
        accepted.commissionBps, input.chargedCommBps,
      );
      const record: AgentPerformanceRecord = {
        requestId,
        agentId:          accepted.agentId,
        estimatedDOM:     accepted.estimatedDaysOnMarket,
        actualDOM,
        estimatedSalePrice: accepted.estimatedSalePrice,
        actualSalePrice:  req.closedData.finalSalePriceCents,
        promisedCommBps:  accepted.commissionBps,
        chargedCommBps:   input.chargedCommBps,
        ...scores,
        recordedAt: Date.now(),
      };
      req.agentPerformance = record;
      perfRecords.push(record);
      return { ...record };
    }
    throw new Error("logAgentPerformance requires deployed canister");
  },

  // ── getAgentPerformanceRecords (9.5.4) — for AgentPublicPage ─────────────────
  async getAgentPerformanceRecords(agentId: string): Promise<AgentPerformanceRecord[]> {
    if (!LISTING_CANISTER_ID) {
      return perfRecords.filter((r) => r.agentId === agentId);
    }
    throw new Error("getAgentPerformanceRecords requires deployed canister");
  },

  // ── createDirectInvite (9.6.2) — homeowner invites specific agent ─────────────
  async createDirectInvite(agentId: string, propertyId: string): Promise<ListingBidRequest> {
    if (!LISTING_CANISTER_ID) {
      const id = `BID_DIRECT_${++_reqSeq}`;
      const req: ListingBidRequest = {
        id,
        propertyId,
        homeowner:        "local",
        targetListDate:   Date.now() + 30 * 86_400_000,
        desiredSalePrice: null,
        notes:            "",
        bidDeadline:      Date.now() + 7 * 86_400_000,
        status:           "Open",
        createdAt:        Date.now(),
        visibility:       "inviteOnly",
        invitedAgentIds:  [agentId],
        propertySnapshot: undefined,
      };
      requests.push(req);
      return { ...req };
    }
    throw new Error("createDirectInvite requires deployed canister");
  },
  };
}

export const listingService = createListingService();
