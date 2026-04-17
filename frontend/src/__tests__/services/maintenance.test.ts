import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { predictMaintenance, maintenanceService, MATERIAL_SPECS, getMaterialMultiplier, getClimateZone } from "@/services/maintenance";
import type { Job } from "@/services/job";

// ─── Fix time so age calculations are deterministic ───────────────────────────

const CURRENT_YEAR = 2026;

beforeAll(() => {
  // Only fake Date — leaving setTimeout/setInterval real so that Vitest's
  // own timeout mechanism and the global afterEach (setup.ts, which awaits
  // a setTimeout(0) to flush React state) continue to work.
  vi.useFakeTimers({ toFake: ["Date"] });
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
  it("returns exactly 8 system predictions by default (Solar Panels excluded unless opted in)", () => {
    expect(predictMaintenance(2000, []).systemPredictions).toHaveLength(8);
  });

  it("returns 9 system predictions when a solar panel age is supplied", () => {
    expect(
      predictMaintenance(2000, [], { "Solar Panels": 2020 }).systemPredictions
    ).toHaveLength(9);
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

// ─── Material-aware forecasting (1.1.6) ──────────────────────────────────────

describe("MATERIAL_SPECS", () => {
  it("covers all material-sensitive systems", () => {
    expect(MATERIAL_SPECS).toHaveProperty("Roofing");
    expect(MATERIAL_SPECS).toHaveProperty("Flooring");
    expect(MATERIAL_SPECS).toHaveProperty("Plumbing");
    expect(MATERIAL_SPECS).toHaveProperty("Windows");
    expect(MATERIAL_SPECS).toHaveProperty("Water Heater");
    expect(MATERIAL_SPECS).toHaveProperty("HVAC");
  });

  it("every entry has a non-empty label and positive multiplier", () => {
    for (const materials of Object.values(MATERIAL_SPECS)) {
      for (const spec of Object.values(materials)) {
        expect(typeof spec.label).toBe("string");
        expect(spec.label.length).toBeGreaterThan(0);
        expect(typeof spec.multiplier).toBe("number");
        expect(spec.multiplier).toBeGreaterThan(0);
      }
    }
  });

  it("metal roof multiplier is 1.6", () => {
    expect(MATERIAL_SPECS["Roofing"]["metal"].multiplier).toBe(1.6);
  });

  it("galvanized pipe multiplier is 0.5", () => {
    expect(MATERIAL_SPECS["Plumbing"]["galvanized"].multiplier).toBe(0.5);
  });
});

describe("getMaterialMultiplier", () => {
  it("returns correct multiplier for a known system + material", () => {
    expect(getMaterialMultiplier("Roofing", "metal")).toBe(1.6);
    expect(getMaterialMultiplier("Plumbing", "galvanized")).toBe(0.5);
    expect(getMaterialMultiplier("HVAC", "boiler")).toBe(1.33);
  });

  it("returns 1.0 for an unknown system", () => {
    expect(getMaterialMultiplier("Garage Door", "steel")).toBe(1.0);
  });

  it("returns 1.0 for an unknown material in a known system", () => {
    expect(getMaterialMultiplier("Roofing", "mystery-material")).toBe(1.0);
  });

  it("returns 1.0 for an empty material key", () => {
    expect(getMaterialMultiplier("HVAC", "")).toBe(1.0);
  });
});

describe("predictMaintenance — material overrides", () => {
  // ── Metal roof: asphalt Critical → Watch ──
  // Roofing baseline 25yr; yearBuilt 2001 → age 25 → pct 100 → Critical (asphalt)
  // Metal 1.6× → effectiveLifespan = round(25*1.6)=40 → pct = round(25/40*100)=63 → Watch
  it("metal roof extends effective lifespan: Critical becomes Watch", () => {
    const plain = predictMaintenance(2001, []).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    expect(plain.urgency).toBe("Critical");

    const withMetal = predictMaintenance(2001, [], {}, undefined, { Roofing: "metal" })
      .systemPredictions.find((s) => s.systemName === "Roofing")!;
    expect(withMetal.urgency).toBe("Watch");
  });

  // ── Galvanized pipes: Watch → Critical ──
  // Plumbing baseline 50yr; yearBuilt 1990 → age 36 → pct 72 → Watch
  // Galvanized 0.5× → effectiveLifespan = round(50*0.5)=25 → pct = round(36/25*100)=144 → Critical
  it("galvanized pipes shorten effective lifespan: Watch becomes Critical", () => {
    const plain = predictMaintenance(1990, []).systemPredictions
      .find((s) => s.systemName === "Plumbing")!;
    expect(plain.urgency).toBe("Watch");

    const withGalvanized = predictMaintenance(1990, [], {}, undefined, { Plumbing: "galvanized" })
      .systemPredictions.find((s) => s.systemName === "Plumbing")!;
    expect(withGalvanized.urgency).toBe("Critical");
  });

  // ── Boiler HVAC: Critical (age 18) → Soon ──
  // HVAC baseline 18yr; age 18 → pct 100 → Critical
  // Boiler 1.33× → effectiveLifespan = round(18*1.33)=24 → pct = round(18/24*100)=75 → Soon
  it("boiler HVAC extends lifespan: Critical (age 18) becomes Soon", () => {
    const withBoiler = predictMaintenance(CURRENT_YEAR - 18, [], {}, undefined, { HVAC: "boiler" })
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(withBoiler.urgency).toBe("Soon");
  });

  // ── Unknown material → no change ──
  it("unknown material key leaves urgency and percentLifeUsed unchanged", () => {
    const baseline = predictMaintenance(2001, []).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    const withUnknown = predictMaintenance(2001, [], {}, undefined, { Roofing: "mystery-material" })
      .systemPredictions.find((s) => s.systemName === "Roofing")!;
    expect(withUnknown.urgency).toBe(baseline.urgency);
    expect(withUnknown.percentLifeUsed).toBe(baseline.percentLifeUsed);
  });

  // ── Climate × material stack ──
  // Cold (MI): HVAC 0.88× → effectiveLifespan = round(18*0.88)=16; age 10 → pct 63 → Watch
  // + heatPump 0.83× → effectiveLifespan = round(18*0.88*0.83)=13; pct = round(10/13*100)=77 → Soon
  it("climate and material multipliers stack multiplicatively", () => {
    const coldOnly = predictMaintenance(CURRENT_YEAR - 10, [], {}, "MI")
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(coldOnly.urgency).toBe("Watch");

    const coldHeatPump = predictMaintenance(CURRENT_YEAR - 10, [], {}, "MI", { HVAC: "heatPump" })
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(coldHeatPump.urgency).toBe("Soon");
  });

  it("SystemPrediction includes materialMultiplier = 1.6 for metal roof", () => {
    const pred = predictMaintenance(2001, [], {}, undefined, { Roofing: "metal" })
      .systemPredictions.find((s) => s.systemName === "Roofing")!;
    expect(pred.materialMultiplier).toBe(1.6);
  });

  it("materialMultiplier defaults to 1.0 when no override given", () => {
    const pred = predictMaintenance(2001, []).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    expect(pred.materialMultiplier).toBe(1.0);
  });

  it("MaintenanceReport includes the materialOverrides passed in", () => {
    const overrides = { Roofing: "metal", Plumbing: "copper" };
    const report = predictMaintenance(2001, [], {}, undefined, overrides);
    expect(report.materialOverrides).toEqual(overrides);
  });

  it("empty materialOverrides produces identical urgencies to no override", () => {
    const baseline = predictMaintenance(2001, []).systemPredictions.map((s) => s.urgency);
    const withEmpty = predictMaintenance(2001, [], {}, undefined, {}).systemPredictions.map((s) => s.urgency);
    expect(withEmpty).toEqual(baseline);
  });
});

// ─── 12.2.7: All 8 systems at exact boundary ages ────────────────────────────
//
// Urgency thresholds: Critical = pct ≥ 100, Soon = pct ≥ 75, Watch = pct ≥ 50
// Lifespans: HVAC=18, Roofing=25, WaterHeater=12, Windows=22,
//            Electrical=35, Plumbing=50, Flooring=25, Insulation=30
//
// 100% boundary: yearBuilt = CURRENT_YEAR - lifespan
// 75% boundary: min age where floor(age/lifespan*100) >= 75  → ceil(0.75 * lifespan)
// 50% boundary: min age where floor(age/lifespan*100) >= 50  → ceil(0.50 * lifespan)

describe("predictMaintenance — exact boundary ages for all 8 systems (12.2.7)", () => {
  // ── 100% (Critical) boundaries ───────────────────────────────────────────
  it("HVAC age=18 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 18, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  it("Roofing age=25 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 25, []).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  it("Water Heater age=12 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 12, []).systemPredictions
      .find((s) => s.systemName === "Water Heater")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  it("Windows age=22 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 22, []).systemPredictions
      .find((s) => s.systemName === "Windows")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  it("Electrical age=35 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 35, []).systemPredictions
      .find((s) => s.systemName === "Electrical")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  it("Plumbing age=50 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 50, []).systemPredictions
      .find((s) => s.systemName === "Plumbing")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  it("Flooring age=25 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 25, []).systemPredictions
      .find((s) => s.systemName === "Flooring")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  it("Insulation age=30 (100%) → Critical", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 30, []).systemPredictions
      .find((s) => s.systemName === "Insulation")!;
    expect(pred.urgency).toBe("Critical");
    expect(pred.percentLifeUsed).toBe(100);
  });

  // ── 75% (Soon) boundaries ────────────────────────────────────────────────
  // ceil(0.75 * lifespan): HVAC→14, Roofing→19, WH→9, Windows→17,
  //   Electrical→27, Plumbing→38, Flooring→19, Insulation→23

  it("HVAC age=14 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 14, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  it("Roofing age=19 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 19, []).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  it("Water Heater age=9 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 9, []).systemPredictions
      .find((s) => s.systemName === "Water Heater")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  it("Windows age=17 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 17, []).systemPredictions
      .find((s) => s.systemName === "Windows")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  it("Electrical age=27 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 27, []).systemPredictions
      .find((s) => s.systemName === "Electrical")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  it("Plumbing age=38 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 38, []).systemPredictions
      .find((s) => s.systemName === "Plumbing")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  it("Flooring age=19 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 19, []).systemPredictions
      .find((s) => s.systemName === "Flooring")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  it("Insulation age=23 (≥75%) → Soon", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 23, []).systemPredictions
      .find((s) => s.systemName === "Insulation")!;
    expect(pred.urgency).toBe("Soon");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(75);
  });

  // ── 50% (Watch) boundaries ───────────────────────────────────────────────
  // ceil(0.50 * lifespan): HVAC→9, Roofing→13, WH→6, Windows→11,
  //   Electrical→18, Plumbing→25, Flooring→13, Insulation→15

  it("HVAC age=9 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 9, []).systemPredictions
      .find((s) => s.systemName === "HVAC")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
    expect(pred.percentLifeUsed).toBeLessThan(75);
  });

  it("Roofing age=13 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 13, []).systemPredictions
      .find((s) => s.systemName === "Roofing")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
  });

  it("Water Heater age=6 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 6, []).systemPredictions
      .find((s) => s.systemName === "Water Heater")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
  });

  it("Windows age=11 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 11, []).systemPredictions
      .find((s) => s.systemName === "Windows")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
  });

  it("Electrical age=18 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 18, []).systemPredictions
      .find((s) => s.systemName === "Electrical")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
    expect(pred.percentLifeUsed).toBeLessThan(75);
  });

  it("Plumbing age=25 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 25, []).systemPredictions
      .find((s) => s.systemName === "Plumbing")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
  });

  it("Flooring age=13 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 13, []).systemPredictions
      .find((s) => s.systemName === "Flooring")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
  });

  it("Insulation age=15 (≥50%, <75%) → Watch", () => {
    const pred = predictMaintenance(CURRENT_YEAR - 15, []).systemPredictions
      .find((s) => s.systemName === "Insulation")!;
    expect(pred.urgency).toBe("Watch");
    expect(pred.percentLifeUsed).toBeGreaterThanOrEqual(50);
  });
});

// ─── 12.2.7: getClimateZone() direct tests ───────────────────────────────────

describe("getClimateZone — state → zone mapping (12.2.7)", () => {
  it("FL → hotHumid", () => {
    expect(getClimateZone("FL").id).toBe("hotHumid");
  });

  it("AZ → hotDry", () => {
    expect(getClimateZone("AZ").id).toBe("hotDry");
  });

  it("MN → veryCold", () => {
    expect(getClimateZone("MN").id).toBe("veryCold");
  });

  it("MI → cold", () => {
    expect(getClimateZone("MI").id).toBe("cold");
  });

  it("CA → mixed", () => {
    expect(getClimateZone("CA").id).toBe("mixed");
  });

  it("TX → mixed", () => {
    expect(getClimateZone("TX").id).toBe("mixed");
  });

  it("case-insensitive: 'fl' → hotHumid", () => {
    expect(getClimateZone("fl").id).toBe("hotHumid");
  });

  it("unknown state → mixed", () => {
    expect(getClimateZone("ZZ").id).toBe("mixed");
  });

  it("returns a zone with a non-empty name and description", () => {
    const zone = getClimateZone("FL");
    expect(zone.name.length).toBeGreaterThan(0);
    expect(zone.description.length).toBeGreaterThan(0);
  });

  it("mixed zone has empty lifespanMultipliers (no adjustment)", () => {
    const zone = getClimateZone("CA");
    expect(Object.keys(zone.lifespanMultipliers)).toHaveLength(0);
  });
});

// ─── 12.2.7: Climate zone effects on system lifespans ────────────────────────
//
// Strategy: pick a yearBuilt where the system is "Good" in mixed zone,
// then verify it degrades to Watch/Soon/Critical in harsh zones.

describe("predictMaintenance — climate zone lifespan effects (12.2.7)", () => {
  // ── hotHumid (FL): HVAC, Roofing, Water Heater, Windows, Insulation ──────
  // HVAC: baseline 18yr. Age=12 → pct=67→Watch in mixed.
  // hotHumid 0.85× → effectiveLifespan=round(18*0.85)=15 → pct=round(12/15*100)=80 → Soon
  it("hotHumid (FL): HVAC degrades faster — age 12 is Soon, not Watch", () => {
    const mixed = predictMaintenance(CURRENT_YEAR - 12, [], {}, "CA")
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(mixed.urgency).toBe("Watch");

    const hot = predictMaintenance(CURRENT_YEAR - 12, [], {}, "FL")
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(hot.urgency).toBe("Soon");
  });

  // Roofing: baseline 25yr. Age=17 → pct=68→Watch in mixed.
  // hotHumid 0.88× → effectiveLifespan=round(25*0.88)=22 → pct=round(17/22*100)=77 → Soon
  it("hotHumid (FL): Roofing degrades faster — age 17 is Soon, not Watch", () => {
    const mixed = predictMaintenance(CURRENT_YEAR - 17, [], {}, "CA")
      .systemPredictions.find((s) => s.systemName === "Roofing")!;
    expect(mixed.urgency).toBe("Watch");

    const hot = predictMaintenance(CURRENT_YEAR - 17, [], {}, "FL")
      .systemPredictions.find((s) => s.systemName === "Roofing")!;
    expect(hot.urgency).toBe("Soon");
  });

  // Water Heater: baseline 12yr. Age=8 → pct=67→Watch in mixed.
  // hotHumid 0.90× → effectiveLifespan=round(12*0.90)=11 → pct=round(8/11*100)=73 → Watch (still)
  // Use age=9: pct=round(9/11*100)=82 → Soon
  it("hotHumid (FL): Water Heater — age 9 is Soon", () => {
    const hot = predictMaintenance(CURRENT_YEAR - 9, [], {}, "FL")
      .systemPredictions.find((s) => s.systemName === "Water Heater")!;
    expect(hot.urgency).toBe("Soon");
  });

  // Insulation: baseline 30yr. Age=20 → pct=67→Watch in mixed.
  // hotHumid 0.85× → effectiveLifespan=round(30*0.85)=26 → pct=round(20/26*100)=77 → Soon
  it("hotHumid (FL): Insulation degrades faster — age 20 is Soon, not Watch", () => {
    const mixed = predictMaintenance(CURRENT_YEAR - 20, [], {}, "CA")
      .systemPredictions.find((s) => s.systemName === "Insulation")!;
    expect(mixed.urgency).toBe("Watch");

    const hot = predictMaintenance(CURRENT_YEAR - 20, [], {}, "FL")
      .systemPredictions.find((s) => s.systemName === "Insulation")!;
    expect(hot.urgency).toBe("Soon");
  });

  // ── hotDry (AZ): HVAC, Roofing, Windows, Plumbing ──────────────────────
  // HVAC: hotDry 0.90× → effectiveLifespan=round(18*0.90)=16
  // Age=12 mixed → Watch. Age=12 hotDry: pct=round(12/16*100)=75 → Soon
  it("hotDry (AZ): HVAC degrades faster — age 12 is Soon", () => {
    const az = predictMaintenance(CURRENT_YEAR - 12, [], {}, "AZ")
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(az.urgency).toBe("Soon");
  });

  // Plumbing: hotDry 0.90× → effectiveLifespan=round(50*0.90)=45
  // Age=25 mixed → pct=50→Watch. hotDry: pct=round(25/45*100)=56 → still Watch
  // Age=34 mixed: pct=round(34/50*100)=68→Watch. hotDry: pct=round(34/45*100)=76→Soon
  it("hotDry (AZ): Plumbing degrades faster — age 34 is Soon, not Watch", () => {
    const mixed = predictMaintenance(CURRENT_YEAR - 34, [], {}, "CA")
      .systemPredictions.find((s) => s.systemName === "Plumbing")!;
    expect(mixed.urgency).toBe("Watch");

    const az = predictMaintenance(CURRENT_YEAR - 34, [], {}, "AZ")
      .systemPredictions.find((s) => s.systemName === "Plumbing")!;
    expect(az.urgency).toBe("Soon");
  });

  // ── veryCold (MN): most severe — Roofing, Plumbing, HVAC, Windows, Insulation ──
  // HVAC: veryCold 0.83× → effectiveLifespan=round(18*0.83)=15
  // Age=12 mixed → Watch. veryCold: pct=round(12/15*100)=80 → Soon
  it("veryCold (MN): HVAC degrades faster than cold or mixed — age 12 is Soon", () => {
    const mn = predictMaintenance(CURRENT_YEAR - 12, [], {}, "MN")
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    expect(mn.urgency).toBe("Soon");
  });

  // Roofing: veryCold 0.82× → effectiveLifespan=round(25*0.82)=21
  // Age=16 mixed: pct=round(16/25*100)=64→Watch. veryCold: pct=round(16/21*100)=76→Soon
  it("veryCold (MN): Roofing degrades faster — age 16 is Soon, not Watch", () => {
    const mixed = predictMaintenance(CURRENT_YEAR - 16, [], {}, "CA")
      .systemPredictions.find((s) => s.systemName === "Roofing")!;
    expect(mixed.urgency).toBe("Watch");

    const mn = predictMaintenance(CURRENT_YEAR - 16, [], {}, "MN")
      .systemPredictions.find((s) => s.systemName === "Roofing")!;
    expect(mn.urgency).toBe("Soon");
  });

  // Plumbing: veryCold 0.83× → effectiveLifespan=round(50*0.83)=42
  // Age=32 mixed: pct=64→Watch. veryCold: pct=round(32/42*100)=76→Soon
  it("veryCold (MN): Plumbing degrades faster — age 32 is Soon, not Watch", () => {
    const mixed = predictMaintenance(CURRENT_YEAR - 32, [], {}, "CA")
      .systemPredictions.find((s) => s.systemName === "Plumbing")!;
    expect(mixed.urgency).toBe("Watch");

    const mn = predictMaintenance(CURRENT_YEAR - 32, [], {}, "MN")
      .systemPredictions.find((s) => s.systemName === "Plumbing")!;
    expect(mn.urgency).toBe("Soon");
  });

  // veryCold produces harsher urgencies than cold for the same system+age
  it("veryCold (MN) is harsher than cold (MI) for HVAC at same age", () => {
    const age = 14;
    const cold = predictMaintenance(CURRENT_YEAR - age, [], {}, "MI")
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    const veryCold = predictMaintenance(CURRENT_YEAR - age, [], {}, "MN")
      .systemPredictions.find((s) => s.systemName === "HVAC")!;
    // At age 14: cold 0.88× → effectiveLifespan=round(18*0.88)=16 → pct=round(14/16*100)=88 → Soon
    // veryCold 0.83× → effectiveLifespan=round(18*0.83)=15 → pct=round(14/15*100)=93 → Soon
    // Both Soon but veryCold has higher percentLifeUsed
    expect(veryCold.percentLifeUsed).toBeGreaterThanOrEqual(cold.percentLifeUsed);
  });

  // ── mixed zone: no change from baseline ─────────────────────────────────
  it("mixed zone (CA/TX) produces identical urgencies to no-state call", () => {
    const noState = predictMaintenance(CURRENT_YEAR - 10, []).systemPredictions
      .map((s) => ({ name: s.systemName, urgency: s.urgency, pct: s.percentLifeUsed }));
    const mixed = predictMaintenance(CURRENT_YEAR - 10, [], {}, "CA").systemPredictions
      .map((s) => ({ name: s.systemName, urgency: s.urgency, pct: s.percentLifeUsed }));
    expect(mixed).toEqual(noState);
  });

  // climateZone field in the report matches the state passed in
  it("report.climateZone reflects the state passed", () => {
    const report = predictMaintenance(CURRENT_YEAR - 10, [], {}, "FL");
    expect(report.climateZone.id).toBe("hotHumid");
  });

  it("report.climateZone is 'mixed' when no state given", () => {
    const report = predictMaintenance(CURRENT_YEAR - 10, []);
    expect(report.climateZone.id).toBe("mixed");
  });
});
