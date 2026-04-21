/**
 * Mobile Bill Service (Epic #49)
 *
 * Calls the voice agent's /api/extract-bill endpoint to OCR a bill
 * image captured by the camera or selected from the photo library.
 * Then saves the confirmed bill record to the bills canister.
 */

const VOICE_AGENT_URL =
  process.env.EXPO_PUBLIC_VOICE_AGENT_URL ?? "http://localhost:3001";

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

/** Save a confirmed bill record to the bills canister. */
export async function addBill(_args: AddBillArgs): Promise<BillRecord> {
  throw new Error("Not implemented: addBill — wire to bills canister addBill");
}

/** Fetch all bills for a property from the bills canister. */
export async function getBillsForProperty(_propertyId: string): Promise<BillRecord[]> {
  throw new Error("Not implemented: getBillsForProperty — wire to bills canister getBillsForProperty");
}
