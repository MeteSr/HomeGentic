/**
 * Typical U.S. price ranges (packages/shared/src/nationalPrices.ts): one per
 * service type (the same numbers as ai_proxy's PRICE_SEEDS) and one per
 * subtype of Other (Inspection, Garage Door, Septic…), so every choice in the
 * job and quote pickers has a range. Always national, never local.
 *
 *  NP.1 every service type and every subtype has a range, low <= median <= high
 *  NP.2 the service-type ranges match ai_proxy's PRICE_SEEDS (drift guard)
 *  NP.3 lookup by label or key, case-insensitive; unknown is undefined
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NATIONAL_PRICE_RANGES, nationalPriceRange } from "../../../../packages/shared/src/nationalPrices";
import { SERVICE_TYPES, SERVICE_SUBTYPES, SERVICE_CHOICE_LABELS } from "../../../../packages/shared/src/serviceTypes";

describe("NP.1 coverage", () => {
  it("has a sane range for every picker choice", () => {
    for (const label of SERVICE_CHOICE_LABELS) {
      const r = nationalPriceRange(label);
      expect(r, label).toBeDefined();
      expect(r!.low, label).toBeGreaterThan(0);
      expect(r!.low, label).toBeLessThanOrEqual(r!.median);
      expect(r!.median, label).toBeLessThanOrEqual(r!.high);
    }
    expect(Object.keys(NATIONAL_PRICE_RANGES)).toHaveLength(SERVICE_TYPES.length + SERVICE_SUBTYPES.length);
  });
});

describe("NP.2 matches ai_proxy", () => {
  it("uses the same numbers as PRICE_SEEDS for each service type", () => {
    const src = readFileSync(resolve(__dirname, "../../../../backend/ai_proxy/main.mo"), "utf8");
    const seeds = [...src.matchAll(/\("(\w+)",\s*\{\s*low = (\d+);\s*median = (\d+);\s*high = (\d+) \}\)/g)];
    expect(seeds.length).toBe(SERVICE_TYPES.length);
    for (const [, tag, low, median, high] of seeds) {
      expect(NATIONAL_PRICE_RANGES[tag], tag).toEqual({ low: Number(low), median: Number(median), high: Number(high) });
    }
  });
});

describe("NP.3 lookup", () => {
  it("finds a range by label or key", () => {
    expect(nationalPriceRange("Pest Control")).toEqual(NATIONAL_PRICE_RANGES.Pest);
    expect(nationalPriceRange("Pest")).toEqual(NATIONAL_PRICE_RANGES.Pest);
    expect(nationalPriceRange("garage door")).toEqual(NATIONAL_PRICE_RANGES.GarageDoor);
    expect(nationalPriceRange("Well & Water Treatment")).toEqual(NATIONAL_PRICE_RANGES.WellWater);
    expect(nationalPriceRange("Spaceship")).toBeUndefined();
  });
});
