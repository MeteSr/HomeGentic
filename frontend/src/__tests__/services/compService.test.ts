/**
 * compService — real logic worth locking down:
 *   - getComps returns a copy of the seeded comps for a zip (empty when
 *     none seeded)
 *   - summarizeComps computes the median price/sqft, days-on-market, and
 *     sale-to-list ratio, returning null when no data exists
 *   - median handles both even and odd comp counts correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import { compService, type CompSale } from "@/services/compService";

function makeComp(overrides: Partial<CompSale> = {}): CompSale {
  return {
    address: "1 Test St", zipCode: "78701", salePriceCents: 40_000_000,
    sqFt: 2000, daysOnMarket: 20, saleToListRatio: 0.98, soldAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => compService.__reset());

describe("compService.getComps", () => {
  it("returns an empty array when nothing is seeded for a zip", async () => {
    expect(await compService.getComps("00000")).toEqual([]);
  });

  it("returns the seeded comps for a zip", async () => {
    const comps = [makeComp()];
    compService.seedComps("78701", comps);
    expect(await compService.getComps("78701")).toEqual(comps);
  });

  it("returns a copy, not the internal array reference", async () => {
    compService.seedComps("78701", [makeComp()]);
    const result = await compService.getComps("78701");
    result.push(makeComp({ address: "mutated" }));
    expect(await compService.getComps("78701")).toHaveLength(1);
  });
});

describe("compService.summarizeComps", () => {
  it("returns null when no comps are seeded for the zip", () => {
    expect(compService.summarizeComps("00000")).toBeNull();
  });

  it("computes medians for an odd number of comps", () => {
    compService.seedComps("78701", [
      makeComp({ salePriceCents: 30_000_000, sqFt: 1000, daysOnMarket: 10, saleToListRatio: 0.95 }), // 30000/sqft
      makeComp({ salePriceCents: 40_000_000, sqFt: 1000, daysOnMarket: 20, saleToListRatio: 0.98 }), // 40000/sqft
      makeComp({ salePriceCents: 50_000_000, sqFt: 1000, daysOnMarket: 30, saleToListRatio: 1.00 }), // 50000/sqft
    ]);

    const summary = compService.summarizeComps("78701");
    expect(summary).toEqual({
      zipCode: "78701",
      medianPricePerSqFtCents: 40_000,
      medianDaysOnMarket: 20,
      medianSaleToListRatio: 0.98,
      compCount: 3,
    });
  });

  it("computes medians for an even number of comps by averaging the middle two", () => {
    compService.seedComps("78701", [
      makeComp({ salePriceCents: 20_000_00, sqFt: 100, daysOnMarket: 10 }), // 20000/sqft
      makeComp({ salePriceCents: 40_000_00, sqFt: 100, daysOnMarket: 20 }), // 40000/sqft
    ]);

    const summary = compService.summarizeComps("78701");
    expect(summary?.medianPricePerSqFtCents).toBe(30_000);
    expect(summary?.medianDaysOnMarket).toBe(15);
  });
});
