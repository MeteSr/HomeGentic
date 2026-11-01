/**
 * Mobile Bill Service (Epic #49)
 *
 * Calls the voice agent's /api/extract-bill endpoint to OCR a bill
 * image captured by the camera or selected from the photo library.
 * Then saves the confirmed bill record to the bills canister.
 */

import { getAgentSessionToken } from "./agentSession";
import { aiRefusalMessage } from "@homegentic/shared/aiChecks";
import { aiFetch } from "./aiFetch";
import { idlFactory } from "@homegentic/shared/declarations/bills";
import { actorFor, nsToMs, tag } from "./canister";

const VOICE_AGENT_URL =
  process.env.EXPO_PUBLIC_VOICE_AGENT_URL ?? "http://localhost:8787";
const BILLS_CANISTER_ID = process.env.EXPO_PUBLIC_BILLS_CANISTER_ID ?? "";

export type BillType = "Electric" | "Gas" | "Water" | "Internet" | "Telecom" | "Other";

export interface BillExtraction {
  billType?:    BillType;
  provider?:    string;
  periodStart?: string;  // YYYY-MM-DD
  periodEnd?:   string;  // YYYY-MM-DD
  amountCents?: number;
  usageAmount?: number;
  usageUnit?:   string;
  confidence:   "high" | "medium" | "low";
  description:  string;
}

export interface BillRecord {
  id:            string;
  propertyId:    string;
  billType:      BillType;
  provider:      string;
  periodStart:   string;
  periodEnd:     string;
  amountCents:   number;
  usageAmount?:  number;
  usageUnit?:    string;
  uploadedAt:    number;
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

// ─── Error types ─────────────────────────────────────────────────────────────

export class TierLimitReachedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TierLimitReachedError";
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a base64-encoded bill image to the voice agent for OCR extraction.
 * Returns structured bill data for user confirmation before saving.
 */
export async function extractBill(
  fileName: string,
  mimeType: string,
  base64Data: string,
): Promise<BillExtraction> {
  // The Worker only runs AI routes for a signed-in user's session.
  const token = await getAgentSessionToken().catch(() => null);
  const res = await aiFetch(`${VOICE_AGENT_URL}/api/extract-bill`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ fileName, mimeType, base64Data }),
  }, token);
  const refusal = await aiRefusalMessage(res);
  if (refusal) throw new Error(refusal);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Bill extraction failed");
  }
  return res.json();
}

function billsActor(): any {
  if (!BILLS_CANISTER_ID) throw new Error("Bills aren't available in this build (EXPO_PUBLIC_BILLS_CANISTER_ID is not set)");
  return actorFor(idlFactory, BILLS_CANISTER_ID);
}

/** Map a bills-canister error variant to an Error (TierLimitReachedError for the plan limit). */
function billError(err: Record<string, unknown>): Error {
  if ("TierLimitReached" in err) return new TierLimitReachedError(String(err.TierLimitReached));
  const key = Object.keys(err)[0];
  const val = err[key];
  return new Error(typeof val === "string" ? val : key);
}

function fromBill(raw: any): BillRecord {
  return {
    id:            raw.id,
    propertyId:    raw.propertyId,
    billType:      tag<BillType>(raw.billType),
    provider:      raw.provider,
    periodStart:   raw.periodStart,
    periodEnd:     raw.periodEnd,
    amountCents:   Number(raw.amountCents),
    usageAmount:   raw.usageAmount[0] ?? undefined,
    usageUnit:     raw.usageUnit[0] ?? undefined,
    uploadedAt:    nsToMs(raw.uploadedAt),
    anomalyFlag:   raw.anomalyFlag,
    anomalyReason: raw.anomalyReason[0] ?? undefined,
  };
}

/** Save a confirmed bill record to the bills canister. */
export async function addBill(args: AddBillArgs): Promise<BillRecord> {
  const result = await billsActor().addBill({
    propertyId:  args.propertyId,
    billType:    { [args.billType]: null },
    provider:    args.provider,
    periodStart: args.periodStart,
    periodEnd:   args.periodEnd,
    amountCents: BigInt(Math.max(0, Math.round(args.amountCents))),
    usageAmount: args.usageAmount != null ? [args.usageAmount] : [],
    usageUnit:   args.usageAmount != null && args.usageUnit ? [args.usageUnit] : [],
  });
  if ("err" in result) throw billError(result.err);
  return fromBill(result.ok);
}

/** Fetch all bills for a property from the bills canister. */
export async function getBillsForProperty(propertyId: string): Promise<BillRecord[]> {
  const result = await billsActor().getBillsForProperty(propertyId);
  if ("err" in result) throw billError(result.err);
  return (result.ok as any[]).map(fromBill);
}
