import { parseDollarAmount } from "./jobFormService";
import type { SubmitBidInput } from "./bidService";

export interface BidForm {
  amountDollars: string;
  timelineDays:  string;
  notes:         string;
}

/** Pure — parses a positive integer day count (1–365). Returns null if invalid. */
export function parseTimelineDays(raw: string): number | null {
  if (!raw.trim()) return null;
  const val = Math.floor(parseFloat(raw));
  if (isNaN(val) || val <= 0 || val > 365) return null;
  return val;
}

/** Pure — validates all bid form fields; returns human-readable error or null */
export function validateBidForm(form: BidForm): string | null {
  if (parseDollarAmount(form.amountDollars) === null)
    return "Enter a valid bid amount greater than $0.";
  if (parseTimelineDays(form.timelineDays) === null)
    return "Enter a timeline between 1 and 365 days.";
  return null;
}

/** Pure — transforms a validated form into a canister-ready payload */
export function buildBidPayload(requestId: string, form: BidForm): SubmitBidInput {
  return {
    requestId,
    amountCents:  parseDollarAmount(form.amountDollars)!,
    timelineDays: parseTimelineDays(form.timelineDays)!,
    notes:        form.notes.trim() || null,
  };
}
