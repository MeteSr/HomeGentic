/**
 * Pricing Intelligence Service — Epic 10.2
 *
 * Pure computation helpers for price recommendations and DOM estimation.
 * Depends on premiumEstimate() from scoreService for the HomeGentic score premium model.
 */

import { premiumEstimate } from "@/services/scoreService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceRecommendation {
  /** Base price = pricePerSqFtCents × sqFt */
  baseCents: number;
  /** HomeGentic premium lower bound in cents (null when score < 40) */
  premiumLowCents: number | null;
  /** HomeGentic premium upper bound in cents (null when score < 40) */
  premiumHighCents: number | null;
  /** Suggested list price low = baseCents + premiumLowCents (or baseCents when no premium) */
  suggestedLowCents: number;
  /** Suggested list price high = baseCents + premiumHighCents (or baseCents when no premium) */
  suggestedHighCents: number;
}

export interface DomEstimate {
  /** Point estimate for days on market */
  estimatedDays: number;
  /** Lower bound (≈ 75th percentile fast) */
  low: number;
  /** Upper bound (≈ 75th percentile slow) */
  high: number;
}

// ─── 10.2.2 — HomeGentic-adjusted price recommendation ──────────────────────────

/**
 * Computes a suggested list price range using comp-derived price/sqft data and
 * the HomeGentic score premium model (premiumEstimate from scoreService — 6.1.2).
 *
 * @param pricePerSqFtCents  Median comp price per square foot in cents
 * @param sqFt               Subject property square footage
 * @param score              HomeGentic score (0–100)
 */
export function computePriceRecommendation(
  pricePerSqFtCents: number,
  sqFt: number,
  score: number
): PriceRecommendation {
  const baseCents = Math.round(pricePerSqFtCents * sqFt);
  const premium = premiumEstimate(score);

  if (!premium) {
    return {
      baseCents,
      premiumLowCents: null,
      premiumHighCents: null,
      suggestedLowCents: baseCents,
      suggestedHighCents: baseCents,
    };
  }

  // premiumEstimate returns dollar values — convert to cents
  const premiumLowCents = premium.low * 100;
  const premiumHighCents = premium.high * 100;

  return {
    baseCents,
    premiumLowCents,
    premiumHighCents,
    suggestedLowCents: baseCents + premiumLowCents,
    suggestedHighCents: baseCents + premiumHighCents,
  };
}

// ─── 10.2.4 — DOM estimator ───────────────────────────────────────────────────

/**
 * Seasonal adjustment factor by month (1=Jan … 12=Dec):
 *   Winter (12, 1, 2)  → 1.15  (+15% slower)
 *   Summer (6, 7, 8)   → 0.90  (-10% faster)
 *   Spring/Fall        → 1.00  (neutral)
 */
function seasonFactor(month: number): number {
  if (month === 12 || month === 1 || month === 2) return 1.15;
  if (month >= 6 && month <= 8) return 0.90;
  return 1.00;
}

/**
 * Score-band adjustment factor:
 *   score >= 85  → 0.80 (-20%)
 *   score >= 70  → 0.90 (-10%)
 *   score >= 55  → 1.00 (neutral)
 *   score >= 40  → 1.10 (+10%)
 *   score <  40  → 1.25 (+25%)
 */
function scoreDomFactor(score: number): number {
  if (score >= 85) return 0.80;
  if (score >= 70) return 0.90;
  if (score >= 55) return 1.00;
  if (score >= 40) return 1.10;
  return 1.25;
}

/**
 * Estimates days on market by adjusting the comp median DOM for season and
 * HomeGentic score band.
 *
 * @param compMedianDom  Median days-on-market from comparable sales
 * @param month          Current month (1–12)
 * @param score          HomeGentic score (0–100)
 */
export function estimateDaysOnMarket(
  compMedianDom: number,
  month: number,
  score: number
): DomEstimate {
  const adjusted = compMedianDom * seasonFactor(month) * scoreDomFactor(score);
  const estimatedDays = Math.max(1, Math.round(adjusted));
  return {
    estimatedDays,
    low: Math.round(estimatedDays * 0.75),
    high: Math.round(estimatedDays * 1.25),
  };
}
