/**
 * HomeGentic Bills Intelligence (Epic #49 Stories 3–6)
 *
 * Story 3 — System Efficiency Degradation Alerts
 *   getUsageTrend()          — pulls bills from canister, filters to usage-tracked bills
 *   analyzeEfficiencyTrend() — pure algorithm: rising usage > 15% = degradation signal
 *
 * Story 4 — Rebate & Incentive Finder
 *   findRebates()            — calls POST /api/rebate-finder (voice agent)
 *
 * Story 6 — Telecom Negotiation Assistant
 *   negotiateTelecom()       — calls POST /api/telecom-negotiate (voice agent)
 *
 * Story 5 (Insurance Premium Triggers) is implemented in Layout.tsx / InsuranceDefensePage.tsx.
 */

import { billService, type BillType, type BillRecord } from "./billService";

const VOICE_AGENT_URL =
  (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsagePeriod {
  periodStart: string;   // YYYY-MM-DD
  usageAmount: number;
  usageUnit:   string;
}

export interface EfficiencyAnalysisResult {
  degradationDetected:  boolean;
  /** Estimated wasted usage units per year (lateAvg − earlyAvg) × 12 */
  estimatedAnnualWaste?: number;
  recommendation?:       string;
  /** Percentage rise from first-half average to second-half average */
  trendPct?:             number;
}

export interface RebateFindParams {
  state:           string;
  zipCode:         string;
  utilityProvider: string;
  billType:        BillType;
}

export interface RebateResult {
  name:            string;
  description:     string;
  estimatedAmount: string;
  provider:        string;
  url?:            string;
}

export interface TelecomNegotiateParams {
  provider:    string;
  amountCents: number;
  mbps:        number;
  zipCode:     string;
}

export interface TelecomNegotiationResult {
  verdict:                  "overpaying" | "fair" | "good_deal";
  medianCents:              number;
  savingsOpportunityCents:  number;
  negotiationScript:        string;
}

// ─── Story 3 — Efficiency Degradation ─────────────────────────────────────────

/**
 * Fetch bills for a property and return usage-tracked periods for a given
 * bill type, sorted chronologically, limited to the last `months` months.
 */
export async function getUsageTrend(
  propertyId: string,
  billType:   BillType,
  months:     number,
): Promise<UsagePeriod[]> {
  const allBills = await billService.getBillsForProperty(propertyId);

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  return allBills
    .filter(
      (b: BillRecord) =>
        b.billType === billType &&
        b.usageAmount != null &&
        b.usageUnit   != null &&
        b.periodStart >= cutoffStr,
    )
    .sort((a: BillRecord, b: BillRecord) => a.periodStart.localeCompare(b.periodStart))
    .map((b: BillRecord) => ({
      periodStart: b.periodStart,
      usageAmount: b.usageAmount!,
      usageUnit:   b.usageUnit!,
    }));
}

/**
 * Pure algorithm: compares first-half vs second-half average usage.
 * A >15% rise signals system efficiency degradation (HVAC losing efficiency,
 * water heater scaling, etc.).
 *
 * Requires at least 3 periods — returns degradationDetected:false otherwise.
 */
export function analyzeEfficiencyTrend(trend: UsagePeriod[]): EfficiencyAnalysisResult {
  if (trend.length < 3) return { degradationDetected: false };

  const half     = Math.floor(trend.length / 2);
  const early    = trend.slice(0, half);
  const late     = trend.slice(trend.length - half);

  const earlyAvg = early.reduce((s, p) => s + p.usageAmount, 0) / early.length;
  const lateAvg  = late.reduce((s, p)  => s + p.usageAmount, 0) / late.length;

  const trendPct = earlyAvg > 0 ? ((lateAvg - earlyAvg) / earlyAvg) * 100 : 0;

  if (trendPct > 15) {
    const monthlyWaste       = lateAvg - earlyAvg;
    const estimatedAnnualWaste = monthlyWaste * 12;
    const unit               = trend[0]?.usageUnit ?? "usage units";
    return {
      degradationDetected: true,
      estimatedAnnualWaste,
      recommendation: `Your ${unit} has increased ${trendPct.toFixed(1)}% over this period. This may indicate system inefficiency. Consider scheduling an HVAC inspection or checking for leaks.`,
      trendPct,
    };
  }

  return { degradationDetected: false, trendPct };
}

// ─── Story 4 — Rebate Finder ──────────────────────────────────────────────────

/**
 * Query the voice agent for available utility rebates in the homeowner's
 * area. Only Electric bills are eligible — throws for other bill types.
 */
export async function findRebates(params: RebateFindParams): Promise<RebateResult[]> {
  if (params.billType !== "Electric") {
    throw new Error("Rebate finder is only available for Electric bills.");
  }

  const res = await fetch(`${VOICE_AGENT_URL}/api/rebate-finder`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Rebate finder request failed");
  }

  const data = await res.json();
  return data.rebates as RebateResult[];
}

// ─── Story 6 — Telecom Negotiation ───────────────────────────────────────────

/**
 * Ask the voice agent to analyse a telecom bill and generate a
 * negotiation script. Returns verdict + median market rate + script.
 */
export async function negotiateTelecom(
  params: TelecomNegotiateParams,
): Promise<TelecomNegotiationResult> {
  if (!params.provider) {
    throw new Error("provider is required");
  }
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  const res = await fetch(`${VOICE_AGENT_URL}/api/telecom-negotiate`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Telecom negotiation request failed");
  }

  return res.json() as Promise<TelecomNegotiationResult>;
}
