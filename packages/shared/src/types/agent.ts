// Generated from ../declarations/agent.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  | { InvalidInput: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { DuplicateReview: null }
  | { AlreadyExists: null };

export type AddReviewArgs = {
  agentId: Principal;
  comment: string;
  rating: bigint;
  transactionId: string;
};

export type AgentReview = {
  id: string;
  createdAt: bigint;
  agentId: Principal;
  comment: string;
  reviewerPrincipal: Principal;
  rating: bigint;
  transactionId: string;
};

export type AgentProfile = {
  id: Principal;
  bio: string;
  cardOnFile: boolean;
  name: string;
  createdAt: bigint;
  lastVerifiedAt: bigint;
  email: string;
  brokerage: string;
  updatedAt: bigint;
  isVerified: boolean;
  listingsLast12Months: bigint;
  avgDaysOnMarket: bigint;
  licenseNumber: string;
  phone: string;
  county: string;
  serviceCities: string[];
  licenseState: string;
};

export type RegisterArgs = {
  bio: string;
  name: string;
  email: string;
  brokerage: string;
  licenseNumber: string;
  phone: string;
  county: string;
  serviceCities: string[];
  licenseState: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addAdmin: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  addReview: ActorMethod<[AddReviewArgs], { ok: AgentReview } | { err: Error }>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  getAgentsForCity: ActorMethod<[string, bigint], AgentProfile[]>;
  getAllProfiles: ActorMethod<[], AgentProfile[]>;
  getMyProfile: ActorMethod<[], [] | [AgentProfile]>;
  getProfile: ActorMethod<[Principal], [] | [AgentProfile]>;
  getProfilesByCounty: ActorMethod<[string], AgentProfile[]>;
  getReviews: ActorMethod<[Principal], AgentReview[]>;
  initAdmins: ActorMethod<[Principal[], string], { ok: null } | { err: Error }>;
  isVerifiedAgent: ActorMethod<[Principal], boolean>;
  metrics: ActorMethod<
    [],
    {
      totalAgents: bigint;
      isPaused: boolean;
      totalReviews: bigint;
      verifiedAgents: bigint;
    }
  >;
  pause: ActorMethod<[[] | [bigint]], { ok: null } | { err: Error }>;
  recordListingClose: ActorMethod<[Principal, bigint], { ok: null } | { err: Error }>;
  register: ActorMethod<[RegisterArgs], { ok: AgentProfile } | { err: Error }>;
  removeAdmin: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  revokeAgent: ActorMethod<[Principal], { ok: AgentProfile } | { err: Error }>;
  setBootstrapNonce: ActorMethod<[string], undefined>;
  setCardOnFile: ActorMethod<[boolean], { ok: null } | { err: Error }>;
  setListingCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setUpdateRateLimit: ActorMethod<[bigint], { ok: null } | { err: Error }>;
  unpause: ActorMethod<[], { ok: null } | { err: Error }>;
  updateProfile: ActorMethod<[RegisterArgs], { ok: AgentProfile } | { err: Error }>;
  verifyAgent: ActorMethod<[Principal], { ok: AgentProfile } | { err: Error }>;
}
