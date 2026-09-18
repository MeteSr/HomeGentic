/**
 * priceBenchmark — real logic worth locking down:
 *   - getPriceBenchmark returns null for missing inputs or any failure
 *     (including malformed JSON), otherwise the parsed result
 *   - hasSufficientSamples gates on sampleSize >= 5
 *   - formatBenchmarkRange renders low–high as rounded dollar amounts
 *   - buildPriceLookupUrl builds the correct query string
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetPriceBenchmark } = vi.hoisted(() => ({ mockGetPriceBenchmark: vi.fn() }));
vi.mock("@/services/aiProxy", () => ({ aiProxyService: { getPriceBenchmark: mockGetPriceBenchmark } }));

import { getPriceBenchmark, hasSufficientSamples, formatBenchmarkRange, buildPriceLookupUrl, type PriceBenchmarkResult } from "@/services/priceBenchmark";

beforeEach(() => vi.clearAllMocks());

describe("getPriceBenchmark", () => {
  it("returns null when serviceType or zipCode is missing", async () => {
    expect(await getPriceBenchmark("", "78701")).toBeNull();
    expect(await getPriceBenchmark("HVAC", "")).toBeNull();
    expect(mockGetPriceBenchmark).not.toHaveBeenCalled();
  });

  it("returns null when the canister returns no data", async () => {
    mockGetPriceBenchmark.mockResolvedValue(null);
    expect(await getPriceBenchmark("HVAC", "78701")).toBeNull();
  });

  it("returns null when the canister call throws", async () => {
    mockGetPriceBenchmark.mockRejectedValue(new Error("canister unavailable"));
    expect(await getPriceBenchmark("HVAC", "78701")).toBeNull();
  });

  it("returns null on malformed JSON rather than throwing", async () => {
    mockGetPriceBenchmark.mockResolvedValue("not-json{{");
    expect(await getPriceBenchmark("HVAC", "78701")).toBeNull();
  });

  it("returns the parsed result on success", async () => {
    const raw = { serviceType: "HVAC", zipCode: "78701", low: 10000, median: 15000, high: 20000, sampleSize: 10, lastUpdated: "2024-01" };
    mockGetPriceBenchmark.mockResolvedValue(JSON.stringify(raw));
    expect(await getPriceBenchmark("HVAC", "78701")).toEqual(raw);
  });
});

function makeResult(overrides: Partial<PriceBenchmarkResult> = {}): PriceBenchmarkResult {
  return { serviceType: "HVAC", zipCode: "78701", low: 12000, median: 18000, high: 25000, sampleSize: 10, lastUpdated: "2024-01", ...overrides };
}

describe("hasSufficientSamples", () => {
  it("is false for null or sampleSize < 5", () => {
    expect(hasSufficientSamples(null)).toBe(false);
    expect(hasSufficientSamples(makeResult({ sampleSize: 4 }))).toBe(false);
  });

  it("is true for sampleSize >= 5", () => {
    expect(hasSufficientSamples(makeResult({ sampleSize: 5 }))).toBe(true);
  });
});

describe("formatBenchmarkRange", () => {
  it("formats low-high as rounded dollar amounts with thousands separators", () => {
    expect(formatBenchmarkRange(makeResult({ low: 120000, high: 250000 }))).toBe("$1,200–$2,500");
  });
});

describe("buildPriceLookupUrl", () => {
  it("builds a /prices URL with service and zip params", () => {
    expect(buildPriceLookupUrl("HVAC", "78701")).toBe("/prices?service=HVAC&zip=78701");
  });
});
