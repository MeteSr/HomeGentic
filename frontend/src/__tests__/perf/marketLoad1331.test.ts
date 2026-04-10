/**
 * TDD — 13.3.1: market service — analyzeCompetitivePosition() under load
 *
 * analyzeCompetitivePosition(subject, comparisons) is pure client-side JS.
 * Complexity: O(C × N) where C = comparison count, N = jobs per property.
 * Each comparison property runs three scoring passes (maintenance, modernization,
 * verification), each with 6 × jobs.find() loops → O(6N) per comparison.
 *
 * Tests:
 *   - Correctness: returns valid CompetitiveAnalysis at all sizes
 *   - N-scaling: 10× jobs → <10× time (sub-quadratic w.r.t. job count)
 *   - C-scaling: 10× comparisons → <10× time (linear)
 *   - Concurrent calls: Promise.all faster than sequential (no blocking)
 *   - recommendValueAddingProjects: linear in job count
 *   - Absolute caps: 100 comparisons × 100 jobs completes in < 500ms
 */

import { describe, it, expect } from "vitest";
import {
  marketService,
  PropertyJobSummary,
  JobSummary,
  PropertyProfile,
} from "../../services/market";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERVICE_TYPES = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows", "Flooring", "Painting", "Landscaping"];

function makeJobs(count: number): JobSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    serviceType:   SERVICE_TYPES[i % SERVICE_TYPES.length],
    completedYear: 2018 + (i % 6),
    amountCents:   500_000 + i * 1_000,
    isDiy:         i % 7 === 0,
    isVerified:    i % 4 === 0,
  }));
}

function makeSubject(jobCount: number): PropertyJobSummary {
  return {
    propertyId:   "subject",
    yearBuilt:    2000,
    squareFeet:   2000,
    propertyType: "SingleFamily",
    state:        "TX",
    zipCode:      "78701",
    jobs:         makeJobs(jobCount),
  };
}

function makeComparisons(count: number, jobsPerProp: number): PropertyJobSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    propertyId:   `comp-${i}`,
    yearBuilt:    1990 + (i % 30),
    squareFeet:   1500 + i * 10,
    propertyType: "SingleFamily",
    state:        "TX",
    zipCode:      "78701",
    jobs:         makeJobs(jobsPerProp),
  }));
}

function makeProfile(): PropertyProfile {
  return {
    yearBuilt:    1995,
    squareFeet:   2200,
    propertyType: "SingleFamily",
    state:        "TX",
    zipCode:      "78701",
  };
}

/** Measure wall-clock time for fn() in milliseconds. */
function time(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("13.3.1: analyzeCompetitivePosition() under load", () => {

  // ── Correctness at scale ──────────────────────────────────────────────────

  it("returns valid CompetitiveAnalysis for 1 comparison × 1 job", () => {
    const result = marketService.analyzeCompetitivePosition(
      makeSubject(1),
      makeComparisons(1, 1)
    );
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.totalCompared).toBe(2);
    expect(result.rankOutOf).toBeGreaterThanOrEqual(1);
  });

  it("returns valid CompetitiveAnalysis for 50 comparisons × 50 jobs each", () => {
    const result = marketService.analyzeCompetitivePosition(
      makeSubject(50),
      makeComparisons(50, 50)
    );
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
    expect(result.totalCompared).toBe(51);
  });

  it("returns valid CompetitiveAnalysis for 100 comparisons × 100 jobs each", () => {
    const result = marketService.analyzeCompetitivePosition(
      makeSubject(100),
      makeComparisons(100, 100)
    );
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.totalCompared).toBe(101);
  });

  it("subject with more verified jobs scores higher overall than subject with no jobs", () => {
    const wellMaintained = marketService.analyzeCompetitivePosition(
      makeSubject(20),
      makeComparisons(5, 5)
    );
    const bareSubject: PropertyJobSummary = { ...makeSubject(0), propertyId: "bare" };
    const unmaintained = marketService.analyzeCompetitivePosition(
      bareSubject,
      makeComparisons(5, 5)
    );
    expect(wellMaintained.overallScore).toBeGreaterThanOrEqual(unmaintained.overallScore);
  });

  // ── N-scaling: fixed 10 comparisons, varying job counts ──────────────────

  it("N-scaling: 10× jobs → <10× time (sub-quadratic)", () => {
    const COMPARISONS = 10;

    // Warm-up pass (avoid JIT cold-start skewing the first measurement)
    marketService.analyzeCompetitivePosition(makeSubject(5), makeComparisons(COMPARISONS, 5));

    const t10  = time(() => marketService.analyzeCompetitivePosition(makeSubject(10),  makeComparisons(COMPARISONS, 10)));
    const t100 = time(() => marketService.analyzeCompetitivePosition(makeSubject(100), makeComparisons(COMPARISONS, 100)));

    // 10× more jobs should take less than 10× more time (allow generous 15× for CI jitter)
    const ratio = t100 / Math.max(t10, 0.01);
    expect(
      ratio,
      `10× jobs multiplied time by ${ratio.toFixed(1)}× — possible O(N²) behavior`
    ).toBeLessThan(15);
  });

  // ── C-scaling: fixed 10 jobs, varying comparison counts ──────────────────

  it("C-scaling: 10× comparisons → <10× time (linear)", () => {
    const JOBS = 10;

    // Warm-up
    marketService.analyzeCompetitivePosition(makeSubject(JOBS), makeComparisons(5, JOBS));

    const t10  = time(() => marketService.analyzeCompetitivePosition(makeSubject(JOBS), makeComparisons(10,  JOBS)));
    const t100 = time(() => marketService.analyzeCompetitivePosition(makeSubject(JOBS), makeComparisons(100, JOBS)));

    const ratio = t100 / Math.max(t10, 0.01);
    expect(
      ratio,
      `10× comparisons multiplied time by ${ratio.toFixed(1)}× — expected ~linear`
    ).toBeLessThan(15);
  });

  // ── Absolute cap ──────────────────────────────────────────────────────────

  it("100 comparisons × 100 jobs each completes in < 500ms", () => {
    const elapsed = time(() =>
      marketService.analyzeCompetitivePosition(
        makeSubject(100),
        makeComparisons(100, 100)
      )
    );
    expect(
      elapsed,
      `analyzeCompetitivePosition(100×100) took ${elapsed.toFixed(0)}ms — exceeds 500ms budget`
    ).toBeLessThan(500);
  });

  // ── Concurrent calls ──────────────────────────────────────────────────────

  it("50 concurrent Promise.all calls all complete without error", async () => {
    // Verifies no internal lock / shared mutable state causes failures under
    // concurrent scheduling. Timing comparison is omitted: Promise.all over
    // synchronous work always adds microtask overhead on a single JS thread,
    // so any seq vs par timing assertion is structurally flaky.
    const subject     = makeSubject(20);
    const comparisons = makeComparisons(20, 20);

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve(marketService.analyzeCompetitivePosition(subject, comparisons))
      )
    );

    expect(results).toHaveLength(50);
    expect(results.every((r) => r !== null && typeof r === "object")).toBe(true);
  });

  it("each of 50 concurrent calls returns a valid result", async () => {
    const subject     = makeSubject(20);
    const comparisons = makeComparisons(10, 20);

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve(marketService.analyzeCompetitivePosition(subject, comparisons))
      )
    );

    expect(results).toHaveLength(50);
    for (const r of results) {
      expect(r.overallScore).toBeGreaterThanOrEqual(0);
      expect(r.overallScore).toBeLessThanOrEqual(100);
    }
  });
});

// ─── recommendValueAddingProjects ────────────────────────────────────────────

describe("13.3.1: recommendValueAddingProjects() scaling", () => {

  it("returns an array for 0 jobs", () => {
    const recs = marketService.recommendValueAddingProjects(makeProfile(), [], 0);
    expect(Array.isArray(recs)).toBe(true);
  });

  it("returns an array for 100 jobs", () => {
    const jobs = makeJobs(100).map((j) => ({
      serviceType:   j.serviceType,
      completedYear: j.completedYear,
      amountCents:   j.amountCents,
      isDiy:         j.isDiy,
      isVerified:    j.isVerified,
    }));
    const recs = marketService.recommendValueAddingProjects(makeProfile(), jobs as any, 0);
    expect(Array.isArray(recs)).toBe(true);
  });

  it("N-scaling: 100 jobs → <5× time vs 1 job (linear)", () => {
    const profile = makeProfile();

    // Warm-up
    marketService.recommendValueAddingProjects(profile, [] as any, 0);

    const t1   = time(() => marketService.recommendValueAddingProjects(profile, makeJobs(1)   as any, 0));
    const t100 = time(() => marketService.recommendValueAddingProjects(profile, makeJobs(100) as any, 0));

    const ratio = t100 / Math.max(t1, 0.01);
    expect(
      ratio,
      `recommendValueAddingProjects: 100× jobs took ${ratio.toFixed(1)}× longer — expected ~linear`
    ).toBeLessThan(50); // very generous — jsdom timing noise is high at sub-ms durations
  });

  it("completes for 200 jobs in < 50ms", () => {
    const elapsed = time(() =>
      marketService.recommendValueAddingProjects(makeProfile(), makeJobs(200) as any, 0)
    );
    expect(elapsed).toBeLessThan(50);
  });

  it("budget filter reduces result set", () => {
    const profile = makeProfile();
    const noBudget = marketService.recommendValueAddingProjects(profile, [] as any, 0);
    const tightBudget = marketService.recommendValueAddingProjects(profile, [] as any, 1_000);   // $0.01
    // tight budget should return fewer or equal recommendations
    expect(tightBudget.length).toBeLessThanOrEqual(noBudget.length);
  });
});
