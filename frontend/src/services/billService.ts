/**
 * HomeGentic Bill Service (Epic #49)
 *
 * Handles bill record storage against the `bills` ICP canister.
 *
 * Also provides `extractBill()` — calls the voice agent's /api/extract-bill
 * endpoint to OCR a utility bill image/PDF via Claude Vision.
 */

import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const BILLS_CANISTER_ID = (process.env as any).BILLS_CANISTER_ID || "";
const VOICE_AGENT_URL   = (import.meta as any).env?.VITE_VOICE_AGENT_URL || "http://localhost:3001";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const BillType = IDL.Variant({
    Electric: IDL.Null,
    Gas:      IDL.Null,
    Water:    IDL.Null,
    Internet: IDL.Null,
    Telecom:  IDL.Null,
    Other:    IDL.Null,
  });

  const BillRecord = IDL.Record({
    id:            IDL.Text,
    propertyId:    IDL.Text,
    homeowner:     IDL.Principal,
    billType:      BillType,
    provider:      IDL.Text,
    periodStart:   IDL.Text,
    periodEnd:     IDL.Text,
    amountCents:   IDL.Nat,
    usageAmount:   IDL.Opt(IDL.Float64),
    usageUnit:     IDL.Opt(IDL.Text),
    uploadedAt:    IDL.Int,
    anomalyFlag:   IDL.Bool,
    anomalyReason: IDL.Opt(IDL.Text),
  });

  const AddBillArgs = IDL.Record({
    propertyId:  IDL.Text,
    billType:    BillType,
    provider:    IDL.Text,
    periodStart: IDL.Text,
    periodEnd:   IDL.Text,
    amountCents: IDL.Nat,
    usageAmount: IDL.Opt(IDL.Float64),
    usageUnit:   IDL.Opt(IDL.Text),
  });

  const Error = IDL.Variant({
    NotFound:         IDL.Null,
    Unauthorized:     IDL.Null,
    InvalidInput:     IDL.Text,
    TierLimitReached: IDL.Text,
  });

  const UsagePeriod = IDL.Record({
    periodStart: IDL.Text,
    usageAmount: IDL.Float64,
    usageUnit:   IDL.Text,
  });

  return IDL.Service({
    addBill: IDL.Func(
      [AddBillArgs],
      [IDL.Variant({ ok: BillRecord, err: Error })],
      []
    ),
    getBillsForProperty: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(BillRecord), err: Error })],
      []
    ),
    deleteBill: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getUsageTrend: IDL.Func(
      [IDL.Text, BillType, IDL.Nat],
      [IDL.Variant({ ok: IDL.Vec(UsagePeriod), err: Error })],
      []
    ),
    metrics: IDL.Func(
      [],
      [IDL.Record({ totalBills: IDL.Nat, isPaused: IDL.Bool })],
      ["query"]
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type BillType = "Electric" | "Gas" | "Water" | "Internet" | "Telecom" | "Other";

export interface BillRecord {
  id:            string;
  propertyId:    string;
  homeowner:     string;
  billType:      BillType;
  provider:      string;
  periodStart:   string;   // YYYY-MM-DD
  periodEnd:     string;   // YYYY-MM-DD
  amountCents:   number;
  usageAmount?:  number;
  usageUnit?:    string;
  uploadedAt:    number;   // ms (converted from nanoseconds)
  anomalyFlag:   boolean;
  anomalyReason?: string;
}

export interface AddBillArgs {
  propertyId:  string;
  billType:    BillType;
  provider:    string;
  periodStart: string;
  periodEnd:   string;
  amountCents: number;
  usageAmount?: number;
  usageUnit?:  string;
}

/** Result returned by /api/extract-bill (voice agent) */
export interface BillExtraction {
  billType?:    BillType;
  provider?:    string;
  periodStart?: string;
  periodEnd?:   string;
  amountCents?: number;
  usageAmount?: number;
  usageUnit?:   string;
  confidence:   "high" | "medium" | "low";
  description:  string;
  rawFileName?: string;
}

// ─── Error types ─────────────────────────────────────────────────────────────

/** Thrown when a Free tier user hits the monthly upload limit. */
export class TierLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TierLimitReachedError";
  }
}

// ─── Actor helper ─────────────────────────────────────────────────────────────

let _actor: any = null;

async function getBillsActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: BILLS_CANISTER_ID });
  }
  return _actor;
}

function fromVariant<T>(v: any): T {
  if ("ok" in v) return v.ok as T;
  const err = v.err;
  if (err && "TierLimitReached" in err) throw new TierLimitReachedError(err.TierLimitReached);
  throw new Error(JSON.stringify(err));
}

function toRecord(raw: any): BillRecord {
  return {
    id:            raw.id,
    propertyId:    raw.propertyId,
    homeowner:     raw.homeowner?.toString() ?? "",
    billType:      Object.keys(raw.billType)[0] as BillType,
    provider:      raw.provider,
    periodStart:   raw.periodStart,
    periodEnd:     raw.periodEnd,
    amountCents:   Number(raw.amountCents),
    usageAmount:   raw.usageAmount?.[0] != null ? Number(raw.usageAmount[0]) : undefined,
    usageUnit:     raw.usageUnit?.[0] ?? undefined,
    uploadedAt:    Math.floor(Number(raw.uploadedAt) / 1_000_000), // ns → ms
    anomalyFlag:   raw.anomalyFlag,
    anomalyReason: raw.anomalyReason?.[0] ?? undefined,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const billService = {
  /** Store a confirmed bill record in the canister. */
  async addBill(args: AddBillArgs): Promise<BillRecord> {
    const actor = await getBillsActor();
    const raw = await actor.addBill({
      propertyId:  args.propertyId,
      billType:    { [args.billType]: null },
      provider:    args.provider,
      periodStart: args.periodStart,
      periodEnd:   args.periodEnd,
      amountCents: BigInt(args.amountCents),
      usageAmount: args.usageAmount != null ? [args.usageAmount] : [],
      usageUnit:   args.usageUnit   != null ? [args.usageUnit]   : [],
    });
    return toRecord(fromVariant(raw));
  },

  /** Fetch all bill records for a property. */
  async getBillsForProperty(propertyId: string): Promise<BillRecord[]> {
    const actor = await getBillsActor();
    const raw = await actor.getBillsForProperty(propertyId);
    const records: any[] = fromVariant(raw);
    return records.map(toRecord);
  },

  /** Delete a bill record. */
  async deleteBill(id: string): Promise<void> {
    const actor = await getBillsActor();
    const raw = await actor.deleteBill(id);
    fromVariant(raw);
  },

  reset() {
  },
};

/**
 * Send a bill image/PDF to the voice agent's extract-bill endpoint.
 * Returns the structured extraction result for user confirmation before saving.
 */
export async function extractBill(
  fileName: string,
  mimeType: string,
  base64Data: string,
): Promise<BillExtraction> {
  const res = await fetch(`${VOICE_AGENT_URL}/api/extract-bill`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ fileName, mimeType, base64Data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Bill extraction failed");
  }
  return res.json();
}
