/**
 * priceBenchmark with the quote canister wired: local accepted-quote stats win
 * over the national range, and the national range is the fallback when the
 * area has too few accepted quotes (getLocalPriceStats returns none).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLocalStats, mockNational } = vi.hoisted(() => {
  process.env.QUOTE_CANISTER_ID = "quote-test";
  return { mockLocalStats: vi.fn(), mockNational: vi.fn() };
});
vi.mock("@/services/lazyActor", () => ({
  lazyActor: () => async () => ({ getLocalPriceStats: mockLocalStats }),
}));
vi.mock("@/services/aiProxy", () => ({ aiProxyService: { getPriceBenchmark: mockNational } }));

import { getPriceBenchmark, benchmarkBasis } from "@/services/priceBenchmark";

const NATIONAL = JSON.stringify({ serviceType: "Roofing", zipCode: "32114", low: 1, median: 2, high: 3, source: "national" });

beforeEach(() => vi.clearAllMocks());

describe("getPriceBenchmark — local accepted quotes", () => {
  it("returns local stats when the area has enough accepted quotes", async () => {
    mockLocalStats.mockResolvedValue([{ low: 900_000n, median: 1_200_000n, high: 1_500_000n, sampleSize: 7n, area: "321xx" }]);
    const r = await getPriceBenchmark("Roofing", "32114");
    expect(mockLocalStats).toHaveBeenCalledWith("Roofing", "32114");
    expect(mockNational).not.toHaveBeenCalled();
    expect(r).toEqual({ serviceType: "Roofing", zipCode: "32114", source: "local", low: 900_000, median: 1_200_000, high: 1_500_000, sampleSize: 7, area: "321xx" });
    expect(benchmarkBasis(r!)).toBe("Based on 7 quotes homeowners accepted on HomeGentic in 321xx");
  });

  it("falls back to the national range when there are too few local quotes", async () => {
    mockLocalStats.mockResolvedValue([]);
    mockNational.mockResolvedValue(NATIONAL);
    const r = await getPriceBenchmark("Roofing", "32114");
    expect(r).toMatchObject({ source: "national", sampleSize: 0, median: 2 });
    expect(benchmarkBasis(r!)).toMatch(/Typical U.S. range, not local bids/);
  });

  it("falls back to the national range when the quote canister call fails", async () => {
    mockLocalStats.mockRejectedValue(new Error("down"));
    mockNational.mockResolvedValue(NATIONAL);
    expect(await getPriceBenchmark("Roofing", "32114")).toMatchObject({ source: "national" });
  });
});
