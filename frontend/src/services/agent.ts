/**
 * Agent (Realtor) on-chain profile service — Epic 9.1
 *
 * Backed by the `agent` ICP canister. Falls back to in-memory mock when
 * AGENT_CANISTER_ID is not set (local dev / tests).
 */

import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const AGENT_CANISTER_ID = (process.env as any).AGENT_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const AgentProfile = IDL.Record({
    id:                   IDL.Principal,
    name:                 IDL.Text,
    brokerage:            IDL.Text,
    licenseNumber:        IDL.Text,
    statesLicensed:       IDL.Vec(IDL.Text),
    bio:                  IDL.Text,
    phone:                IDL.Text,
    email:                IDL.Text,
    avgDaysOnMarket:      IDL.Nat,
    listingsLast12Months: IDL.Nat,
    isVerified:           IDL.Bool,
    createdAt:            IDL.Int,
    updatedAt:            IDL.Int,
  });
  const AgentReview = IDL.Record({
    id:                IDL.Text,
    agentId:           IDL.Principal,
    reviewerPrincipal: IDL.Principal,
    rating:            IDL.Nat,
    comment:           IDL.Text,
    transactionId:     IDL.Text,
    createdAt:         IDL.Int,
  });
  const RegisterArgs = IDL.Record({
    name:           IDL.Text,
    brokerage:      IDL.Text,
    licenseNumber:  IDL.Text,
    statesLicensed: IDL.Vec(IDL.Text),
    bio:            IDL.Text,
    phone:          IDL.Text,
    email:          IDL.Text,
  });
  const UpdateArgs = IDL.Record({
    name:           IDL.Text,
    brokerage:      IDL.Text,
    licenseNumber:  IDL.Text,
    statesLicensed: IDL.Vec(IDL.Text),
    bio:            IDL.Text,
    phone:          IDL.Text,
    email:          IDL.Text,
  });
  const AddReviewArgs = IDL.Record({
    agentId:       IDL.Principal,
    rating:        IDL.Nat,
    comment:       IDL.Text,
    transactionId: IDL.Text,
  });
  const Error = IDL.Variant({
    NotFound: IDL.Null, AlreadyExists: IDL.Null, Unauthorized: IDL.Null,
    Paused: IDL.Null, RateLimitExceeded: IDL.Null, DuplicateReview: IDL.Null,
    InvalidInput: IDL.Text,
  });
  return IDL.Service({
    register:      IDL.Func([RegisterArgs], [IDL.Variant({ ok: AgentProfile, err: Error })], []),
    getMyProfile:  IDL.Func([], [IDL.Opt(AgentProfile)], ["query"]),
    getProfile:    IDL.Func([IDL.Principal], [IDL.Opt(AgentProfile)], ["query"]),
    getAllProfiles: IDL.Func([], [IDL.Vec(AgentProfile)], ["query"]),
    updateProfile:  IDL.Func([UpdateArgs], [IDL.Variant({ ok: AgentProfile, err: Error })], []),
    addReview:      IDL.Func([AddReviewArgs], [IDL.Variant({ ok: AgentReview, err: Error })], []),
    getReviews:     IDL.Func([IDL.Principal], [IDL.Vec(AgentReview)], ["query"]),
    verifyAgent:    IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
  });
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentOnChainProfile {
  id:                      string;
  name:                    string;
  brokerage:               string;
  licenseNumber:           string;
  statesLicensed:          string[];
  bio:                     string;
  phone:                   string;
  email:                   string;
  avgDaysOnMarket:         number;
  listingsLast12Months:    number;
  isVerified:              boolean;
  // 9.6 — enriched fields (computed / denormalized)
  homeGenticTransactionCount: number;
  typicalCommissionBps:    number;
  createdAt:               number;
  updatedAt:               number;
}

export interface AgentReview {
  id:                string;
  agentId:           string;
  reviewerPrincipal: string;
  rating:            number;
  comment:           string;
  transactionId:     string;
  createdAt:         number;
}

export interface CreateAgentProfileInput {
  name:           string;
  brokerage:      string;
  licenseNumber:  string;
  statesLicensed: string[];
  bio:            string;
  phone:          string;
  email:          string;
}

export interface AddReviewInput {
  agentId:       string;
  rating:        number;
  comment:       string;
  transactionId: string;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Returns the average rating, or 0 if there are no reviews. */
export function computeAverageRating(reviews: AgentReview[]): number {
  if (reviews.length === 0) return 0;
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return sum / reviews.length;
}

// ─── Canister type converters ─────────────────────────────────────────────────

function fromRawProfile(raw: any): AgentOnChainProfile {
  return {
    id:                      raw.id.toText(),
    name:                    raw.name,
    brokerage:               raw.brokerage,
    licenseNumber:           raw.licenseNumber,
    statesLicensed:          raw.statesLicensed,
    bio:                     raw.bio,
    phone:                   raw.phone,
    email:                   raw.email,
    avgDaysOnMarket:         Number(raw.avgDaysOnMarket),
    listingsLast12Months:    Number(raw.listingsLast12Months),
    isVerified:              raw.isVerified,
    homeGenticTransactionCount: Number(raw.homeGenticTransactionCount ?? 0),
    typicalCommissionBps:    Number(raw.typicalCommissionBps ?? 250),
    createdAt:               Number(raw.createdAt),
    updatedAt:               Number(raw.updatedAt),
  };
}

function fromRawReview(raw: any): AgentReview {
  return {
    id:                raw.id,
    agentId:           raw.agentId.toText(),
    reviewerPrincipal: raw.reviewerPrincipal.toText(),
    rating:            Number(raw.rating),
    comment:           raw.comment,
    transactionId:     raw.transactionId,
    createdAt:         Number(raw.createdAt),
  };
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createAgentService() {
  let _actor: any = null;
  // Mock state for local dev / tests
  let _profiles: AgentOnChainProfile[] = [];
  let _reviews:  AgentReview[]          = [];
  let _reviewKeys = new Set<string>();
  let _myId = "local";

  async function getActor() {
    if (_actor) return _actor;
    const agent = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent, canisterId: AGENT_CANISTER_ID });
    return _actor;
  }

  return {
    /** Test-only reset hook. */
    __reset() {
      _actor    = null;
      _profiles = [];
      _reviews  = [];
      _reviewKeys.clear();
    },

    async createProfile(input: CreateAgentProfileInput): Promise<AgentOnChainProfile> {
      if (!AGENT_CANISTER_ID) {
        if (_profiles.find((p) => p.id === _myId)) throw new Error("Profile already exists");
        const profile: AgentOnChainProfile = {
          id:                      _myId,
          name:                    input.name,
          brokerage:               input.brokerage,
          licenseNumber:           input.licenseNumber,
          statesLicensed:          [...input.statesLicensed],
          bio:                     input.bio,
          phone:                   input.phone,
          email:                   input.email,
          avgDaysOnMarket:         0,
          listingsLast12Months:    0,
          isVerified:              false,
          homeGenticTransactionCount: 0,
          typicalCommissionBps:    250,
          createdAt:               Date.now(),
          updatedAt:               Date.now(),
        };
        _profiles.push(profile);
        return { ...profile };
      }
      const actor = await getActor();
      const result = await actor.register({
        name: input.name, brokerage: input.brokerage, licenseNumber: input.licenseNumber,
        statesLicensed: input.statesLicensed, bio: input.bio, phone: input.phone, email: input.email,
      });
      if ("err" in result) throw new Error(JSON.stringify(result.err));
      return fromRawProfile(result.ok);
    },

    async getMyProfile(): Promise<AgentOnChainProfile | null> {
      if (!AGENT_CANISTER_ID) {
        return _profiles.find((p) => p.id === _myId) ?? null;
      }
      const actor = await getActor();
      const result = await actor.getMyProfile();
      if (result.length === 0) return null;
      return fromRawProfile(result[0]);
    },

    async getPublicProfile(id: string): Promise<AgentOnChainProfile | null> {
      if (!AGENT_CANISTER_ID) {
        return _profiles.find((p) => p.id === id) ?? null;
      }
      const { Principal } = await import("@icp-sdk/core/principal");
      const actor = await getActor();
      const result = await actor.getProfile(Principal.fromText(id));
      if (result.length === 0) return null;
      return fromRawProfile(result[0]);
    },

    async getAllProfiles(): Promise<AgentOnChainProfile[]> {
      if (!AGENT_CANISTER_ID) return [..._profiles];
      const actor = await getActor();
      const raw = await actor.getAllProfiles();
      return raw.map(fromRawProfile);
    },

    async updateProfile(input: CreateAgentProfileInput): Promise<AgentOnChainProfile> {
      if (!AGENT_CANISTER_ID) {
        const idx = _profiles.findIndex((p) => p.id === _myId);
        if (idx === -1) throw new Error("Profile not found");
        const updated: AgentOnChainProfile = {
          ..._profiles[idx],
          name:                 input.name,
          brokerage:            input.brokerage,
          licenseNumber:        input.licenseNumber,
          statesLicensed:       [...input.statesLicensed],
          bio:                  input.bio,
          phone:                input.phone,
          email:                input.email,
          updatedAt:            Date.now(),
        };
        _profiles[idx] = updated;
        return { ...updated };
      }
      const actor = await getActor();
      const result = await actor.updateProfile({
        name: input.name, brokerage: input.brokerage, licenseNumber: input.licenseNumber,
        statesLicensed: input.statesLicensed, bio: input.bio, phone: input.phone, email: input.email,
      });
      if ("err" in result) throw new Error(JSON.stringify(result.err));
      return fromRawProfile(result.ok);
    },

    async addReview(input: AddReviewInput): Promise<AgentReview> {
      if (!AGENT_CANISTER_ID) {
        if (!_profiles.find((p) => p.id === input.agentId)) throw new Error(`Agent ${input.agentId} not found`);
        if (input.rating < 1 || input.rating > 5) throw new Error("rating must be 1–5");
        const compositeKey = `local|${input.transactionId}`;
        if (_reviewKeys.has(compositeKey)) throw new Error("Duplicate review for this transaction");
        _reviewKeys.add(compositeKey);
        const review: AgentReview = {
          id:                `AGREV_${Date.now()}`,
          agentId:           input.agentId,
          reviewerPrincipal: "local",
          rating:            input.rating,
          comment:           input.comment,
          transactionId:     input.transactionId,
          createdAt:         Date.now(),
        };
        _reviews.push(review);
        return { ...review };
      }
      const { Principal } = await import("@icp-sdk/core/principal");
      const actor = await getActor();
      const result = await actor.addReview({
        agentId:       Principal.fromText(input.agentId),
        rating:        BigInt(input.rating),
        comment:       input.comment,
        transactionId: input.transactionId,
      });
      if ("err" in result) throw new Error(JSON.stringify(result.err));
      return fromRawReview(result.ok);
    },

    async getReviews(agentId: string): Promise<AgentReview[]> {
      if (!AGENT_CANISTER_ID) {
        return _reviews.filter((r) => r.agentId === agentId);
      }
      const { Principal } = await import("@icp-sdk/core/principal");
      const actor = await getActor();
      const raw = await actor.getReviews(Principal.fromText(agentId));
      return raw.map(fromRawReview);
    },
  };
}

export const agentService = createAgentService();
