import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/agent";
export { idlFactory };

const AGENT_CANISTER_ID = (process.env as any).AGENT_CANISTER_ID || "";

export interface AgentProfile {
  id:                   string;
  name:                 string;
  brokerage:            string;
  licenseNumber:        string;
  licenseState:         string;
  county:               string;
  serviceCities:        string[];
  bio:                  string;
  phone:                string;
  email:                string;
  avgDaysOnMarket:      number;
  listingsLast12Months: number;
  isVerified:           boolean;
  lastVerifiedAt:       number; // ms epoch, 0 = never
  cardOnFile:           boolean;
  createdAt:            number;
  updatedAt:            number;
}

export interface RegisterAgentInput {
  name:          string;
  brokerage:     string;
  licenseNumber: string;
  licenseState:  string;
  county:        string;
  serviceCities: string[];
  bio:           string;
  phone:         string;
  email:         string;
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

function fromRawProfile(raw: any): AgentProfile {
  return {
    id:                   raw.id.toText(),
    name:                 raw.name,
    brokerage:            raw.brokerage,
    licenseNumber:        raw.licenseNumber,
    licenseState:         raw.licenseState,
    county:               raw.county,
    serviceCities:        raw.serviceCities,
    bio:                  raw.bio,
    phone:                raw.phone,
    email:                raw.email,
    avgDaysOnMarket:      Number(raw.avgDaysOnMarket),
    listingsLast12Months: Number(raw.listingsLast12Months),
    isVerified:           raw.isVerified,
    lastVerifiedAt:       Number(raw.lastVerifiedAt) / 1_000_000,
    cardOnFile:           raw.cardOnFile,
    createdAt:            Number(raw.createdAt) / 1_000_000,
    updatedAt:            Number(raw.updatedAt) / 1_000_000,
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
    createdAt:         Number(raw.createdAt) / 1_000_000,
  };
}

function createAgentService() {
  let _actor: any = null;

  async function getActor() {
    if (_actor) return _actor;
    const agent = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent, canisterId: AGENT_CANISTER_ID });
    return _actor;
  }

  return {
    reset() { _actor = null; },

    async register(input: RegisterAgentInput): Promise<AgentProfile> {
      const actor = await getActor();
      const result = await actor.register(input);
      if ("err" in result) throw new Error(JSON.stringify(result.err));
      return fromRawProfile(result.ok);
    },

    async getMyProfile(): Promise<AgentProfile | null> {
      const actor = await getActor();
      const raw = await actor.getMyProfile();
      return raw.length > 0 ? fromRawProfile(raw[0]) : null;
    },

    async getProfile(agentId: string): Promise<AgentProfile | null> {
      const { Principal } = await import("@icp-sdk/core/principal");
      const actor = await getActor();
      const raw = await actor.getProfile(Principal.fromText(agentId));
      return raw.length > 0 ? fromRawProfile(raw[0]) : null;
    },

    async updateProfile(input: RegisterAgentInput): Promise<AgentProfile> {
      const actor = await getActor();
      const result = await actor.updateProfile(input);
      if ("err" in result) throw new Error(JSON.stringify(result.err));
      return fromRawProfile(result.ok);
    },

    async setCardOnFile(onFile: boolean): Promise<void> {
      const actor = await getActor();
      const result = await actor.setCardOnFile(onFile);
      if ("err" in result) throw new Error(JSON.stringify(result.err));
    },

    async isVerifiedAgent(principal: string): Promise<boolean> {
      const { Principal } = await import("@icp-sdk/core/principal");
      const actor = await getActor();
      return await actor.isVerifiedAgent(Principal.fromText(principal));
    },

    async addReview(agentId: string, rating: number, comment: string, transactionId: string): Promise<AgentReview> {
      const { Principal } = await import("@icp-sdk/core/principal");
      const actor = await getActor();
      const result = await actor.addReview({
        agentId: Principal.fromText(agentId), rating: BigInt(rating), comment, transactionId,
      });
      if ("err" in result) throw new Error(JSON.stringify(result.err));
      return fromRawReview(result.ok);
    },

    async getReviews(agentId: string): Promise<AgentReview[]> {
      const { Principal } = await import("@icp-sdk/core/principal");
      const actor = await getActor();
      const raw = await actor.getReviews(Principal.fromText(agentId));
      return raw.map(fromRawReview);
    },
  };
}

export const agentService = createAgentService();
