import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { predictMaintenance, maintenanceService } from "@/services/maintenance";
import type { Job } from "@/services/job";

// ─── Fix time so age calculations are deterministic ───────────────────────────

const CURRENT_YEAR = 2026;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${CURRENT_YEAR}-06-15`));
});

afterAll(() => {
  vi.useRealTimers();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(serviceType: string, dateStr: string, overrides: Partial<Job> = {}): Job {
  return {
    id:               "j1",
    propertyId:       "p1",
    homeowner:        "test-principal",
    serviceType,
    amount:           100_000,
    date:             dateStr,
    description:      "test job",
    isDiy:            false,
    status:           "verified",
    verified:         true,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    ...overrides,
  };
}

// ─── Output shape ─────────────────────────────────────────────────────────────

describe("predictMaintenance — output shape", () => {
  it("returns exactly 9 system predictions", () => {
    expect(predictMaintenance(2000, []).systemPredictions).toHaveLength(9);
  });

  it("returns all expected system names", () => {
    const names = predictMaintenance(2000, []).systemPredictions.map((s) => s.systemName);
    expect(names).toContain("HVAC");
    expect(names).toContain("Roofing");
    expect(names).toContain("Water Heater");
    expect(names).toContain("Windows");
    expect(names).toContain("Electrical");
    expect(names).toContain("Plumbing");
    expect(names).toContain("Flooring");
    expect(names).toContain("Insulation");
  });

  it("returns non-empty annualTasks", () => {
    expect(predictMaintenance(2000, []).annualTasks.length).toBeGreaterThan(0);
  });

  it("sets generatedAt to approximately now", () => {
    const before = Date.now();
    const { generatedAt } = predictMaintenance(2000, []);
    expect(generatedAt).toBeGreaterThanOrEqual(before);
    expect(generatedAt).toBeLessThanOrEqual(Date.now());
  });
});

// ─── Urgency thresholds ───────────────────────────────────────────────────────

// HVAC lifespan = 18 yr
// Water Heater lifespan = 12 yr

describe("predictMaintenance — urgency thresholds", () => {
  it("Critical when percentLifeUsed = 100 (HVAC age 18)", () => {
    // age = CURRENT_YEAR - (CURRENT_YEAR - 18) = 18 → pctUsed = Math.round(18/18*100) = 100
    const hvac = predictMaintenance(CURRENT_YEAR - 18, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.percentLifeUsed).toBe(100);
    expect(hvac.urgency).toBe("Critical");
  });

  it("Critical when percentLifeUsed > 100 (HVAC age 22)", () => {
    // age = 22 → pctUsed = Math.round(22/18*100) = 122 → Critical
    const hvac = predictMaintenance(CURRENT_YEAR - 22, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.percentLifeUsed).toBeGreaterThan(100);
    expect(hvac.urgency).toBe("Critical");
  });

  it("Soon when percentLifeUsed >= 75 and < 100 (HVAC age 14)", () => {
    // age = 14 → pctUsed = Math.round(14/18*100) = 78
    const hvac = predictMaintenance(CURRENT_YEAR - 14, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.percentLifeUsed).toBeGreaterThanOrEqual(75);
    expect(hvac.percentLifeUsed).toBeLessThan(100);
    expect(hvac.urgency).toBe("Soon");
  });

  it("Soon at exactly 75% boundary (Water Heater age 9)", () => {
    // age = 9 → pctUsed = Math.round(9/12*100) = 75 → Soon
    const wh = predictMaintenance(CURRENT_YEAR - 9, []).systemPredictions
      .find((s) => s.systemName === "Water Heater")!;
    expect(wh.percentLifeUsed).toBe(75);
    expect(wh.urgency).toBe("Soon");
  });

  it("Watch when percentLifeUsed >= 50 and < 75 (HVAC age 9)", () => {
    // age = 9 → pctUsed = Math.round(9/18*100) = 50 → Watch
    const hvac = predictMaintenance(CURRENT_YEAR - 9, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.percentLifeUsed).toBe(50);
    expect(hvac.urgency).toBe("Watch");
  });

  it("Good when percentLifeUsed < 50 (HVAC age 8)", () => {
    // age = 8 → pctUsed = Math.round(8/18*100) = 44 → Good
    const hvac = predictMaintenance(CURRENT_YEAR - 8, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.percentLifeUsed).toBeLessThan(50);
    expect(hvac.urgency).toBe("Good");
  });

  it("all Good for a brand-new property", () => {
    const urgencies = predictMaintenance(CURRENT_YEAR, []).systemPredictions.map((s) => s.urgency);
    expect(urgencies.every((u) => u === "Good")).toBe(true);
  });
});

// ─── yearsRemaining ───────────────────────────────────────────────────────────

describe("predictMaintenance — yearsRemaining", () => {
  it("positive when within lifespan (HVAC age 8 → 10 remaining)", () => {
    // lifespan=18, age=8 → remaining = 18-8 = 10
    const hvac = predictMaintenance(CURRENT_YEAR - 8, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.yearsRemaining).toBe(10);
  });

  it("zero when exactly at lifespan end", () => {
    // age=18 → remaining = 18-18 = 0
    const hvac = predictMaintenance(CURRENT_YEAR - 18, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.yearsRemaining).toBe(0);
  });

  it("negative when past lifespan (HVAC age 22 → -4 remaining)", () => {
    // age=22 → remaining = 18-22 = -4
    const hvac = predictMaintenance(CURRENT_YEAR - 22, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.yearsRemaining).toBe(-4);
  });
});

// ─── systemInstallYears override ─────────────────────────────────────────────

describe("predictMaintenance — systemInstallYears override", () => {
  it("uses override year instead of yearBuilt for the specified system", () => {
    // Property built 2000, but HVAC replaced 2020 → age=6 → Good
    const hvac = predictMaintenance(2000, [], { HVAC: 2020 }).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.lastServiceYear).toBe(2020);
    // pctUsed = Math.round(6/18*100) = 33 → Good
    expect(hvac.urgency).toBe("Good");
  });

  it("does not affect systems not listed in the override", () => {
    // Roofing lifespan 25yr; age = 2026-2000 = 26 → pctUsed = Math.round(26/25*100) = 104 → Critical
    const roofing = predictMaintenance(2000, [], { HVAC: 2020 }).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    expect(roofing.lastServiceYear).toBe(2000);
    expect(roofing.urgency).toBe("Critical");
  });

  it("a job can advance the baseline beyond the override", () => {
    // Override HVAC to 2018, but there's a 2022 job → baseline becomes 2022
    const jobs = [makeJob("HVAC", "2022-05-01")];
    const hvac = predictMaintenance(2000, jobs, { HVAC: 2018 }).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.lastServiceYear).toBe(2022);
  });
});

// ─── Job history advances baseline ───────────────────────────────────────────

describe("predictMaintenance — job history", () => {
  it("advances lastServiceYear when a matching job is newer than yearBuilt", () => {
    const jobs = [makeJob("HVAC", "2020-05-01")];
    const hvac = predictMaintenance(2000, jobs).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.lastServiceYear).toBe(2020);
  });

  it("does not go backward — ignores jobs older than yearBuilt", () => {
    const jobs = [makeJob("HVAC", "1990-01-01")];
    const hvac = predictMaintenance(2000, jobs).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.lastServiceYear).toBe(2000);
  });

  it("uses the most recent of multiple matching jobs", () => {
    const jobs = [
      makeJob("HVAC", "2015-01-01"),
      makeJob("HVAC", "2022-06-01"),
      makeJob("HVAC", "2018-03-01"),
    ];
    const hvac = predictMaintenance(2000, jobs).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.lastServiceYear).toBe(2022);
  });

  it("a job for one system does not affect another", () => {
    const jobs = [makeJob("HVAC", "2022-01-01")];
    const roofing = predictMaintenance(2000, jobs).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    expect(roofing.lastServiceYear).toBe(2000);
  });
});

// ─── Budget accumulation ──────────────────────────────────────────────────────

describe("predictMaintenance — budget", () => {
  it("budget is 0 when all systems are Good", () => {
    const { totalBudgetLowCents, totalBudgetHighCents } = predictMaintenance(CURRENT_YEAR, []);
    expect(totalBudgetLowCents).toBe(0);
    expect(totalBudgetHighCents).toBe(0);
  });

  it("budget totals only Critical and Soon systems", () => {
    const report = predictMaintenance(1990, []);
    const criticalOrSoon = report.systemPredictions.filter(
      (s) => s.urgency === "Critical" || s.urgency === "Soon"
    );
    const expectedLow  = criticalOrSoon.reduce((sum, s) => sum + s.estimatedCostLowCents,  0);
    const expectedHigh = criticalOrSoon.reduce((sum, s) => sum + s.estimatedCostHighCents, 0);
    expect(report.totalBudgetLowCents).toBe(expectedLow);
    expect(report.totalBudgetHighCents).toBe(expectedHigh);
    // Sanity: at least one Critical system with a 36-year-old property
    expect(criticalOrSoon.length).toBeGreaterThan(0);
  });

  it("Watch and Good systems contribute 0 to budget", () => {
    // Build a property where only HVAC is Critical (age 18), everything else is Good
    // Use systemInstallYears to make every other system very young
    const now = CURRENT_YEAR;
    const report = predictMaintenance(now - 18, [], {
      Roofing:       now,
      "Water Heater": now,
      Windows:       now,
      Electrical:    now,
      Plumbing:      now,
      Flooring:      now,
      Insulation:    now,
    });
    // Only HVAC (Critical) should count
    const hvac = report.systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(hvac.urgency).toBe("Critical");
    expect(report.totalBudgetLowCents).toBe(hvac.estimatedCostLowCents);
    expect(report.totalBudgetHighCents).toBe(hvac.estimatedCostHighCents);
  });
});

// ─── Sort order ───────────────────────────────────────────────────────────────

describe("predictMaintenance — sort order", () => {
  it("Critical items precede Soon, Soon precedes Watch, Watch precedes Good", () => {
    const RANK: Record<string, number> = { Critical: 0, Soon: 1, Watch: 2, Good: 3 };
    const urgencies = predictMaintenance(1990, []).systemPredictions.map((s) => s.urgency);
    for (let i = 1; i < urgencies.length; i++) {
      expect(RANK[urgencies[i]]).toBeGreaterThanOrEqual(RANK[urgencies[i - 1]]);
    }
  });
});

// ─── diyViable ────────────────────────────────────────────────────────────────

describe("predictMaintenance — diyViable", () => {
  it("Flooring is diyViable", () => {
    const flooring = predictMaintenance(2000, []).systemPredictions
      .find((s) => s.systemName === "Flooring")!;
    expect(flooring.diyViable).toBe(true);
  });

  it("Insulation is diyViable", () => {
    const insulation = predictMaintenance(2000, []).systemPredictions
      .find((s) => s.systemName === "Insulation")!;
    expect(insulation.diyViable).toBe(true);
  });

  it("HVAC is not diyViable", () => {
    const hvac = predictMaintenance(2000, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(hvac.diyViable).toBe(false);
  });
});

// ─── maintenanceService helpers ───────────────────────────────────────────────

describe("maintenanceService.formatCents", () => {
  it("formats whole dollar amounts", () => {
    expect(maintenanceService.formatCents(120_000)).toBe("$1,200");
  });

  it("formats zero", () => {
    expect(maintenanceService.formatCents(0)).toBe("$0");
  });

  it("rounds sub-cent values", () => {
    expect(maintenanceService.formatCents(100)).toBe("$1");
  });

  it("formats large amounts with commas", () => {
    expect(maintenanceService.formatCents(1_500_000)).toBe("$15,000");
  });
});

describe("maintenanceService.urgencyColor", () => {
  it("Critical → red", () => {
    expect(maintenanceService.urgencyColor("Critical")).toBe("#dc2626");
  });

  it("Soon → amber", () => {
    expect(maintenanceService.urgencyColor("Soon")).toBe("#d97706");
  });

  it("Watch → blue", () => {
    expect(maintenanceService.urgencyColor("Watch")).toBe("#2563eb");
  });

  it("Good → green", () => {
    expect(maintenanceService.urgencyColor("Good")).toBe("#16a34a");
  });
});

describe("maintenanceService.urgencyBg", () => {
  it("Critical → light red background", () => {
    expect(maintenanceService.urgencyBg("Critical")).toBe("#fef2f2");
  });

  it("Soon → light amber background", () => {
    expect(maintenanceService.urgencyBg("Soon")).toBe("#fffbeb");
  });

  it("Watch → light blue background", () => {
    expect(maintenanceService.urgencyBg("Watch")).toBe("#eff6ff");
  });

  it("Good → light green background", () => {
    expect(maintenanceService.urgencyBg("Good")).toBe("#f0fdf4");
  });
});
