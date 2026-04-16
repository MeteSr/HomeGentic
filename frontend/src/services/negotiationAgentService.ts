/**
 * Negotiation Agent Service — 5.2.2
 *
 * Analyzes contractor quotes against network-wide pricing benchmarks using
 * Claude as the reasoning engine.
 *
 * IMPORTANT: Users must explicitly opt-in (grant consent) per quote request
 * before any analysis runs. HomeGentic never contacts contractors directly —
 * this service only returns analysis for the homeowner to act on.
 */

import { pricingHistoryService, type PricingBenchmark } from "./pricingHistoryService";
import type { Quote, QuoteRequest } from "./quote";

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";
const STORAGE_KEY = "hf_negotiation_consents";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NegotiationVerdict = "fair" | "high" | "low";

export interface NegotiationAnalysis {
  quoteId:               string;
  verdict:               NegotiationVerdict;
  percentile:            number;           // 0–100; where quote sits in benchmark distribution
  suggestedCounterCents?: number;          // only present when verdict === "high"
  rationale:             string;           // 2–3 sentences
  benchmarkUsed:         PricingBenchmark;
  generatedAt:           number;
}

// ─── Consent helpers ──────────────────────────────────────────────────────────

function loadConsents(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveConsents(set: Set<string>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

// ─── Rule-based mock analysis (fallback when voice agent is offline) ──────────

function mockAnalyze(
  quote: Quote,
  benchmark: PricingBenchmark,
): NegotiationAnalysis {
  const { p25, median, p75 } = benchmark;
  const amt = quote.amount;

  // Percentile: linear interpolation across [0, p25, median, p75, ∞]
  let percentile: number;
  if      (amt <= p25)    percentile = Math.round((amt / p25) * 25);
  else if (amt <= median) percentile = 25 + Math.round(((amt - p25) / (median - p25)) * 25);
  else if (amt <= p75)    percentile = 50 + Math.round(((amt - median) / (p75 - median)) * 25);
  else                    percentile = 75 + Math.min(25, Math.round(((amt - p75) / p75) * 25));

  percentile = Math.max(0, Math.min(100, percentile));

  let verdict: NegotiationVerdict;
  if      (amt < p25)    verdict = "low";
  else if (amt > p75)    verdict = "high";
  else                   verdict = "fair";

  const fmtK = (c: number) => `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  let rationale: string;
  let suggestedCounterCents: number | undefined;

  if (verdict === "high") {
    suggestedCounterCents = Math.round(median * 1.05);
    rationale = `This quote is above the 75th percentile (${fmtK(p75)}) for ${benchmark.serviceType} work in your area. ` +
      `The market median is ${fmtK(median)}, so there's room to negotiate. ` +
      `A counter of ${fmtK(suggestedCounterCents)} (5% above median) is defensible based on network pricing data.`;
  } else if (verdict === "low") {
    rationale = `This quote is below the 25th percentile (${fmtK(p25)}) for ${benchmark.serviceType} in your area. ` +
      `Prices this low may indicate a less experienced contractor or cut corners on materials. ` +
      `Verify licensing and reviews before accepting — the market median is ${fmtK(median)}.`;
  } else {
    rationale = `This quote falls within the normal market range for ${benchmark.serviceType} work in your area ` +
      `(market range: ${fmtK(p25)}–${fmtK(p75)}, median: ${fmtK(median)}). ` +
      `It's a fair price — accepting is reasonable.`;
  }

  return {
    quoteId:   quote.id,
    verdict,
    percentile,
    suggestedCounterCents,
    rationale,
    benchmarkUsed: benchmark,
    generatedAt:   Date.now(),
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createNegotiationAgentService() {
  const consents = loadConsents();

  function grantConsent(requestId: string): void {
    consents.add(requestId);
    saveConsents(consents);
  }

  function revokeConsent(requestId: string): void {
    consents.delete(requestId);
    saveConsents(consents);
  }

  function hasConsent(requestId: string): boolean {
    return consents.has(requestId);
  }

  async function analyzeQuote(
    quote:   Quote,
    request: QuoteRequest,
    zip:     string,
  ): Promise<NegotiationAnalysis> {
    if (!hasConsent(quote.requestId)) {
      throw new Error(`Negotiation analysis requires user consent for quote request ${quote.requestId} — call grantConsent() first`);
    }

    const benchmark = pricingHistoryService.getBenchmark(request.serviceType, zip);
    if (!benchmark) {
      throw new Error(`No pricing benchmark available for service type: ${request.serviceType}`);
    }

    try {
      const { voiceAgentHeaders } = await import("./voiceAgentHeaders");
      const resp = await fetch(`${VOICE_AGENT_URL}/api/negotiate`, {
        method:  "POST",
        headers: voiceAgentHeaders(),
        body: JSON.stringify({
          quote:     { id: quote.id, amount: quote.amount, timeline: quote.timeline },
          request:   { serviceType: request.serviceType, description: request.description, urgency: request.urgency },
          zip,
          benchmark: { p25: benchmark.p25, median: benchmark.median, p75: benchmark.p75 },
        }),
      });
      if (!resp.ok) throw new Error(`Negotiation agent upstream error: HTTP ${resp.status} from ${VOICE_AGENT_URL}/api/negotiate`);
      const data = await resp.json() as NegotiationAnalysis;
      return { ...data, benchmarkUsed: benchmark };
    } catch {
      // Fallback: deterministic rule-based analysis
      return mockAnalyze(quote, benchmark);
    }
  }

  return { grantConsent, revokeConsent, hasConsent, analyzeQuote };
}

export const negotiationAgentService = createNegotiationAgentService();
