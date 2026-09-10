/**
 * §17.2 — Zero-Effort Onboarding: Instant Forecast
 *
 * Tests:
 *   17.2.2 — computeTenYearBudget: sum replacement costs for systems due ≤10 yrs
 *   17.2.2 — per-system override: estimateSystems with overrides corrects install year
 *   17.2.4 — lookupYearBuilt: ai_proxy canister stub, returns null gracefully
 *   URL helpers: parseForecastParams, buildForecastUrl (round-trip + override params)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  computeTenYearBudget,
  parseForecastParams,
  buildForecastUrl,
  lookupYearBuilt,
} from "@/services/instantForecast";

vi.mock("@/services/aiProxy", () => ({
  aiProxyService: {
    lookupYearBuilt: vi.fn(),
  },
}));

import { aiProxyService } from "@/services/aiProxy";
import {
  estimateSystems,
  parseEstimatorParams,
  buildEstimatorUrl,
  type SystemEstimate,
} from "@/services/systemAgeEstimator";

const CURRENT_YEAR = new Date().getFullYear();

// ── Per-system override gap fix (feeds both 17.7 and 17.2) ───────────────────

describe("estimateSystems — per-system overrides", () => {
  it("uses yearBuilt for all systems when no overrides provided", () => {
    const estimates = estimateSystems(1976);
    for (const e of estimates) {
      expect(e.installYear).toBe(1976);
    }
  });

  it("uses override year for the overridden system's installYear", () => {
    const estimates = estimateSystems(1976, undefined, { HVAC: 2000 });
    const hvac = estimates.find((e) => e.systemName === "HVAC")!;
    expect(hvac.installYear).toBe(2000);
  });

  it("uses yearBuilt for non-overridden systems when some overrides provided", () => {
    const estimates = estimateSystems(1976, undefined, { HVAC: 2000 });
    const roofing = estimates.find((e) => e.systemName === "Roofing")!;
    expect(roofing.installYear).toBe(1976);
  });

  it("overridden system has correct ageYears based on override year", () => {
    const estimates = estimateSystems(1976, undefined, { HVAC: 2010 });
    const hvac = estimates.find((e) => e.systemName === "HVAC")!;
    expect(hvac.ageYears).toBe(CURRENT_YEAR - 2010);
  });

  it("overridden system is less urgent than same system using original yearBuilt", () => {
    const withoutOverride = estimateSystems(1976);
    const withOverride    = estimateSystems(1976, undefined, { HVAC: CURRENT_YEAR - 5 });

    const hvacOld = withoutOverride.find((e) => e.systemName === "HVAC")!;
    const hvacNew = withOverride.find((e)    => e.systemName === "HVAC")!;

    const urgencyRank = { Critical: 0, Soon: 1, Watch: 2, Good: 3 };
    expect(urgencyRank[hvacNew.urgency]).toBeGreaterThan(urgencyRank[hvacOld.urgency]);
  });

  it("multiple overrides are each applied to their respective system", () => {
    const overrides = { HVAC: 2010, Roofing: 2015 };
    const estimates = estimateSystems(1976, undefined, overrides);
    expect(estimates.find((e) => e.systemName === "HVAC")!.installYear).toBe(2010);
    expect(estimates.find((e) => e.systemName === "Roofing")!.installYear).toBe(2015);
    expect(estimates.find((e) => e.systemName === "Plumbing")!.installYear).toBe(1976);
  });

  it("ignores an override year after current year", () => {
    const estimates = estimateSystems(1990, undefined, { HVAC: CURRENT_YEAR + 5 });
    const hvac = estimates.find((e) => e.systemName === "HVAC")!;
    expect(hvac.installYear).toBe(1990); // invalid override ignored
  });

  it("ignores an override year before yearBuilt", () => {
    const estimates = estimateSystems(1990, undefined, { HVAC: 1950 });
    const hvac = estimates.find((e) => e.systemName === "HVAC")!;
    expect(hvac.installYear).toBe(1990); // can't be replaced before house was built
  });
});

// ── parseEstimatorParams — override URL params ────────────────────────────────

describe("parseEstimatorParams — system override params", () => {
  it("parses hvac override year from URL", () => {
    const p = new URLSearchParams({ yearBuilt: "1976", hvac: "2000" });
    const result = parseEstimatorParams(p);
    expect(result?.systemOverrides?.HVAC).toBe(2000);
  });

  it("parses roofing override year from URL", () => {
    const p = new URLSearchParams({ yearBuilt: "1976", roofing: "2015" });
    const result = parseEstimatorParams(p);
    expect(result?.systemOverrides?.Roofing).toBe(2015);
  });

  it("parses water_heater override from URL", () => {
    const p = new URLSearchParams({ yearBuilt: "1976", water_heater: "2018" });
    const result = parseEstimatorParams(p);
    expect(result?.systemOverrides?.["Water Heater"]).toBe(2018);
  });

  it("ignores override values that are not valid years", () => {
    const p = new URLSearchParams({ yearBuilt: "1976", hvac: "abc" });
    const result = parseEstimatorParams(p);
    expect(result?.systemOverrides?.HVAC).toBeUndefined();
  });

  it("returns empty systemOverrides when no overrides in URL", () => {
    const p = new URLSearchParams({ yearBuilt: "1990" });
    const result = parseEstimatorParams(p);
    expect(result?.systemOverrides).toEqual({});
  });
});

// ── buildEstimatorUrl — override params ──────────────────────────────────────

describe("buildEstimatorUrl — system override params", () => {
  it("includes hvac override in URL", () => {
    const url = buildEstimatorUrl({ yearBuilt: 1976, propertyType: "single-family", systemOverrides: { HVAC: 2000 } });
    expect(url).toContain("hvac=2000");
  });

  it("includes roofing override in URL", () => {
    const url = buildEstimatorUrl({ yearBuilt: 1976, propertyType: "single-family", systemOverrides: { Roofing: 2015 } });
    expect(url).toContain("roofing=2015");
  });

  it("omits override params when systemOverrides is empty", () => {
    const url = buildEstimatorUrl({ yearBuilt: 1990, propertyType: "single-family", systemOverrides: {} });
    expect(url).not.toContain("hvac=");
    expect(url).not.toContain("roofing=");
  });

  it("round-trips: build then parse preserves overrides", () => {
    const input = { yearBuilt: 1976, propertyType: "single-family", systemOverrides: { HVAC: 2000, Roofing: 2015 } };
    const url    = buildEstimatorUrl(input);
    const params = new URLSearchParams(url.split("?")[1]);
    const parsed = parseEstimatorParams(params);
    expect(parsed?.systemOverrides?.HVAC).toBe(2000);
    expect(parsed?.systemOverrides?.Roofing).toBe(2015);
  });
});

// ── computeTenYearBudget (17.2.2) ─────────────────────────────────────────────

describe("computeTenYearBudget", () => {
  it("sums replacementCostLow for systems due within 10 years", () => {
    const estimates: SystemEstimate[] = [
      { systemName: "HVAC",    installYear: 2000, ageYears: 24, lifespanYears: 20, percentLifeUsed: 120, yearsRemaining: -4,  urgency: "Critical", replacementCostLow: 5000,  replacementCostHigh: 12000 },
      { systemName: "Roofing", installYear: 2010, ageYears: 14, lifespanYears: 20, percentLifeUsed: 70,  yearsRemaining: 6,   urgency: "Soon",     replacementCostLow: 8000,  replacementCostHigh: 20000 },
      { systemName: "Plumbing",installYear: 2015, ageYears: 9,  lifespanYears: 40, percentLifeUsed: 22,  yearsRemaining: 31,  urgency: "Good",     replacementCostLow: 3000,  replacementCostHigh: 8000  },
    ];
    // HVAC (Critical, -4 yrs remaining) + Roofing (6 yrs) = $13,000
    expect(computeTenYearBudget(estimates)).toBe(13_000);
  });

  it("excludes systems with more than 10 years remaining", () => {
    const estimates: SystemEstimate[] = [
      { systemName: "Electrical", installYear: 2010, ageYears: 14, lifespanYears: 40, percentLifeUsed: 35, yearsRemaining: 26, urgency: "Good", replacementCostLow: 4000, replacementCostHigh: 10000 },
    ];
    expect(computeTenYearBudget(estimates)).toBe(0);
  });

  it("returns 0 for an empty estimates array", () => {
    expect(computeTenYearBudget([])).toBe(0);
  });

  it("includes systems at exactly 10 years remaining", () => {
    const estimates: SystemEstimate[] = [
      { systemName: "HVAC", installYear: 2004, ageYears: 20, lifespanYears: 15, percentLifeUsed: 133, yearsRemaining: 10, urgency: "Soon", replacementCostLow: 6000, replacementCostHigh: 15000 },
    ];
    expect(computeTenYearBudget(estimates)).toBe(6000);
  });
});

// ── parseForecastParams (17.2.2) ──────────────────────────────────────────────

describe("parseForecastParams", () => {
  it("parses address, yearBuilt, and state from URL params", () => {
    const p = new URLSearchParams({ address: "123 Main St", yearBuilt: "1976", state: "FL" });
    const result = parseForecastParams(p);
    expect(result?.address).toBe("123 Main St");
    expect(result?.yearBuilt).toBe(1976);
    expect(result?.state).toBe("FL");
  });

  it("returns null when yearBuilt is missing", () => {
    const p = new URLSearchParams({ address: "123 Main St" });
    expect(parseForecastParams(p)).toBeNull();
  });

  it("returns null when address is missing", () => {
    const p = new URLSearchParams({ yearBuilt: "1976" });
    expect(parseForecastParams(p)).toBeNull();
  });

  it("parses system overrides from URL", () => {
    const p = new URLSearchParams({ address: "123 Main St", yearBuilt: "1976", hvac: "2000" });
    const result = parseForecastParams(p);
    expect(result?.systemOverrides?.HVAC).toBe(2000);
  });
});

// ── buildForecastUrl (17.2.2) ─────────────────────────────────────────────────

describe("buildForecastUrl", () => {
  it("builds /instant-forecast URL with address and yearBuilt", () => {
    const url = buildForecastUrl({ address: "123 Main St", yearBuilt: 1976 });
    expect(url).toContain("/instant-forecast");
    expect(url).toContain("address=");
    expect(url).toContain("yearBuilt=1976");
  });

  it("includes state when provided", () => {
    const url = buildForecastUrl({ address: "123 Main St", yearBuilt: 1976, state: "FL" });
    expect(url).toContain("state=FL");
  });

  it("includes override params when provided", () => {
    const url = buildForecastUrl({ address: "123 Main St", yearBuilt: 1976, systemOverrides: { HVAC: 2000 } });
    expect(url).toContain("hvac=2000");
  });

  it("round-trips address through URL encoding", () => {
    const url = buildForecastUrl({ address: "123 Main St, Daytona Beach, FL", yearBuilt: 1976 });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("address")).toBe("123 Main St, Daytona Beach, FL");
  });
});

// ── lookupYearBuilt stub (17.2.4) ─────────────────────────────────────────────

describe("lookupYearBuilt", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("calls aiProxyService.lookupYearBuilt with the address", async () => {
    vi.mocked(aiProxyService.lookupYearBuilt).mockResolvedValueOnce({
      address: "123 Main St", yearBuilt: null,
    });

    await lookupYearBuilt("123 Main St");
    expect(aiProxyService.lookupYearBuilt).toHaveBeenCalledWith("123 Main St");
  });

  it("returns null when canister returns yearBuilt: null (stub response)", async () => {
    vi.mocked(aiProxyService.lookupYearBuilt).mockResolvedValueOnce({
      address: "123 Main St", yearBuilt: null,
    });
    expect(await lookupYearBuilt("123 Main St")).toBeNull();
  });

  it("returns null on canister error (does not throw)", async () => {
    vi.mocked(aiProxyService.lookupYearBuilt).mockRejectedValueOnce(new Error("canister error"));
    expect(await lookupYearBuilt("123 Main St")).toBeNull();
  });

  it("returns the year when canister has data", async () => {
    vi.mocked(aiProxyService.lookupYearBuilt).mockResolvedValueOnce({
      address: "456 Oak Ave", yearBuilt: 1988,
    });
    expect(await lookupYearBuilt("456 Oak Ave")).toBe(1988);
  });
});
