import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const CANISTER_ID: string = (process.env as any).REFERRALS_CANISTER_ID || "";

// ─── Candid IDL ───────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
  const Referral = IDL.Record({
    referrer:    IDL.Text,
    referee:     IDL.Text,
    code:        IDL.Text,
    referredAt:  IDL.Int,
    convertedAt: IDL.Opt(IDL.Int),
  });

  const Error = IDL.Variant({
    AlreadyReferred:  IDL.Null,
    SelfReferral:     IDL.Null,
    CodeNotFound:     IDL.Null,
    AlreadyConverted: IDL.Null,
    Unauthorized:     IDL.Null,
    InvalidInput:     IDL.Text,
  });

  const Result   = IDL.Variant({ ok: IDL.Null, err: Error });
  const ResultTx = IDL.Variant({ ok: IDL.Null, err: IDL.Text });

  return IDL.Service({
    getMyCode:        IDL.Func([],             [IDL.Text],       ["query"]),
    useReferralCode:  IDL.Func([IDL.Text],     [Result],         []),
    getMyReferrals:   IDL.Func([],             [IDL.Vec(Referral)], ["query"]),
    getCreditBalance: IDL.Func([],             [IDL.Nat],        ["query"]),
    addAdmin:         IDL.Func([IDL.Principal], [ResultTx],      []),
  });
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NeighborReferral {
  referrer:    string;
  referee:     string;
  code:        string;
  referredAt:  bigint;
  convertedAt: bigint | null;
}

// ─── Actor ────────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: CANISTER_ID });
  }
  return _actor;
}

// ─── Mock data (used when canister is not deployed) ───────────────────────────

const _mockCode = "HG-000001";

// ─── Service ──────────────────────────────────────────────────────────────────

export const neighborReferralService = {

  async getMyCode(): Promise<string> {
    if (!CANISTER_ID) return _mockCode;
    const actor = await getActor();
    return actor.getMyCode() as Promise<string>;
  },

  async useReferralCode(code: string): Promise<{ ok: true } | { err: string }> {
    if (!CANISTER_ID) {
      if (code === _mockCode) return { err: "SelfReferral" };
      return { ok: true };
    }
    const actor = await getActor();
    const res: any = await actor.useReferralCode(code);
    if ("ok" in res) return { ok: true };
    const errKey = Object.keys(res.err)[0];
    return { err: errKey === "InvalidInput" ? res.err.InvalidInput : errKey };
  },

  async getMyReferrals(): Promise<NeighborReferral[]> {
    if (!CANISTER_ID) return [];
    const actor = await getActor();
    const raw: any[] = await actor.getMyReferrals();
    return raw.map((r: any) => ({
      referrer:    r.referrer,
      referee:     r.referee,
      code:        r.code,
      referredAt:  r.referredAt as bigint,
      convertedAt: r.convertedAt.length > 0 ? (r.convertedAt[0] as bigint) : null,
    }));
  },

  async getCreditBalance(): Promise<number> {
    if (!CANISTER_ID) return 0;
    const actor = await getActor();
    const raw = await actor.getCreditBalance() as bigint;
    return Number(raw);
  },

  /** Build the full shareable URL for a referral code. */
  buildShareUrl(code: string): string {
    return `${window.location.origin}?ref=${encodeURIComponent(code)}`;
  },

  /** Read a ref code stored during the visit to the landing page. */
  getPendingRefCode(): string | null {
    return sessionStorage.getItem("hg_pending_ref");
  },

  /** Store a ref code from the landing page ?ref= param so it survives auth redirect. */
  capturePendingRefCode(code: string) {
    sessionStorage.setItem("hg_pending_ref", code);
  },

  clearPendingRefCode() {
    sessionStorage.removeItem("hg_pending_ref");
  },
};
