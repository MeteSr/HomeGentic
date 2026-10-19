import { lazyActor } from "./lazyActor";
import { idlFactory } from "@/declarations/fee";
export { idlFactory };

const FEE_CANISTER_ID = (process.env as any).FEE_CANISTER_ID || "";

export type FeeStatus = "Owed" | "Invoiced" | "Paid" | "Waived";

export interface FeeRecord {
  id:          string;
  requestId:   string;
  proposalId:  string;
  agentId:     string;
  homeownerId: string;
  amountCents: number;
  status:      FeeStatus;
  createdAt:   number;
  updatedAt:   number;
}

function fromRawFee(raw: any): FeeRecord {
  return {
    id:          raw.id,
    requestId:   raw.requestId,
    proposalId:  raw.proposalId,
    agentId:     raw.agentId.toText(),
    homeownerId: raw.homeownerId.toText(),
    amountCents: Number(raw.amountCents),
    status:      Object.keys(raw.status)[0] as FeeStatus,
    createdAt:   Number(raw.createdAt) / 1_000_000,
    updatedAt:   Number(raw.updatedAt) / 1_000_000,
  };
}

function createFeeService() {

  const getActor = lazyActor(idlFactory, FEE_CANISTER_ID);

  return {
    reset() { getActor.reset(); },

    /** Agent-side: their own fee history (won bids, what's owed/paid). */
    async getMyFees(): Promise<FeeRecord[]> {
      const actor = await getActor();
      const raw = await actor.getMyFees();
      return raw.map(fromRawFee);
    },
  };
}

export const feeService = createFeeService();
