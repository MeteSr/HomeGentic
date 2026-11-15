/**
 * priceBenchmark with the job canister wired: verified local costs (finished,
 * dual-signed jobs that owners chose to share; job.getVerifiedLocalCosts) win
 * over the national range, and the national range is the fallback when the
 * area has too few sharing homes (the canister returns none).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockLocalCosts, mockNational } = vi.hoisted(() => {
  process.env.JOB_CANISTER_ID = "job-test";
  return { mockLocalCosts: vi.fn(), mockNational: vi.fn() };
});
vi.mock("@/services/lazyActor", () => ({
  lazyActor: () => async () => ({ getVerifiedLocalCosts: mockLocalCosts }),
}));
vi.mock("@/services/aiProxy", () => ({ aiProxyService: { getPriceBenchmark: mockNational } }));

import { getPriceBenchmark, benchmarkBasis, hasSufficientSamples } from "@/services/priceBenchmark";

const NATIONAL = JSON.stringify({ serviceType: "Roofing", zipCode: "32114", low: 1, median: 2, high: 3, source: "national" });

beforeEach(() => vi.clearAllMocks());

describe("getPriceBenchmark — verified local costs", () => {
  it("returns the verified range when enough nearby homes share their costs", async () => {
    mockLocalCosts.mockResolvedValue([{ low: 900_000n, median: 1_200_000n, high: 1_500_000n, homes: 10n, area: "321xx" }]);
    const r = await getPriceBenchmark("Roofing", "32114");
    expect(mockLocalCosts).toHaveBeenCalledWith("Roofing", "32114");
    expect(mockNational).not.toHaveBeenCalled();
    expect(r).toEqual({ serviceType: "Roofing", zipCode: "32114", source: "local", low: 900_000, median: 1_200_000, high: 1_500_000, sampleSize: 10, area: "321xx" });
    expect(hasSufficientSamples(r)).toBe(true);
    expect(benchmarkBasis(r!)).toBe(
      "From finished jobs at 10+ homes in 321xx in the last 2 years, each signed off by the homeowner and a HomeGentic-verified contractor. Owners chose to share them; prices are rounded.",
    );
  });

  it("falls back to the national range when too few nearby homes share", async () => {
    mockLocalCosts.mockResolvedValue([]);
    mockNational.mockResolvedValue(NATIONAL);
    const r = await getPriceBenchmark("Roofing", "32114");
    expect(r).toMatchObject({ source: "national", sampleSize: 0, median: 2 });
    expect(benchmarkBasis(r!)).toMatch(/Typical U.S. range, not local prices/);
  });

  it("falls back to the national range when the job canister call fails", async () => {
    mockLocalCosts.mockRejectedValue(new Error("down"));
    mockNational.mockResolvedValue(NATIONAL);
    expect(await getPriceBenchmark("Roofing", "32114")).toMatchObject({ source: "national" });
  });

  it("sends the canisters the service type's tag, whatever label the caller used", async () => {
    mockLocalCosts.mockResolvedValue([]);
    mockNational.mockResolvedValue(NATIONAL);
    const r = await getPriceBenchmark("Pest Control", "32114");
    expect(mockLocalCosts).toHaveBeenCalledWith("Pest", "32114");
    expect(mockNational).toHaveBeenCalledWith("Pest", "32114");
    expect(r).toMatchObject({ serviceType: "Pest Control", source: "national" });
  });

  it("returns nothing for something that isn't a service type, without calling a canister", async () => {
    expect(await getPriceBenchmark("Pool Cleaning", "32114")).toBeNull();
    expect(mockLocalCosts).not.toHaveBeenCalled();
    expect(mockNational).not.toHaveBeenCalled();
  });

  it("gives a subtype of Other (Garage Door) its own national range, without calling a canister", async () => {
    const r = await getPriceBenchmark("Garage Door", "32114");
    expect(r).toMatchObject({ serviceType: "Garage Door", source: "national", sampleSize: 0 });
    expect(r!.low).toBeGreaterThan(0);
    expect(mockLocalCosts).not.toHaveBeenCalled();
    expect(mockNational).not.toHaveBeenCalled();
  });

  it("uses the app's own national table when ai_proxy can't answer", async () => {
    mockLocalCosts.mockResolvedValue([]);
    mockNational.mockRejectedValue(new Error("down"));
    expect(await getPriceBenchmark("Roofing", "32114")).toMatchObject({ source: "national", low: 800_000, median: 1_400_000, high: 2_200_000 });
  });
});
