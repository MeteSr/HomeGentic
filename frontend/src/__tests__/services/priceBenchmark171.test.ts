/**
 * §17.1 — Pre-quote price benchmarking by zip code
 *
 * Tests:
 *   17.1.1 — getPriceBenchmark: relay fetch → PriceBenchmarkResult
 *   17.1.2 — hasSufficientSamples: hide widget when sampleSize < 5
 *   17.1.3 — formatBenchmarkRange: "$X–$Y" display string
 *   17.1.4 — buildPriceLookupUrl: shareable /prices?... link
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getPriceBenchmark,
  hasSufficientSamples,
  formatBenchmarkRange,
  buildPriceLookupUrl,
  type PriceBenchmarkResult,
} from "@/services/priceBenchmark";

const MOCK_RESULT: PriceBenchmarkResult = {
  serviceType: "Roofing",
  zipCode:     "32114",
  low:         800000,   // cents
  median:      1400000,
  high:        2200000,
  sampleSize:  23,
  lastUpdated: "2025-11",
};

// ── getPriceBenchmark ──────────────────────────────────────────────────────────

describe("getPriceBenchmark", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("returns a PriceBenchmarkResult on success", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok:   true,
      json: async () => MOCK_RESULT,
    } as any);

    const result = await getPriceBenchmark("Roofing", "32114");
    expect(result).not.toBeNull();
    expect(result!.serviceType).toBe("Roofing");
    expect(result!.zipCode).toBe("32114");
    expect(result!.low).toBe(800000);
    expect(result!.median).toBe(1400000);
    expect(result!.high).toBe(2200000);
    expect(result!.sampleSize).toBe(23);
  });

  it("calls the relay at /api/price-benchmark with service and zip query params", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true, json: async () => MOCK_RESULT,
    } as any);

    await getPriceBenchmark("Roofing", "32114");
    const url: string = (global.fetch as any).mock.calls[0][0];
    expect(url).toContain("/api/price-benchmark");
    expect(url).toContain("service=Roofing");
    expect(url).toContain("zip=32114");
  });

  it("returns null when relay returns non-OK response", async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 } as any);
    const result = await getPriceBenchmark("Roofing", "00000");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("network error"));
    const result = await getPriceBenchmark("Roofing", "32114");
    expect(result).toBeNull();
  });

  it("returns null when zipCode is empty", async () => {
    const result = await getPriceBenchmark("Roofing", "");
    expect(result).toBeNull();
  });

  it("returns null when serviceType is empty", async () => {
    const result = await getPriceBenchmark("", "32114");
    expect(result).toBeNull();
  });
});

// ── hasSufficientSamples ──────────────────────────────────────────────────────

describe("hasSufficientSamples", () => {
  it("returns true when sampleSize is 5 or more", () => {
    expect(hasSufficientSamples({ ...MOCK_RESULT, sampleSize: 5 })).toBe(true);
    expect(hasSufficientSamples({ ...MOCK_RESULT, sampleSize: 23 })).toBe(true);
    expect(hasSufficientSamples({ ...MOCK_RESULT, sampleSize: 100 })).toBe(true);
  });

  it("returns false when sampleSize is below 5", () => {
    expect(hasSufficientSamples({ ...MOCK_RESULT, sampleSize: 4 })).toBe(false);
    expect(hasSufficientSamples({ ...MOCK_RESULT, sampleSize: 1 })).toBe(false);
    expect(hasSufficientSamples({ ...MOCK_RESULT, sampleSize: 0 })).toBe(false);
  });

  it("returns false for null input", () => {
    expect(hasSufficientSamples(null)).toBe(false);
  });
});

// ── formatBenchmarkRange ──────────────────────────────────────────────────────

describe("formatBenchmarkRange", () => {
  it("formats low and high in dollar notation with – separator", () => {
    // $8,000–$22,000
    const text = formatBenchmarkRange(MOCK_RESULT);
    expect(text).toBe("$8,000–$22,000");
  });

  it("formats smaller amounts without thousands separator", () => {
    const result: PriceBenchmarkResult = { ...MOCK_RESULT, low: 50000, high: 90000 };
    // $500–$900
    expect(formatBenchmarkRange(result)).toBe("$500–$900");
  });

  it("rounds cents to nearest dollar", () => {
    const result: PriceBenchmarkResult = { ...MOCK_RESULT, low: 150099, high: 250050 };
    expect(formatBenchmarkRange(result)).toBe("$1,501–$2,501");
  });
});

// ── buildPriceLookupUrl ───────────────────────────────────────────────────────

describe("buildPriceLookupUrl", () => {
  it("builds /prices?service=...&zip=... URL", () => {
    const url = buildPriceLookupUrl("Roofing", "32114");
    expect(url).toBe("/prices?service=Roofing&zip=32114");
  });

  it("URL-encodes service type with spaces", () => {
    const url = buildPriceLookupUrl("HVAC Repair", "90210");
    expect(url).toContain("service=HVAC+Repair");
  });
});
