/**
 * §17.4 — Buyer Report Lookup
 *
 * Lets buyers search for a HomeFax report by property address without login.
 * Calls the voice-agent relay which queries the report canister for public links.
 */

const RELAY_URL =
  typeof window !== "undefined"
    ? ((window as any).__VITE_AGENT_URL ?? "http://localhost:3001")
    : "http://localhost:3001";

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
  const encoded    = encodeURIComponent(normalized).replace(/%20/g, "+");
  const res        = await fetch(`${RELAY_URL}/api/check?address=${encoded}`);

  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
  return res.json();
}

// ── submitReportRequest ───────────────────────────────────────────────────────

export async function submitReportRequest(
  address:    string,
  buyerEmail: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${RELAY_URL}/api/report-request`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ address, buyerEmail }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
