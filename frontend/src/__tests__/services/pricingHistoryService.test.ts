/**
 * pricingHistoryService — real logic worth locking down:
 *   - getBenchmark returns null for an unknown service type
 *   - applies the metro multiplier for a mapped zip prefix, or falls back
 *     to "national" with a 1.0 multiplier for unmapped prefixes
 */

import { describe, it, expect } from "vitest";
import { createPricingHistoryService } from "@/services/pricingHistoryService";

describe("pricingHistoryService.getBenchmark", () => {
  it("returns null for an unknown service type", () => {
    const service = createPricingHistoryService();
    expect(service.getBenchmark("Astrology", "78701")).toBeNull();
  });

  it("applies the metro multiplier for a mapped zip prefix (Austin, TX)", () => {
    const service = createPricingHistoryService();
    const benchmark = service.getBenchmark("HVAC", "78701");
    expect(benchmark).not.toBeNull();
    expect(benchmark!.zip).toBe("78701");
    expect(benchmark!.p25).toBe(Math.round(120_000 * 1.12));
    expect(benchmark!.median).toBe(Math.round(185_000 * 1.12));
  });

  it("falls back to 'national' with a 1.0 multiplier for an unmapped prefix", () => {
    const service = createPricingHistoryService();
    const benchmark = service.getBenchmark("HVAC", "00000");
    expect(benchmark!.zip).toBe("national");
    expect(benchmark!.p25).toBe(120_000);
    expect(benchmark!.median).toBe(185_000);
    expect(benchmark!.p75).toBe(280_000);
  });

  it("carries over the correct sample count for the service type", () => {
    const service = createPricingHistoryService();
    const benchmark = service.getBenchmark("Roofing", "00000");
    expect(benchmark!.sampleCount).toBe(1_800);
  });
});
