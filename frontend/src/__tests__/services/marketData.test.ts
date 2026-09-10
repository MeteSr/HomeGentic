/**
 * TDD — 5.3.1: Local Real Estate Data Ingestion
 *
 * marketDataService provides inventory count, days-on-market, and
 * price-per-sqft for a given zip code. Shaped after the Zillow/ATTOM API
 * contracts so the real integration is a 1-line swap.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createMarketDataService,
} from "@/services/marketDataService";

describe("marketDataService.getSnapshot (5.3.1)", () => {
  let svc: ReturnType<typeof createMarketDataService>;
  beforeEach(() => { svc = createMarketDataService(); });

  it("returns a MarketSnapshot for a known zip", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(snap).toBeDefined();
    expect(typeof snap).toBe("object");
  });

  it("snapshot has zip", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(snap.zip).toBe("78701");
  });

  it("snapshot has medianListPrice > 0", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(snap.medianListPrice).toBeGreaterThan(0);
  });

  it("snapshot has activeListings >= 0", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(snap.activeListings).toBeGreaterThanOrEqual(0);
  });

  it("snapshot has daysOnMarket >= 0", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(snap.daysOnMarket).toBeGreaterThanOrEqual(0);
  });

  it("snapshot has pricePerSqft > 0", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(snap.pricePerSqft).toBeGreaterThan(0);
  });

  it("snapshot has listToSaleRatio between 0.8 and 1.2", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(snap.listToSaleRatio).toBeGreaterThanOrEqual(0.8);
    expect(snap.listToSaleRatio).toBeLessThanOrEqual(1.2);
  });

  it("snapshot has fetchedAt timestamp", async () => {
    const before = Date.now();
    const snap = await svc.getSnapshot("78701");
    expect(snap.fetchedAt).toBeGreaterThanOrEqual(before);
  });

  it("snapshot has inventoryTrend: 'rising' | 'falling' | 'stable'", async () => {
    const snap = await svc.getSnapshot("78701");
    expect(["rising", "falling", "stable"]).toContain(snap.inventoryTrend);
  });

  it("returns a snapshot for an unknown zip (fallback to national average)", async () => {
    const snap = await svc.getSnapshot("00001");
    expect(snap.medianListPrice).toBeGreaterThan(0);
    expect(snap.zip).toBe("00001");
  });

  it("higher-demand zip returns higher medianListPrice than lower-demand zip", async () => {
    const sf   = await svc.getSnapshot("94102");  // San Francisco
    const rural = await svc.getSnapshot("59801"); // Montana
    expect(sf.medianListPrice).toBeGreaterThan(rural.medianListPrice);
  });
});

describe("marketDataService.getInventoryTrend (5.3.1)", () => {
  let svc: ReturnType<typeof createMarketDataService>;
  beforeEach(() => { svc = createMarketDataService(); });

  it("returns an InventoryTrend object", async () => {
    const trend = await svc.getInventoryTrend("78701");
    expect(trend).toBeDefined();
  });

  it("trend has monthOverMonthPct (number)", async () => {
    const trend = await svc.getInventoryTrend("78701");
    expect(typeof trend.monthOverMonthPct).toBe("number");
  });

  it("trend has direction: rising | falling | stable", async () => {
    const trend = await svc.getInventoryTrend("78701");
    expect(["rising", "falling", "stable"]).toContain(trend.direction);
  });

  it("direction matches sign of monthOverMonthPct", async () => {
    const trend = await svc.getInventoryTrend("78701");
    if (trend.monthOverMonthPct > 1)       expect(trend.direction).toBe("rising");
    else if (trend.monthOverMonthPct < -1) expect(trend.direction).toBe("falling");
    else                                   expect(trend.direction).toBe("stable");
  });
});

describe("marketDataService cache (5.3.1)", () => {
  let svc: ReturnType<typeof createMarketDataService>;
  beforeEach(() => { svc = createMarketDataService(); });

  it("getCached returns null before any fetch", () => {
    expect(svc.getCached("78701")).toBeNull();
  });

  it("getCached returns snapshot after getSnapshot called", async () => {
    await svc.getSnapshot("78701");
    expect(svc.getCached("78701")).not.toBeNull();
  });

  it("second call returns same fetchedAt (served from cache)", async () => {
    const first  = await svc.getSnapshot("78701");
    const second = await svc.getSnapshot("78701");
    expect(second.fetchedAt).toBe(first.fetchedAt);
  });
});
