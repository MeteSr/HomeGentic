/**
 * Bills Intelligence Service (Epic #49 Stories 3–6)
 *
 * Pure analysis functions layered on top of billService. Talks to the voice
 * agent proxy for AI-enhanced features (rebate finder, telecom negotiation).
 * Calls the bills canister's getUsageTrend query directly for usage trend data.
 */

import { billService } from "./billService";
import type { BillType } from "./billService";
import type { BillsForecast } from "./billsForecast";
import { voiceAgentHeaders } from "./voiceAgentHeaders";

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL || "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UsagePeriod {
  periodStart: string;   // YYYY-MM-DD
  usageAmount: number;
  usageUnit:   string;
}

export interface EfficiencyAnalysisResult {
  degradationDetected:  boolean;
  estimatedAnnualWaste?: number;  // cents
  recommendation?:      string;
  trendPct?:            number;   // % change from early to late half
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

// ─── Story 3: System Efficiency Degradation ───────────────────────────────────

/**
 * Fetch usage trend data from the bills canister.
 * Calls the getUsageTrend Motoko query which filters to usage-tracked bills,
 * scoped to the calling principal, sorted chronologically.
 */
export async function getUsageTrend(
  propertyId: string,
  billType:   BillType,
  months:     number,
): Promise<UsagePeriod[]> {
  // Use billService (which has its own mock fallback) and filter client-side.
  // This allows unit tests to mock getBillsForProperty, and integration tests
  // to hit the real canister via the same code path.
  const bills = await billService.getBillsForProperty(propertyId);

  // Compute the cutoff: only include bills within the requested window.
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

  return bills
    .filter(
      (b) =>
        b.billType === billType &&
        b.usageAmount != null &&
        b.usageUnit   != null &&
        b.periodStart >= cutoffStr,
    )
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart))
    .map((b) => ({
      periodStart: b.periodStart,
      usageAmount: b.usageAmount as number,
      usageUnit:   b.usageUnit   as string,
    }));
}

/**
 * Detect system efficiency degradation by comparing first-half vs second-half
 * average usage in the trend window. A >15% rise signals degradation.
 */
export function analyzeEfficiencyTrend(trend: UsagePeriod[]): EfficiencyAnalysisResult {
  if (trend.length < 4) {
    return { degradationDetected: false };
  }

  const mid      = Math.floor(trend.length / 2);
  const earlyAvg = trend.slice(0, mid).reduce((s, p) => s + p.usageAmount, 0) / mid;
  const lateAvg  = trend.slice(mid).reduce((s, p) => s + p.usageAmount, 0) / (trend.length - mid);

  if (earlyAvg === 0) return { degradationDetected: false };

  const trendPct = ((lateAvg - earlyAvg) / earlyAvg) * 100;

  if (trendPct <= 15) {
    return { degradationDetected: false, trendPct };
  }

  const estimatedAnnualWaste = Math.round((lateAvg - earlyAvg) * 12);
  const unit = trend[0]?.usageUnit ?? "";
  const unitSuffix = unit ? ` ${unit}` : "";
  const recommendation = `Usage has risen ${trendPct.toFixed(1)}% over this period ` +
    `(~${Math.round(lateAvg - earlyAvg)}${unitSuffix}/period). ` +
    `Consider scheduling an HVAC tune-up or home energy audit.`;

  return { degradationDetected: true, estimatedAnnualWaste, recommendation, trendPct };
}

// ─── Story 4: Rebate Finder ───────────────────────────────────────────────────

/**
 * Find available rebates for a utility type via the voice agent.
 * Only Electric bills are supported (federal/state/utility rebate programs).
 */
export async function findRebates(params: RebateFindParams): Promise<RebateResult[]> {
  if (params.billType !== "Electric") {
    throw new Error(`Rebate finder only supports Electric bills (got: ${params.billType})`);
  }

  const response = await fetch(`${VOICE_AGENT_URL}/api/rebate-finder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Rebate finder request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.rebates as RebateResult[];
}

// ─── Story 6: Telecom Negotiation ────────────────────────────────────────────

/**
 * Analyze a telecom bill and generate a negotiation script via the voice agent.
 */
export async function negotiateTelecom(params: TelecomNegotiateParams): Promise<TelecomNegotiationResult> {
  if (!params.provider || params.provider.trim() === "") {
    throw new Error("Provider name is required");
  }
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error("amountCents must be a positive integer");
  }

  const response = await fetch(`${VOICE_AGENT_URL}/api/telecom-negotiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(`Telecom negotiate request failed: ${response.status}`);
  }

  return response.json() as Promise<TelecomNegotiationResult>;
}

// ─── Forecast narrative ──────────────────────────────────────────────────────

export interface BillsNarrative {
  summary: string;
  tips:    string[];
  source:  "ai" | "rules";
}

/**
 * Ask the voice agent to explain a deterministic forecast in plain language.
 * Only series keys, numbers and dates are sent — never provider names or other
 * user-entered text — so the model can explain the figures but not invent them.
 */
export async function getBillsNarrative(forecast: BillsForecast): Promise<BillsNarrative> {
  const payload = {
    asOf:             forecast.asOf,
    next12TotalCents: forecast.next12TotalCents,
    avgMonthlyCents:  forecast.avgMonthlyCents,
    series: forecast.series.map(({ key, method, confidence, next12Cents }) => ({ key, method, confidence, next12Cents })),
    insights: forecast.insights,
  };
  const response = await fetch(`${VOICE_AGENT_URL}/api/bills-insights`, {
    method:  "POST",
    headers: voiceAgentHeaders(),
    body:    JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Bills insights request failed: ${response.status}`);
  return response.json() as Promise<BillsNarrative>;
}
