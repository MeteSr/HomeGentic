/**
 * §17.4 — Buyer Report Lookup
 *
 * Lets buyers search for a HomeGentic report by property address without login.
 * The lookup is an anonymous query on the report canister (findPublicReport),
 * which only matches active, unexpired Public share links. "Notify me" stores
 * the buyer's email with the notification relay, which checks the address
 * periodically and emails the report link once one is public.
 */

import { reportService } from "./report";

const RELAY_URL: string = (import.meta.env?.VITE_NOTIFICATIONS_URL ?? "").replace(/\/$/, "");

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuyerLookupResult {
  found:              boolean;
  token?:             string;
  address:            string;
  verificationLevel?: string;
  propertyType?:      string;
  yearBuilt?:         number;
}

// ── normalizeAddress ──────────────────────────────────────────────────────────

export function normalizeAddress(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[,.]$/, "")
    .trim();
}

// ── lookupReport ──────────────────────────────────────────────────────────────

export async function lookupReport(address: string): Promise<BuyerLookupResult> {
  const normalized = normalizeAddress(address);
  const match      = await reportService.findPublicReport(normalized);
  if (!match) return { found: false, address };
  return {
    found:             true,
    token:             match.token,
    address:           `${match.address}, ${match.city}, ${match.state} ${match.zipCode}`,
    verificationLevel: match.verificationLevel,
    propertyType:      match.propertyType,
    yearBuilt:         match.yearBuilt || undefined,
  };
}

// ── submitReportRequest ───────────────────────────────────────────────────────

/** Ask to be emailed when a public report exists for `address`. False when the relay refused or isn't configured. */
export async function submitReportRequest(
  address:    string,
  buyerEmail: string,
): Promise<boolean> {
  if (!RELAY_URL) return false;
  try {
    const res = await fetch(`${RELAY_URL}/api/report-alerts`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ address: normalizeAddress(address), email: buyerEmail.trim() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
