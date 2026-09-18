/**
 * systemAgeEstimator — real logic worth locking down:
 *   - parseEstimatorParams returns null without a valid yearBuilt, otherwise
 *     parses type/state/per-system overrides
 *   - buildEstimatorUrl round-trips with parseEstimatorParams
 *   - estimateSystems uses yearBuilt for all systems by default, but applies
 *     a valid per-system override (ignoring out-of-range ones)
 */

import { describe, it, expect } from "vitest";
import { parseEstimatorParams, buildEstimatorUrl, estimateSystems } from "@/services/systemAgeEstimator";

describe("parseEstimatorParams", () => {
  it("returns null when yearBuilt is missing or invalid", () => {
    expect(parseEstimatorParams(new URLSearchParams(""))).toBeNull();
    expect(parseEstimatorParams(new URLSearchParams("yearBuilt=abc"))).toBeNull();
    expect(parseEstimatorParams(new URLSearchParams("yearBuilt=1700"))).toBeNull();
  });

  it("defaults propertyType to single-family when not specified", () => {
    const result = parseEstimatorParams(new URLSearchParams("yearBuilt=1990"));
    expect(result?.propertyType).toBe("single-family");
  });

  it("parses per-system override params", () => {
    const result = parseEstimatorParams(new URLSearchParams("yearBuilt=1990&hvac=2010&roofing=2015"));
    expect(result?.systemOverrides).toEqual({ HVAC: 2010, Roofing: 2015 });
  });
});

describe("buildEstimatorUrl / parseEstimatorParams round-trip", () => {
  it("round-trips yearBuilt, type, state, and overrides", () => {
    const input = { yearBuilt: 1990, propertyType: "condo", state: "TX", systemOverrides: { HVAC: 2010 } };
    const url = buildEstimatorUrl(input);
    const parsed = parseEstimatorParams(new URLSearchParams(url.split("?")[1]));
    expect(parsed).toEqual(input);
  });
});

describe("estimateSystems", () => {
  it("uses yearBuilt as the install year for all systems by default", () => {
    const estimates = estimateSystems(1990, "TX");
    for (const e of estimates) {
      expect(e.installYear).toBe(1990);
    }
  });

  it("applies a valid per-system override year", () => {
    const estimates = estimateSystems(1970, "TX", { HVAC: 2015 });
    const hvac = estimates.find((e) => e.systemName === "HVAC");
    expect(hvac?.installYear).toBe(2015);

    const other = estimates.find((e) => e.systemName === "Roofing");
    expect(other?.installYear).toBe(1970);
  });

  it("ignores an override year before yearBuilt or in the future", () => {
    const estimates = estimateSystems(1990, "TX", { HVAC: 1980 });
    const hvac = estimates.find((e) => e.systemName === "HVAC");
    expect(hvac?.installYear).toBe(1990);

    const futureOverride = estimateSystems(1990, "TX", { HVAC: 9999 });
    const hvac2 = futureOverride.find((e) => e.systemName === "HVAC");
    expect(hvac2?.installYear).toBe(1990);
  });

  it("returns estimates for every tracked system", () => {
    const estimates = estimateSystems(2000, "TX");
    expect(estimates.length).toBeGreaterThan(0);
    expect(new Set(estimates.map((e) => e.systemName)).size).toBe(estimates.length);
  });
});
