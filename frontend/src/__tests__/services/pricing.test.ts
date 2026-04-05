/**
 * TDD — Epic 10.2 Pricing Intelligence
 *
 * 10.2.1  Comparable sales  — CompSale type + compService mock interface
 * 10.2.2  HomeGentic-adjusted price recommendation — computePriceRecommendation()
 * 10.2.3  Price history tracking — fsboService.logPriceChange / getPriceHistory
 * 10.2.4  DOM estimator — estimateDaysOnMarket()
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── 10.2.2 ───────────────────────────────────────────────────────────────────
import { computePriceRecommendation } from "@/services/pricingService";

// ─── 10.2.4 ───────────────────────────────────────────────────────────────────
import { estimateDaysOnMarket } from "@/services/pricingService";

// ─── 10.2.3 ───────────────────────────────────────────────────────────────────
import { fsboService } from "@/services/fsbo";

// ─── 10.2.1 ───────────────────────────────────────────────────────────────────
import { compService } from "@/services/compService";
import type { CompSale } from "@/services/compService";

// ──────────────────────────────────────────────────────────────────────────────
// 10.2.2  HomeGentic-adjusted price recommendation
// ──────────────────────────────────────────────────────────────────────────────
describe("computePriceRecommendation — (10.2.2)", () => {
  it("returns base price = pricePerSqFtCents × sqFt", () => {
    // $200/sqft × 1 sqft = $200 base, score 30 → no premium
    const result = computePriceRecommendation(20_000, 1, 30);
    expect(result.baseCents).toBe(20_000);
  });

  it("returns null premium fields when score < 40 (below signal threshold)", () => {
    const result = computePriceRecommendation(20_000, 1_000, 38);
    expect(result.premiumLowCents).toBeNull();
    expect(result.premiumHighCents).toBeNull();
  });

  it("suggested range = base ± premium when premium available", () => {
    // $200/sqft × 1800 sqft = $360,000 base (36_000_000 cents)
    // score 75 → premiumEstimate = { low: 15_000, high: 25_000 } dollars
    //   = { low: 1_500_000, high: 2_500_000 } cents
    // suggestedLow = 36_000_000 + 1_500_000 = 37_500_000
    // suggestedHigh = 36_000_000 + 2_500_000 = 38_500_000
    const result = computePriceRecommendation(20_000, 1_800, 75);
    expect(result.baseCents).toBe(36_000_000);
    expect(result.premiumLowCents).toBe(1_500_000);
    expect(result.premiumHighCents).toBe(2_500_000);
    expect(result.suggestedLowCents).toBe(37_500_000);
    expect(result.suggestedHighCents).toBe(38_500_000);
  });

  it("score 85+ uses the top premium band ($20K–$35K)", () => {
    // $300/sqft × 1000 sqft = $300,000 (30_000_000 cents)
    // score 90 → { low: 20_000, high: 35_000 } → 2_000_000 / 3_500_000 cents
    const result = computePriceRecommendation(30_000, 1_000, 90);
    expect(result.premiumLowCents).toBe(2_000_000);
    expect(result.premiumHighCents).toBe(3_500_000);
    expect(result.suggestedLowCents).toBe(32_000_000);
    expect(result.suggestedHighCents).toBe(33_500_000);
  });

  it("score 55 uses the $8K–$15K band", () => {
    const result = computePriceRecommendation(10_000, 2_000, 55);
    // base = 10_000 × 2_000 = 20_000_000 cents
    // premium band [55,70) → { low: 8_000, high: 15_000 } → 800_000 / 1_500_000 cents
    expect(result.premiumLowCents).toBe(800_000);
    expect(result.premiumHighCents).toBe(1_500_000);
  });

  it("score 40 uses the $3K–$8K band", () => {
    const result = computePriceRecommendation(10_000, 1_000, 40);
    // premium band [40,55) → { low: 3_000, high: 8_000 } → 300_000 / 800_000 cents
    expect(result.premiumLowCents).toBe(300_000);
    expect(result.premiumHighCents).toBe(800_000);
  });

  it("when no premium, suggestedLow and suggestedHigh equal base", () => {
    const result = computePriceRecommendation(20_000, 500, 35);
    expect(result.suggestedLowCents).toBe(result.baseCents);
    expect(result.suggestedHighCents).toBe(result.baseCents);
  });

  it("fractional sqft rounds base to nearest cent", () => {
    // 20_001 cents/sqft × 1 sqft = 20_001 (exact); using non-round to test no float bleed
    const result = computePriceRecommendation(33_333, 3, 30);
    expect(result.baseCents).toBe(99_999);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10.2.3  Price history tracking
// ──────────────────────────────────────────────────────────────────────────────
describe("fsboService price history — (10.2.3)", () => {
  beforeEach(() => {
    fsboService.__reset();
  });

  it("getPriceHistory returns empty array when no history exists", () => {
    expect(fsboService.getPriceHistory("prop-1")).toEqual([]);
  });

  it("logPriceChange appends an entry with priceCents and a timestamp", () => {
    fsboService.logPriceChange("prop-1", 50_000_000);
    const history = fsboService.getPriceHistory("prop-1");
    expect(history).toHaveLength(1);
    expect(history[0].priceCents).toBe(50_000_000);
    expect(typeof history[0].recordedAt).toBe("number");
  });

  it("multiple calls append in order (oldest first)", () => {
    fsboService.logPriceChange("prop-1", 50_000_000);
    fsboService.logPriceChange("prop-1", 48_000_000);
    fsboService.logPriceChange("prop-1", 46_500_000);
    const history = fsboService.getPriceHistory("prop-1");
    expect(history).toHaveLength(3);
    expect(history[0].priceCents).toBe(50_000_000);
    expect(history[1].priceCents).toBe(48_000_000);
    expect(history[2].priceCents).toBe(46_500_000);
  });

  it("history is isolated per property", () => {
    fsboService.logPriceChange("prop-1", 50_000_000);
    fsboService.logPriceChange("prop-2", 30_000_000);
    expect(fsboService.getPriceHistory("prop-1")).toHaveLength(1);
    expect(fsboService.getPriceHistory("prop-2")).toHaveLength(1);
  });

  it("timestamps are non-decreasing across calls", () => {
    fsboService.logPriceChange("prop-1", 50_000_000);
    fsboService.logPriceChange("prop-1", 48_000_000);
    const history = fsboService.getPriceHistory("prop-1");
    expect(history[1].recordedAt).toBeGreaterThanOrEqual(history[0].recordedAt);
  });

  it("__reset clears all price history", () => {
    fsboService.logPriceChange("prop-1", 50_000_000);
    fsboService.__reset();
    expect(fsboService.getPriceHistory("prop-1")).toEqual([]);
  });

  it("getPriceHistory returns a copy — mutations do not affect stored history", () => {
    fsboService.logPriceChange("prop-1", 50_000_000);
    const history = fsboService.getPriceHistory("prop-1");
    history.push({ priceCents: 1, recordedAt: 0 });
    expect(fsboService.getPriceHistory("prop-1")).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10.2.4  DOM estimator
// ──────────────────────────────────────────────────────────────────────────────
describe("estimateDaysOnMarket — (10.2.4)", () => {
  /**
   * Seasonal adjustment (month 1–12):
   *   Winter (Dec/Jan/Feb — months 12,1,2) : +15%
   *   Spring (Mar–May)                      : no adjustment
   *   Summer (Jun–Aug)                      : -10%
   *   Fall   (Sep–Nov)                      : no adjustment
   *
   * Score band adjustment applied on top of seasonal base:
   *   score >= 85  : -20%
   *   score >= 70  : -10%
   *   score >= 55  :   0%
   *   score >= 40  :  +10%
   *   score <  40  :  +25%
   *
   * Final estimatedDays = round(compMedianDom × seasonFactor × scoreFactor)
   * low  = round(estimatedDays × 0.75)
   * high = round(estimatedDays × 1.25)
   */

  it("neutral season + neutral score band returns compMedianDom unchanged", () => {
    // Spring (month 4), score 60 → seasonFactor=1, scoreFactor=1
    const result = estimateDaysOnMarket(30, 4, 60);
    expect(result.estimatedDays).toBe(30);
    expect(result.low).toBe(23);   // round(30 × 0.75)
    expect(result.high).toBe(38);  // round(30 × 1.25)
  });

  it("winter adds 15% to estimated DOM", () => {
    // month=1, score 60 → seasonFactor=1.15, scoreFactor=1 → 30×1.15=34.5→35
    const result = estimateDaysOnMarket(30, 1, 60);
    expect(result.estimatedDays).toBe(35);
  });

  it("summer subtracts 10% from estimated DOM", () => {
    // month=7, score 60 → seasonFactor=0.90 → 30×0.9=27
    const result = estimateDaysOnMarket(30, 7, 60);
    expect(result.estimatedDays).toBe(27);
  });

  it("fall is neutral (no seasonal adjustment)", () => {
    // month=10, score 60 → 30 unchanged
    const result = estimateDaysOnMarket(30, 10, 60);
    expect(result.estimatedDays).toBe(30);
  });

  it("December is treated as winter", () => {
    const result = estimateDaysOnMarket(30, 12, 60);
    expect(result.estimatedDays).toBe(35);
  });

  it("February is treated as winter", () => {
    const result = estimateDaysOnMarket(40, 2, 60);
    // 40 × 1.15 = 46
    expect(result.estimatedDays).toBe(46);
  });

  it("score >= 85 reduces DOM by 20%", () => {
    // month=4, score=88 → scoreFactor=0.80 → 30×0.80=24
    const result = estimateDaysOnMarket(30, 4, 88);
    expect(result.estimatedDays).toBe(24);
  });

  it("score in [70,85) reduces DOM by 10%", () => {
    // month=4, score=72 → scoreFactor=0.90 → 30×0.90=27
    const result = estimateDaysOnMarket(30, 4, 72);
    expect(result.estimatedDays).toBe(27);
  });

  it("score in [40,55) adds 10% to DOM", () => {
    // month=4, score=45 → scoreFactor=1.10 → 30×1.10=33
    const result = estimateDaysOnMarket(30, 4, 45);
    expect(result.estimatedDays).toBe(33);
  });

  it("score < 40 adds 25% to DOM", () => {
    // month=4, score=30 → scoreFactor=1.25 → 30×1.25=37.5→38
    const result = estimateDaysOnMarket(30, 4, 30);
    expect(result.estimatedDays).toBe(38);
  });

  it("combines seasonal and score factors multiplicatively", () => {
    // month=1 (winter +15%), score=88 (-20%) → 1.15 × 0.80 = 0.92 → 30×0.92=27.6→28
    const result = estimateDaysOnMarket(30, 1, 88);
    expect(result.estimatedDays).toBe(28);
  });

  it("low/high band is ±25% of estimatedDays (rounded)", () => {
    // month=4, score=60, compDom=40 → estimated=40, low=30, high=50
    const result = estimateDaysOnMarket(40, 4, 60);
    expect(result.low).toBe(30);
    expect(result.high).toBe(50);
  });

  it("estimatedDays is never less than 1", () => {
    // Even with aggressive score + summer discounts, dom=1 should stay >= 1
    const result = estimateDaysOnMarket(1, 7, 90);
    expect(result.estimatedDays).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 10.2.1  Comparable sales — mock interface
// ──────────────────────────────────────────────────────────────────────────────
describe("compService — (10.2.1)", () => {
  beforeEach(() => {
    compService.__reset();
  });

  it("getComps returns an empty array for unknown zip", async () => {
    const comps = await compService.getComps("99999");
    expect(Array.isArray(comps)).toBe(true);
    expect(comps).toHaveLength(0);
  });

  it("seedComps + getComps round-trips mock data", async () => {
    const mockComps: CompSale[] = [
      {
        address: "123 Main St",
        zipCode: "12345",
        salePriceCents: 40_000_000,
        sqFt: 2_000,
        daysOnMarket: 22,
        saleToListRatio: 0.98,
        soldAt: Date.now() - 86_400_000 * 30,
      },
      {
        address: "456 Oak Ave",
        zipCode: "12345",
        salePriceCents: 38_000_000,
        sqFt: 1_800,
        daysOnMarket: 35,
        saleToListRatio: 0.95,
        soldAt: Date.now() - 86_400_000 * 60,
      },
    ];
    compService.seedComps("12345", mockComps);
    const comps = await compService.getComps("12345");
    expect(comps).toHaveLength(2);
    expect(comps[0].address).toBe("123 Main St");
    expect(comps[1].daysOnMarket).toBe(35);
  });

  it("summarizeComps returns median pricePerSqFtCents, medianDom, medianSaleToList", () => {
    const comps: CompSale[] = [
      { address: "A", zipCode: "12345", salePriceCents: 30_000_000, sqFt: 1_500, daysOnMarket: 20, saleToListRatio: 0.97, soldAt: 1 },
      { address: "B", zipCode: "12345", salePriceCents: 40_000_000, sqFt: 2_000, daysOnMarket: 30, saleToListRatio: 0.99, soldAt: 2 },
      { address: "C", zipCode: "12345", salePriceCents: 50_000_000, sqFt: 2_500, daysOnMarket: 40, saleToListRatio: 1.01, soldAt: 3 },
    ];
    // pricePerSqFt: 20_000, 20_000, 20_000 → median = 20_000
    // dom: 20, 30, 40 → median = 30
    // saleToList: 0.97, 0.99, 1.01 → median = 0.99
    compService.seedComps("12345", comps);
    const summary = compService.summarizeComps("12345");
    expect(summary).not.toBeNull();
    expect(summary!.medianPricePerSqFtCents).toBe(20_000);
    expect(summary!.medianDaysOnMarket).toBe(30);
    expect(summary!.medianSaleToListRatio).toBeCloseTo(0.99);
  });

  it("summarizeComps returns null for unknown zip", () => {
    expect(compService.summarizeComps("00000")).toBeNull();
  });

  it("__reset clears all seeded data", async () => {
    compService.seedComps("12345", [
      { address: "A", zipCode: "12345", salePriceCents: 1, sqFt: 1, daysOnMarket: 1, saleToListRatio: 1, soldAt: 1 },
    ]);
    compService.__reset();
    const comps = await compService.getComps("12345");
    expect(comps).toHaveLength(0);
  });
});
