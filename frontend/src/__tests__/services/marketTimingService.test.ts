/**
 * marketTimingService — real logic worth locking down, using the real
 * (deterministic, zip-keyed) marketDataService and climateService rather
 * than mocks — both are pure lookups with no network calls:
 *   - getAnalysis derives marketCondition from DOM/list-to-sale/inventory
 *   - recommendation is "wait" below score 40 regardless of market
 *   - getRecommendation maps listingScore to the correct urgency tier
 */

import { describe, it, expect } from "vitest";
import { createMarketTimingService } from "@/services/marketTimingService";

describe("marketTimingService.getAnalysis", () => {
  it("recommends 'wait' when score is below 40 regardless of market conditions", async () => {
    const service = createMarketTimingService();
    const analysis = await service.getAnalysis({ score: 20, zip: "78701", nowMs: new Date("2024-04-01").getTime() });
    expect(analysis.recommendation).toBe("wait");
    expect(analysis.estimatedPremium).toEqual({ low: 0, high: 0 });
  });

  it("derives 'hot' market condition for a fast, over-ask zip (Austin, spring)", async () => {
    const service = createMarketTimingService();
    // Austin (787xx): domFactor 1.1, listSaleRatio 0.98 — not hot by definition (needs dom<=20 and ratio>=1.00)
    // Use SF (940xx): domFactor 0.5 -> dom ~17.5, listSaleRatio 1.05 -> hot
    const analysis = await service.getAnalysis({ score: 80, zip: "94105", nowMs: new Date("2024-04-01").getTime() });
    expect(analysis.marketCondition).toBe("hot");
  });

  it("boosts listingScore in spring and reduces it in winter for the same inputs", async () => {
    const service = createMarketTimingService();
    const spring = await service.getAnalysis({ score: 70, zip: "78701", nowMs: new Date("2024-04-01").getTime() });
    const winter = await service.getAnalysis({ score: 70, zip: "78701", nowMs: new Date("2024-12-15").getTime() });
    expect(spring.listingScore).toBeGreaterThan(winter.listingScore);
  });

  it("includes a premium-based reasoning line for score >= 70", async () => {
    const service = createMarketTimingService();
    const analysis = await service.getAnalysis({ score: 80, zip: "78701", nowMs: new Date("2024-04-01").getTime() });
    expect(analysis.reasoning.some((r) => r.includes("HomeGentic score"))).toBe(true);
  });
});

describe("marketTimingService.getRecommendation", () => {
  it("maps a high listingScore to shouldListNow=true and urgency 'high'", async () => {
    const service = createMarketTimingService();
    const rec = await service.getRecommendation({ score: 90, zip: "94105", nowMs: new Date("2024-04-01").getTime() });
    expect(rec.shouldListNow).toBe(true);
    expect(rec.urgency).toBe("high");
  });

  it("maps a low score to shouldListNow=false and urgency 'low'", async () => {
    const service = createMarketTimingService();
    const rec = await service.getRecommendation({ score: 10, zip: "78701", nowMs: new Date("2024-12-15").getTime() });
    expect(rec.shouldListNow).toBe(false);
    expect(rec.urgency).toBe("low");
  });
});
