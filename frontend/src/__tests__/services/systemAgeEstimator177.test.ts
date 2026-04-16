/**
 * §17.7 — Public System Age Estimator
 *
 * Tests the pure service layer:
 *   - parseEstimatorParams  → parse + validate URL search params
 *   - buildEstimatorUrl     → construct shareable URL from inputs
 *   - estimateSystems       → wrap predictMaintenance, return SystemEstimate[]
 */

import { describe, it, expect } from "vitest";
import {
  parseEstimatorParams,
  buildEstimatorUrl,
  estimateSystems,
  type EstimatorInput,
  type SystemEstimate,
} from "@/services/systemAgeEstimator";

const CURRENT_YEAR = new Date().getFullYear();

// ── parseEstimatorParams ─────────────────────────────────────────────────────

describe("parseEstimatorParams", () => {
  it("returns valid input for required params", () => {
    const p = new URLSearchParams({ yearBuilt: "1998", type: "single-family" });
    const result = parseEstimatorParams(p);
    expect(result).not.toBeNull();
    expect(result!.yearBuilt).toBe(1998);
    expect(result!.propertyType).toBe("single-family");
    expect(result!.state).toBeUndefined();
  });

  it("includes state when provided", () => {
    const p = new URLSearchParams({ yearBuilt: "2005", type: "condo", state: "FL" });
    const result = parseEstimatorParams(p);
    expect(result!.state).toBe("FL");
  });

  it("returns null when yearBuilt is missing", () => {
    const p = new URLSearchParams({ type: "single-family" });
    expect(parseEstimatorParams(p)).toBeNull();
  });

  it("returns null when yearBuilt is not a number", () => {
    const p = new URLSearchParams({ yearBuilt: "abc", type: "single-family" });
    expect(parseEstimatorParams(p)).toBeNull();
  });

  it("returns null when yearBuilt is before 1800", () => {
    const p = new URLSearchParams({ yearBuilt: "1799", type: "single-family" });
    expect(parseEstimatorParams(p)).toBeNull();
  });

  it("returns null when yearBuilt is after current year", () => {
    const p = new URLSearchParams({ yearBuilt: String(CURRENT_YEAR + 1), type: "single-family" });
    expect(parseEstimatorParams(p)).toBeNull();
  });

  it("defaults propertyType to 'single-family' when type param is missing", () => {
    const p = new URLSearchParams({ yearBuilt: "2000" });
    const result = parseEstimatorParams(p);
    expect(result).not.toBeNull();
    expect(result!.propertyType).toBe("single-family");
  });
});

// ── buildEstimatorUrl ────────────────────────────────────────────────────────

describe("buildEstimatorUrl", () => {
  it("includes yearBuilt and type in the URL", () => {
    const url = buildEstimatorUrl({ yearBuilt: 1998, propertyType: "single-family" });
    expect(url).toContain("yearBuilt=1998");
    expect(url).toContain("type=single-family");
  });

  it("omits state param when not provided", () => {
    const url = buildEstimatorUrl({ yearBuilt: 2000, propertyType: "condo" });
    expect(url).not.toContain("state=");
  });

  it("includes state param when provided", () => {
    const url = buildEstimatorUrl({ yearBuilt: 2000, propertyType: "condo", state: "TX" });
    expect(url).toContain("state=TX");
  });

  it("generates a path starting with /home-systems", () => {
    const url = buildEstimatorUrl({ yearBuilt: 1985, propertyType: "single-family" });
    expect(url).toMatch(/\/home-systems/);
  });
});

// ── estimateSystems ──────────────────────────────────────────────────────────

describe("estimateSystems", () => {
  it("returns a prediction for all 8 tracked systems (Solar Panels excluded by default)", () => {
    const estimates = estimateSystems(2000);
    expect(estimates).toHaveLength(8);
    const names = estimates.map((e) => e.systemName);
    expect(names).toContain("HVAC");
    expect(names).toContain("Roofing");
    expect(names).toContain("Water Heater");
    expect(names).toContain("Plumbing");
    expect(names).toContain("Electrical");
  });

  it("sorts results Critical → Soon → Watch → Good", () => {
    const estimates = estimateSystems(1960);
    const urgencyOrder = { Critical: 0, Soon: 1, Watch: 2, Good: 3 };
    for (let i = 0; i < estimates.length - 1; i++) {
      expect(urgencyOrder[estimates[i].urgency]).toBeLessThanOrEqual(
        urgencyOrder[estimates[i + 1].urgency]
      );
    }
  });

  it("yields all 'Good' urgency for a brand-new house", () => {
    const estimates = estimateSystems(CURRENT_YEAR);
    expect(estimates.every((e) => e.urgency === "Good")).toBe(true);
  });

  it("yields Critical or Soon systems for a 1950 house", () => {
    const estimates = estimateSystems(1950);
    const urgent = estimates.filter((e) => e.urgency === "Critical" || e.urgency === "Soon");
    expect(urgent.length).toBeGreaterThan(0);
  });

  it("each estimate has non-negative ageYears", () => {
    const estimates = estimateSystems(2010);
    for (const e of estimates) {
      expect(e.ageYears).toBeGreaterThanOrEqual(0);
    }
  });

  it("each estimate has replacement cost range in dollars", () => {
    const estimates = estimateSystems(2000);
    for (const e of estimates) {
      expect(e.replacementCostLow).toBeGreaterThan(0);
      expect(e.replacementCostHigh).toBeGreaterThanOrEqual(e.replacementCostLow);
    }
  });

  it("applies climate zone — hot-humid (FL) shortens HVAC lifespan vs mixed", () => {
    const flEstimates  = estimateSystems(2000, "FL");
    const mixEstimates = estimateSystems(2000);
    const flHvac   = flEstimates.find((e) => e.systemName === "HVAC")!;
    const mixHvac  = mixEstimates.find((e) => e.systemName === "HVAC")!;
    // FL's hot-humid zone applies a 0.85 multiplier → shorter lifespan → more life used
    expect(flHvac.percentLifeUsed).toBeGreaterThanOrEqual(mixHvac.percentLifeUsed);
  });

  it("installYear equals yearBuilt when no job history provided", () => {
    const yearBuilt = 2010;
    const estimates = estimateSystems(yearBuilt);
    for (const e of estimates) {
      expect(e.installYear).toBe(yearBuilt);
    }
  });

  it("percentLifeUsed is capped above 0 even for brand-new house", () => {
    const estimates = estimateSystems(CURRENT_YEAR);
    for (const e of estimates) {
      expect(e.percentLifeUsed).toBeGreaterThanOrEqual(0);
    }
  });
});
