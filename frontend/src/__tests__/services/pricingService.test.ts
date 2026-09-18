/**
 * pricingService — real logic worth locking down:
 *   - computePriceRecommendation returns no premium for score < 40, otherwise
 *     adds the real premiumEstimate() dollar range (converted to cents)
 *   - estimateDaysOnMarket applies season and score-band multipliers correctly
 */

import { describe, it, expect } from "vitest";
import { computePriceRecommendation, estimateDaysOnMarket } from "@/services/pricingService";

describe("computePriceRecommendation", () => {
  it("returns no premium for score < 40", () => {
    const rec = computePriceRecommendation(20000, 2000, 20);
    expect(rec.baseCents).toBe(40_000_000);
    expect(rec.premiumLowCents).toBeNull();
    expect(rec.suggestedLowCents).toBe(rec.baseCents);
    expect(rec.suggestedHighCents).toBe(rec.baseCents);
  });

  it("adds a premium range for score >= 40", () => {
    const rec = computePriceRecommendation(20000, 2000, 85);
    expect(rec.premiumLowCents).not.toBeNull();
    expect(rec.suggestedLowCents).toBeGreaterThan(rec.baseCents);
    expect(rec.suggestedHighCents).toBeGreaterThan(rec.suggestedLowCents!);
  });

  it("computes baseCents as pricePerSqFtCents * sqFt", () => {
    const rec = computePriceRecommendation(15000, 1500, 20);
    expect(rec.baseCents).toBe(22_500_000);
  });
});

describe("estimateDaysOnMarket", () => {
  it("applies the winter slowdown factor (+15%)", () => {
    const result = estimateDaysOnMarket(30, 1, 55); // Jan, neutral score band
    expect(result.estimatedDays).toBe(Math.round(30 * 1.15 * 1.00));
  });

  it("applies the summer speedup factor (-10%)", () => {
    const result = estimateDaysOnMarket(30, 7, 55); // July, neutral score band
    expect(result.estimatedDays).toBe(Math.round(30 * 0.90 * 1.00));
  });

  it("applies the high-score speedup factor (score >= 85 → -20%)", () => {
    const result = estimateDaysOnMarket(30, 4, 90); // neutral month, high score
    expect(result.estimatedDays).toBe(Math.round(30 * 1.00 * 0.80));
  });

  it("applies the low-score slowdown factor (score < 40 → +25%)", () => {
    const result = estimateDaysOnMarket(30, 4, 20);
    expect(result.estimatedDays).toBe(Math.round(30 * 1.00 * 1.25));
  });

  it("computes low/high as 75%/125% of the estimated days", () => {
    const result = estimateDaysOnMarket(40, 4, 55);
    expect(result.low).toBe(Math.round(result.estimatedDays * 0.75));
    expect(result.high).toBe(Math.round(result.estimatedDays * 1.25));
  });

  it("never estimates fewer than 1 day", () => {
    const result = estimateDaysOnMarket(1, 7, 90);
    expect(result.estimatedDays).toBeGreaterThanOrEqual(1);
  });
});
