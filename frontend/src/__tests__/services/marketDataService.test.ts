/**
 * marketDataService — real logic worth locking down:
 *   - getSnapshot uses the metro profile matched by zip prefix, falling back
 *     to the national baseline for unmapped prefixes
 *   - results are cached per zip — a second call returns the cached snapshot
 *   - getInventoryTrend derives direction from month-over-month % (>1 rising,
 *     <-1 falling, else stable)
 *   - getCached returns null until a snapshot has been fetched
 */

import { describe, it, expect } from "vitest";
import { createMarketDataService } from "@/services/marketDataService";

describe("marketDataService.getSnapshot", () => {
  it("uses the matched metro profile for a known zip prefix (Austin, TX)", async () => {
    const service = createMarketDataService();
    const snap = await service.getSnapshot("78701");
    expect(snap.pricePerSqft).toBe(290);
    expect(snap.inventoryTrend).toBe("rising");
    expect(snap.zip).toBe("78701");
  });

  it("falls back to the national baseline for an unmapped zip prefix", async () => {
    const service = createMarketDataService();
    const snap = await service.getSnapshot("00000");
    expect(snap.pricePerSqft).toBe(185);
    expect(snap.daysOnMarket).toBe(35);
    expect(snap.inventoryTrend).toBe("stable");
  });

  it("caches the snapshot per zip — a second call returns the same object", async () => {
    const service = createMarketDataService();
    const first = await service.getSnapshot("78701");
    const second = await service.getSnapshot("78701");
    expect(second).toBe(first);
  });
});

describe("marketDataService.getInventoryTrend", () => {
  it("returns 'falling' for a metro with negative momPct (San Francisco)", async () => {
    const service = createMarketDataService();
    const trend = await service.getInventoryTrend("94105");
    expect(trend.direction).toBe("falling");
    expect(trend.monthOverMonthPct).toBeLessThan(-1);
  });

  it("returns 'stable' for the national baseline (momPct = 0)", async () => {
    const service = createMarketDataService();
    const trend = await service.getInventoryTrend("00000");
    expect(trend.direction).toBe("stable");
  });
});

describe("marketDataService.getCached", () => {
  it("returns null before any fetch, and the snapshot after", async () => {
    const service = createMarketDataService();
    expect(service.getCached("78701")).toBeNull();
    await service.getSnapshot("78701");
    expect(service.getCached("78701")).not.toBeNull();
  });
});
