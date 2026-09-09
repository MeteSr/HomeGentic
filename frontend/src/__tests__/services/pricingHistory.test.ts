/**
 * TDD — 5.2.1: Historical Pricing Data Aggregation
 *
 * pricingHistoryService provides per-service-type, per-zip pricing benchmarks
 * (p25, median, p75) derived from network-wide quote data and national baselines.
 */

import { describe, it, expect } from "vitest";
import { createPricingHistoryService } from "@/services/pricingHistoryService";

describe("pricingHistoryService.getBenchmark (5.2.1)", () => {
  const svc = createPricingHistoryService();

  it("returns a benchmark for a known service type", () => {
    const b = svc.getBenchmark("HVAC", "94103");
    expect(b).toBeDefined();
    expect(b!.serviceType).toBe("HVAC");
  });

  it("benchmark has p25, median, p75 in ascending order", () => {
    const b = svc.getBenchmark("Roofing", "78701");
    expect(b).toBeDefined();
    expect(b!.p25).toBeLessThanOrEqual(b!.median);
    expect(b!.median).toBeLessThanOrEqual(b!.p75);
  });

  it("all values are positive cents", () => {
    const b = svc.getBenchmark("Plumbing", "10001");
    expect(b!.p25).toBeGreaterThan(0);
    expect(b!.median).toBeGreaterThan(0);
    expect(b!.p75).toBeGreaterThan(0);
  });

  it("returns a benchmark even for an unknown zip (falls back to national)", () => {
    const b = svc.getBenchmark("Electrical", "00000");
    expect(b).toBeDefined();
    expect(b!.zip).toBe("national");
  });

  it("high-cost metro returns higher median than national for same service", () => {
    const sf = svc.getBenchmark("HVAC", "94103");   // SF
    const nat = svc.getBenchmark("HVAC", "00000");  // fallback national
    expect(sf!.median).toBeGreaterThan(nat!.median);
  });

  it("returns null for an unknown service type", () => {
    const b = svc.getBenchmark("SpaceLaser", "94103");
    expect(b).toBeNull();
  });

  it("sampleCount is a non-negative integer", () => {
    const b = svc.getBenchmark("HVAC", "94103");
    expect(Number.isInteger(b!.sampleCount)).toBe(true);
    expect(b!.sampleCount).toBeGreaterThanOrEqual(0);
  });

  it("updatedAt is a recent epoch timestamp", () => {
    const before = Date.now() - 1000;
    const b = svc.getBenchmark("HVAC", "94103");
    expect(b!.updatedAt).toBeGreaterThan(before);
  });
});

describe("pricingHistoryService.getAllBenchmarks (5.2.1)", () => {
  const svc = createPricingHistoryService();

  it("returns benchmarks for all standard service types", () => {
    const types = ["HVAC", "Roofing", "Plumbing", "Electrical", "Flooring", "Windows", "Landscaping", "Painting"];
    for (const t of types) {
      expect(svc.getBenchmark(t, "94103")).not.toBeNull();
    }
  });
});
