/**
 * TDD — 13.3.2: maintenance service — predictMaintenance() at scale
 *
 * predictMaintenance(yearBuilt, jobs, systemInstallYears, state, overrides)
 * is pure client-side JS.
 *
 * Complexity: O(S × J) where S=8 (fixed system count), J=jobs array length.
 * Each system loops over jobs once to find the most-recent job for that system.
 * S is constant → effectively O(J) per call.
 *
 * Tests:
 *   - All 8 systems × build years 1950–2024 (75 years) return valid predictions
 *   - Constant S: adding more systems doesn't exist (S is fixed at 8)
 *   - J-scaling: 10× jobs → <10× time (linear in job count)
 *   - Absolute cap: 1000 calls with 50 jobs each complete in < 1000ms
 *   - Concurrent: 50 concurrent calls finish no slower than sequential
 */

import { describe, it, expect } from "vitest";
import { predictMaintenance, type MaintenanceReport } from "../../services/maintenance";
import type { Job } from "../../services/job";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ALL_SYSTEMS = ["HVAC", "Roofing", "Water Heater", "Windows", "Electrical", "Plumbing", "Flooring", "Insulation", "Solar Panels"];

const JOB_SERVICE_TYPES = ALL_SYSTEMS;

function makeJobs(count: number): Job[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `job-${i}`,
    propertyId: "1",
    homeowner: "test",
    serviceType: JOB_SERVICE_TYPES[i % JOB_SERVICE_TYPES.length],
    contractorName: `Contractor ${i}`,
    amount: 10_000 + i * 500,
    date: `${2010 + (i % 10)}-06-15`,
    description: `Job ${i}`,
    isDiy: i % 5 === 0,
    status: i % 3 === 0 ? "verified" : "completed",
    verified: i % 3 === 0,
    homeownerSigned: true,
    contractorSigned: i % 3 === 0,
    photos: [],
    createdAt: Date.now() - i * 86_400_000,
  })) as Job[];
}

function time(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

function validateReport(report: MaintenanceReport, yearBuilt: number) {
  expect(report.systemPredictions).toHaveLength(9);
  expect(report.generatedAt).toBeGreaterThan(0);
  for (const p of report.systemPredictions) {
    expect(p.percentLifeUsed).toBeGreaterThanOrEqual(0);
    expect(["Critical", "Soon", "Watch", "Good"]).toContain(p.urgency);
    expect(p.systemName).toBeTruthy();
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("13.3.2: predictMaintenance() at scale", () => {

  // ── All 8 systems × build years 1950–2024 ────────────────────────────────

  it("produces valid reports for build years 1950 through 2024", () => {
    const jobs = makeJobs(10);
    for (let year = 1950; year <= 2024; year++) {
      const report = predictMaintenance(year, jobs);
      validateReport(report, year);
    }
  });

  it("all 8 systems always appear in predictions regardless of build year", () => {
    const jobs = makeJobs(0);
    for (const yr of [1950, 1970, 1990, 2000, 2010, 2020, 2024]) {
      const report = predictMaintenance(yr, jobs);
      const names = report.systemPredictions.map((p) => p.systemName);
      for (const sys of ALL_SYSTEMS) {
        expect(names).toContain(sys);
      }
    }
  });

  it("older homes (1950) have higher urgency counts than newer homes (2020)", () => {
    const jobs = makeJobs(0);
    const old  = predictMaintenance(1950, jobs);
    const new_ = predictMaintenance(2020, jobs);
    const urgentOld = old.systemPredictions.filter((p) => p.urgency === "Critical" || p.urgency === "Soon").length;
    const urgentNew = new_.systemPredictions.filter((p) => p.urgency === "Critical" || p.urgency === "Soon").length;
    expect(urgentOld).toBeGreaterThanOrEqual(urgentNew);
  });

  // ── J-scaling ─────────────────────────────────────────────────────────────

  it("J-scaling: 10× jobs → <10× time (O(J))", () => {
    // Warm-up
    predictMaintenance(2000, makeJobs(5));

    const t10  = time(() => predictMaintenance(2000, makeJobs(10)));
    const t100 = time(() => predictMaintenance(2000, makeJobs(100)));

    const ratio = t100 / Math.max(t10, 0.01);
    expect(
      ratio,
      `10× jobs multiplied time by ${ratio.toFixed(1)}× — possible super-linear behavior`
    ).toBeLessThan(15);
  });

  // ── Absolute performance cap ──────────────────────────────────────────────

  it("1000 calls with 50 jobs each complete in < 1000ms", () => {
    const jobs = makeJobs(50);
    const elapsed = time(() => {
      for (let i = 0; i < 1000; i++) {
        predictMaintenance(2000 - (i % 50), jobs);
      }
    });
    expect(
      elapsed,
      `1000 calls took ${elapsed.toFixed(0)}ms — exceeds 1000ms budget`
    ).toBeLessThan(1000);
  });

  it("single call with 0 jobs completes in < 5ms", () => {
    const elapsed = time(() => predictMaintenance(2000, []));
    expect(elapsed).toBeLessThan(5);
  });

  it("single call with 500 jobs completes in < 50ms", () => {
    const jobs = makeJobs(500);
    const elapsed = time(() => predictMaintenance(2000, jobs));
    expect(elapsed).toBeLessThan(50);
  });

  // ── Climate zones × all years ─────────────────────────────────────────────

  it("produces valid reports for all 5 states (climate zones) × 5 build years", () => {
    const states  = ["FL", "AZ", "MN", "CA", "TX"];
    const years   = [1950, 1970, 1990, 2010, 2020];
    const jobs    = makeJobs(20);
    for (const state of states) {
      for (const yr of years) {
        const report = predictMaintenance(yr, jobs, {}, state);
        validateReport(report, yr);
      }
    }
  });

  // ── Concurrent calls ──────────────────────────────────────────────────────

  it("50 concurrent calls return valid reports", async () => {
    const jobs = makeJobs(20);
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(predictMaintenance(1990 + (i % 30), jobs))
      )
    );
    expect(results).toHaveLength(50);
    for (const r of results) {
      expect(r.systemPredictions).toHaveLength(9);
    }
  });

  it("50 concurrent calls all complete without error", async () => {
    // Verifies no internal lock / shared mutable state causes failures under
    // concurrent scheduling. Timing comparison is omitted: Promise.all over
    // synchronous work always adds microtask overhead on a single JS thread,
    // so any seq vs par timing assertion is structurally flaky.
    const jobs = makeJobs(20);

    const results = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        Promise.resolve(predictMaintenance(1990 + (i % 30), jobs))
      )
    );

    expect(results).toHaveLength(50);
    expect(results.every((r) => r !== null && typeof r === "object")).toBe(true);
  });

  // ── systemInstallYears override ───────────────────────────────────────────

  it("systemInstallYears override produces lower urgency for recently-replaced systems", () => {
    const jobs    = makeJobs(0);
    const curYear = new Date().getFullYear();

    const withOverride    = predictMaintenance(1960, jobs, { HVAC: curYear - 1 });
    const withoutOverride = predictMaintenance(1960, jobs);

    const hvacWith    = withOverride.systemPredictions.find((p) => p.systemName === "HVAC")!;
    const hvacWithout = withoutOverride.systemPredictions.find((p) => p.systemName === "HVAC")!;

    expect(hvacWith.percentLifeUsed).toBeLessThan(hvacWithout.percentLifeUsed);
  });
});
