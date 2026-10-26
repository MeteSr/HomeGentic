import { lazyActor } from "./lazyActor";
import { voiceAgentFetch } from "./voiceAgentHeaders";
import { idlFactory } from "@homegentic/shared/declarations/fee";
export { idlFactory };

const FEE_CANISTER_ID = (process.env as any).FEE_CANISTER_ID || "";
const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

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

// ── Contractor Free referral fee (3% of a winning bid, $20 minimum) ─────────

export type ReferralFeeStatus = "Pending" | "Due" | "Paid" | "PaymentFailed" | "Waived";

export interface ReferralFee {
  id:          string;
  quoteId:     string;
  requestId:   string;
  contractor:  string;
  homeowner:   string;
  propertyId:  string;
  serviceType: string;
  bidCents:    number;
  feeCents:    number;
  status:      ReferralFeeStatus;
  /** "verified_job" | "accepted_60_days" | "off_app_job", or the admin's note once waived. */
  reason:      string;
  acceptedAt:  number | null;   // ms
  jobId:       string | null;
  dueAt:       number | null;   // ms
  paymentRef:  string;
  /** Stripe invoice link after a declined card. */
  payUrl:      string;
  failedAt:    number | null;   // ms
  createdAt:   number;          // ms
}

export interface ReferralCard {
  brand:        string;
  last4:        string;
  agreedAt:     number;   // ms
  termsVersion: string;
}

/** An accepted bid whose job is never verified is charged this long after acceptance. */
export const REFERRAL_FALLBACK_DAYS = 60;

const optMs = (o: any[]): number | null => (o.length ? Number(o[0]) / 1_000_000 : null);

export function fromRawReferralFee(raw: any): ReferralFee {
  return {
    id: raw.id, quoteId: raw.quoteId, requestId: raw.requestId,
    contractor: raw.contractor.toText(), homeowner: raw.homeowner.toText(),
    propertyId: raw.propertyId, serviceType: raw.serviceType,
    bidCents: Number(raw.bidCents), feeCents: Number(raw.feeCents),
    status: Object.keys(raw.status)[0] as ReferralFeeStatus,
    reason: raw.reason, acceptedAt: optMs(raw.acceptedAt), jobId: raw.jobId[0] ?? null,
    dueAt: optMs(raw.dueAt), paymentRef: raw.paymentRef, payUrl: raw.payUrl,
    failedAt: optMs(raw.failedAt), createdAt: Number(raw.createdAt) / 1_000_000,
  };
}

const e2e = () => (typeof window !== "undefined" ? (window as any) : {});

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

    /** Contractor: the card saved for referral fees, or null. */
    async getMyReferralCard(): Promise<ReferralCard | null> {
      if (!FEE_CANISTER_ID) return e2e().__e2e_referral_card ?? null;
      const raw = await (await getActor()).getMyReferralCard();
      const c = raw[0];
      return c ? { brand: c.brand, last4: c.last4, agreedAt: Number(c.agreedAt) / 1_000_000, termsVersion: c.termsVersion } : null;
    },

    /** Contractor: their referral fees, newest first. */
    async getMyReferralFees(): Promise<ReferralFee[]> {
      const list: ReferralFee[] = !FEE_CANISTER_ID
        ? (e2e().__e2e_referral_fees ?? [])
        : (await (await getActor()).getMyReferralFees()).map(fromRawReferralFee);
      return [...list].sort((a, b) => b.createdAt - a.createdAt);
    },

    /** Contractor: open Stripe Checkout to save (or replace) the referral-fee card. Returns its URL. */
    async startReferralCardSetup(returnUrl: string): Promise<string> {
      if (!FEE_CANISTER_ID && e2e().__e2e_referral_card_url) return e2e().__e2e_referral_card_url;
      const res = await voiceAgentFetch(`${VOICE_AGENT_URL}/api/stripe/referral-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnUrl }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.url !== "string") throw new Error(body.error ?? "Couldn't open the card form just now.");
      return body.url;
    },

    /** Admin: every referral fee. */
    async getAllReferralFees(): Promise<ReferralFee[]> {
      if (!FEE_CANISTER_ID) return e2e().__e2e_referral_fees ?? [];
      const res = await (await getActor()).getAllReferralFees();
      if ("err" in res) throw new Error(Object.keys(res.err)[0]);
      return res.ok.map(fromRawReferralFee);
    },

    /** Admin: cancel an unpaid referral fee, with a note saying why. */
    async waiveReferralFee(feeId: string, note: string): Promise<ReferralFee> {
      if (!FEE_CANISTER_ID) {
        const list: ReferralFee[] = e2e().__e2e_referral_fees ?? [];
        const f = list.find((x) => x.id === feeId);
        if (!f) throw new Error("NotFound");
        Object.assign(f, { status: "Waived", reason: note });
        return f;
      }
      const res = await (await getActor()).waiveReferralFee(feeId, note);
      if ("err" in res) {
        const [k, v] = Object.entries(res.err)[0];
        throw new Error(typeof v === "string" ? v : k);
      }
      return fromRawReferralFee(res.ok);
    },
  };
}

export const feeService = createFeeService();
