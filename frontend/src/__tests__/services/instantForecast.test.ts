/**
 * instantForecast — real logic worth locking down:
 *   - computeTenYearBudget sums replacementCostLow for systems due <=10 yrs
 *   - parseForecastParams returns null for missing/invalid address or year,
 *     and parses per-system override params
 *   - buildForecastUrl round-trips with parseForecastParams
 *   - forecastParamsToRegistration filters overrides to only tracked systems
 *   - lookupYearBuilt returns null when the underlying call throws
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeTenYearBudget, parseForecastParams, buildForecastUrl,
  forecastParamsToRegistration,
} from "@/services/instantForecast";
import type { SystemEstimate } from "@/services/systemAgeEstimator";

function makeEstimate(overrides: Partial<SystemEstimate> = {}): SystemEstimate {
  return {
    systemName: "HVAC", installYear: 2000, ageYears: 25, lifespanYears: 15,
    percentLifeUsed: 166, yearsRemaining: 0, urgency: "Critical",
    replacementCostLow: 5000, replacementCostHigh: 9000,
    ...overrides,
  };
}

describe("computeTenYearBudget", () => {
  it("sums replacementCostLow only for systems due within 10 years", () => {
    const estimates = [
      makeEstimate({ systemName: "HVAC", yearsRemaining: 5, replacementCostLow: 5000 }),
      makeEstimate({ systemName: "Roofing", yearsRemaining: 15, replacementCostLow: 9000 }),
      makeEstimate({ systemName: "Windows", yearsRemaining: 10, replacementCostLow: 3000 }),
    ];
    expect(computeTenYearBudget(estimates)).toBe(8000);
  });

  it("returns 0 for an empty list", () => {
    expect(computeTenYearBudget([])).toBe(0);
  });
});

describe("parseForecastParams", () => {
  it("returns null when address is missing", () => {
    expect(parseForecastParams(new URLSearchParams("yearBuilt=1990"))).toBeNull();
  });

  it("returns null when yearBuilt is missing or invalid", () => {
    expect(parseForecastParams(new URLSearchParams("address=1+Main+St"))).toBeNull();
    expect(parseForecastParams(new URLSearchParams("address=1+Main+St&yearBuilt=abc"))).toBeNull();
    expect(parseForecastParams(new URLSearchParams("address=1+Main+St&yearBuilt=1700"))).toBeNull();
  });

  it("parses valid address and yearBuilt, with optional state and overrides", () => {
    const result = parseForecastParams(new URLSearchParams("address=1+Main+St&yearBuilt=1990&state=TX&hvac=2010"));
    expect(result).toEqual({
      address: "1 Main St", yearBuilt: 1990, state: "TX",
      systemOverrides: { HVAC: 2010 },
    });
  });
});

describe("buildForecastUrl / parseForecastParams round-trip", () => {
  it("round-trips address, yearBuilt, state, and overrides", () => {
    const input = { address: "1 Main St", yearBuilt: 1990, state: "TX", systemOverrides: { HVAC: 2010 } };
    const url = buildForecastUrl(input);
    const parsed = parseForecastParams(new URLSearchParams(url.split("?")[1]));
    expect(parsed).toEqual(input);
  });
});

describe("forecastParamsToRegistration", () => {
  it("returns null when required fields are missing", () => {
    expect(forecastParamsToRegistration(new URLSearchParams(""))).toBeNull();
  });

  it("filters overrides to only tracked system names", () => {
    const params = new URLSearchParams("address=1+Main+St&yearBuilt=1990&state=TX&hvac=2010");
    const result = forecastParamsToRegistration(params);
    expect(result).toEqual({ address: "1 Main St", yearBuilt: "1990", state: "TX", systemAges: { HVAC: 2010 } });
  });
});

describe("lookupYearBuilt", () => {
  beforeEach(() => vi.resetModules());

  it("returns null when the underlying aiProxy call throws", async () => {
    vi.doMock("@/services/aiProxy", () => ({
      aiProxyService: { lookupYearBuilt: vi.fn().mockRejectedValue(new Error("network error")) },
    }));
    const { lookupYearBuilt: freshLookup } = await import("@/services/instantForecast");
    const result = await freshLookup("1 Main St");
    expect(result).toBeNull();
  });
});
