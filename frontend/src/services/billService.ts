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
import { idlFactory } from "@/declarations/bills";
export { idlFactory };

const BILLS_CANISTER_ID = (process.env as any).BILLS_CANISTER_ID || "";
const VOICE_AGENT_URL   = (import.meta as any).env?.VITE_VOICE_AGENT_URL || "http://localhost:3001";

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

export type ExpenseCategory  = "Mortgage" | "PropertyTax" | "HOA" | "HomeInsurance" | "Other";
export type ExpenseFrequency = "Monthly" | "Quarterly" | "SemiAnnual" | "Annual";

/** A fixed, scheduled housing cost entered once rather than per statement. */
export interface RecurringExpense {
  id:          string;
  propertyId:  string;
  homeowner:   string;
  category:    ExpenseCategory;
  provider:    string;
  amountCents: number;   // per occurrence
  frequency:   ExpenseFrequency;
  startDate:   string;   // YYYY-MM-DD
  endDate?:    string;   // YYYY-MM-DD; undefined = ongoing
  createdAt:   number;   // ms
  updatedAt:   number;   // ms
}

export interface RecurringExpenseFields {
  category:    ExpenseCategory;
  provider:    string;
  amountCents: number;
  frequency:   ExpenseFrequency;
  startDate:   string;
  endDate?:    string;
}

const OCCURRENCES_PER_YEAR: Record<ExpenseFrequency, number> = {
  Monthly: 12, Quarterly: 4, SemiAnnual: 2, Annual: 1,
};

/** Average monthly cost of a recurring expense, in cents. */
export function monthlyEquivalentCents(e: Pick<RecurringExpense, "amountCents" | "frequency">): number {
  return Math.round((e.amountCents * OCCURRENCES_PER_YEAR[e.frequency]) / 12);
}

/** Whether the expense is in effect on `date` (YYYY-MM-DD, inclusive bounds). */
export function isActiveOn(e: Pick<RecurringExpense, "startDate" | "endDate">, date: string): boolean {
  return e.startDate <= date && (e.endDate == null || e.endDate >= date);
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

function toRecurring(raw: any): RecurringExpense {
  return {
    id:          raw.id,
    propertyId:  raw.propertyId,
    homeowner:   raw.homeowner?.toString() ?? "",
    category:    Object.keys(raw.category)[0] as ExpenseCategory,
    provider:    raw.provider,
    amountCents: Number(raw.amountCents),
    frequency:   Object.keys(raw.frequency)[0] as ExpenseFrequency,
    startDate:   raw.startDate,
    endDate:     raw.endDate?.[0] ?? undefined,
    createdAt:   Math.floor(Number(raw.createdAt) / 1_000_000),
    updatedAt:   Math.floor(Number(raw.updatedAt) / 1_000_000),
  };
}

function toFieldsArg(f: RecurringExpenseFields) {
  return {
    category:    { [f.category]: null },
    provider:    f.provider,
    amountCents: BigInt(f.amountCents),
    frequency:   { [f.frequency]: null },
    startDate:   f.startDate,
    endDate:     f.endDate ? [f.endDate] : [],
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

  async addRecurringExpense(propertyId: string, fields: RecurringExpenseFields): Promise<RecurringExpense> {
    const actor = await getBillsActor();
    return toRecurring(fromVariant(await actor.addRecurringExpense(propertyId, toFieldsArg(fields))));
  },

  async getRecurringExpensesForProperty(propertyId: string): Promise<RecurringExpense[]> {
    const actor = await getBillsActor();
    const records: any[] = fromVariant(await actor.getRecurringExpensesForProperty(propertyId));
    return records.map(toRecurring);
  },

  async updateRecurringExpense(id: string, fields: RecurringExpenseFields): Promise<RecurringExpense> {
    const actor = await getBillsActor();
    return toRecurring(fromVariant(await actor.updateRecurringExpense(id, toFieldsArg(fields))));
  },

  async deleteRecurringExpense(id: string): Promise<void> {
    const actor = await getBillsActor();
    fromVariant(await actor.deleteRecurringExpense(id));
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
