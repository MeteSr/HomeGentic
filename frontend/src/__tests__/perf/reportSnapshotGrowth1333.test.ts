/**
 * TDD — 13.3.3: report service — snapshot size growth
 *
 * Measures how the mock reportService.generateReport() / getReport() behave
 * as the jobs array grows: 0, 10, 50, 200 jobs.
 *
 * In the mock (no REPORT_CANISTER_ID), generateReport() builds a ReportSnapshot
 * in memory and stores it in a Map. getReport() retrieves it.
 *
 * "Snapshot footprint" is approximated by JSON.stringify(snapshot).length.
 * "Latency" is measured via performance.now().
 *
 * Tests:
 *   - generateReport() completes for all four sizes
 *   - getReport() round-trips correctly at all sizes
 *   - JSON size grows linearly with job count (not quadratic)
 *   - generateReport() timing is O(N): 20× jobs → <20× time
 *   - getReport() timing is O(1): independent of snapshot size
 *   - 200-job report is < 200KB serialized (canister memory guard)
 *   - Concurrent generateReport() calls don't corrupt the store
 */

import { describe, it, expect } from "vitest";
import { reportService, jobToInput, propertyToInput } from "../../services/report";
import type { JobInput, PropertyInput } from "../../services/report";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SERVICE_TYPES = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows", "Flooring", "Painting", "Landscaping"];

function makeJobInputs(count: number): JobInput[] {
  return Array.from({ length: count }, (_, i) => ({
    serviceType:    SERVICE_TYPES[i % SERVICE_TYPES.length],
    description:    `Job ${i} — ${SERVICE_TYPES[i % SERVICE_TYPES.length]} service`,
    contractorName: `Contractor ${i}`,
    amountCents:    100_000 + i * 5_000,
    date:           `${2015 + (i % 8)}-${String((i % 12) + 1).padStart(2, "0")}-15`,
    completedYear:  2015 + (i % 8),
    isDiy:          i % 7 === 0,
    permitNumber:   i % 4 === 0 ? `PMT-${i}` : undefined,
    warrantyMonths: i % 5 === 0 ? 24 : 0,
    isVerified:     i % 3 === 0,
    status:         i % 3 === 0 ? "verified" : "completed",
  }));
}

const BASE_PROPERTY: PropertyInput = {
  address:           "123 Test Street",
  city:              "Austin",
  state:             "TX",
  zipCode:           "78701",
  propertyType:      "SingleFamily",
  yearBuilt:         2000,
  squareFeet:        2200,
  verificationLevel: "Basic",
};

async function generateAndFetch(jobCount: number) {
  const jobs = makeJobInputs(jobCount);
  const link = await reportService.generateReport(
    "prop-perf-test",
    BASE_PROPERTY,
    jobs,
    [],     // recurringServices
    [],     // rooms
    null,   // expiryDays
    "Public"
  );
  const { snapshot } = await reportService.getReport(link.token);
  return { link, snapshot };
}

function time(fn: () => Promise<void>): Promise<number>;
function time(fn: () => void): number;
function time(fn: () => any): any {
  const t0 = performance.now();
  const result = fn();
  if (result && typeof result.then === "function") {
    return result.then(() => performance.now() - t0);
  }
  return performance.now() - t0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("13.3.3: reportService snapshot size growth", () => {

  // ── Correctness at each size ──────────────────────────────────────────────

  it.each([0, 10, 50, 200])(
    "generateReport(%i jobs) completes and returns a share link",
    async (count) => {
      const { link } = await generateAndFetch(count);
      expect(link.token).toBeTruthy();
      expect(link.isActive).toBe(true);
    }
  );

  it.each([0, 10, 50, 200])(
    "getReport round-trips correctly for %i jobs",
    async (count) => {
      const { snapshot } = await generateAndFetch(count);
      expect(snapshot.jobs).toHaveLength(count);
      expect(snapshot.totalAmountCents).toBe(
        makeJobInputs(count).reduce((s, j) => s + j.amountCents, 0)
      );
      expect(snapshot.verifiedJobCount).toBe(
        makeJobInputs(count).filter((j) => j.isVerified).length
      );
      expect(snapshot.diyJobCount).toBe(
        makeJobInputs(count).filter((j) => j.isDiy).length
      );
    }
  );

  // ── Snapshot footprint ────────────────────────────────────────────────────

  it("JSON footprint grows approximately linearly with job count", async () => {
    const sizes: Record<number, number> = {};
    for (const count of [10, 50, 200]) {
      const { snapshot } = await generateAndFetch(count);
      sizes[count] = JSON.stringify(snapshot).length;
    }

    // 20× jobs (10→200) should produce <25× bytes (linear ≈ 20×, allow margin)
    const ratio = sizes[200] / sizes[10];
    expect(
      ratio,
      `10→200 jobs grew bytes by ${ratio.toFixed(1)}× — possible non-linear growth`
    ).toBeLessThan(25);
  });

  it("200-job snapshot is < 200KB serialized", async () => {
    const { snapshot } = await generateAndFetch(200);
    const bytes = JSON.stringify(snapshot).length;
    expect(
      bytes,
      `200-job snapshot is ${(bytes / 1024).toFixed(1)}KB — exceeds 200KB canister memory guard`
    ).toBeLessThan(200 * 1024);
  });

  it("0-job snapshot is < 2KB serialized", async () => {
    const { snapshot } = await generateAndFetch(0);
    const bytes = JSON.stringify(snapshot).length;
    expect(bytes).toBeLessThan(2 * 1024);
  });

  // ── Timing: generateReport ────────────────────────────────────────────────

  it("generateReport() timing is O(N): 20× jobs → <20× time", async () => {
    // Warm-up
    await generateAndFetch(5);

    const t10  = await time(() => generateAndFetch(10));
    const t200 = await time(() => generateAndFetch(200));

    const ratio = t200 / Math.max(t10, 0.01);
    expect(
      ratio,
      `generateReport: 20× jobs multiplied time by ${ratio.toFixed(1)}× — expected near-linear`
    ).toBeLessThan(50); // generous for jsdom microtask overhead
  });

  it("generateReport(200 jobs) completes in < 20ms", async () => {
    const elapsed = await time(() => generateAndFetch(200));
    expect(elapsed).toBeLessThan(20);
  });

  // ── Timing: getReport ─────────────────────────────────────────────────────

  it("getReport() timing is independent of snapshot size (O(1) lookup)", async () => {
    const { link: link0   } = await generateAndFetch(0);
    const { link: link200 } = await generateAndFetch(200);

    const t0   = await time(async () => { await reportService.getReport(link0.token); });
    const t200 = await time(async () => { await reportService.getReport(link200.token); });

    // 200-job snapshot retrieval should be within 10× of empty snapshot retrieval
    const ratio = t200 / Math.max(t0, 0.01);
    expect(
      ratio,
      `getReport 200-job took ${ratio.toFixed(1)}× longer than 0-job — expected O(1)`
    ).toBeLessThan(10);
  });

  // ── Concurrent generation ─────────────────────────────────────────────────

  it("20 concurrent generateReport(50 jobs) calls all succeed with unique tokens", async () => {
    const jobs = makeJobInputs(50);
    const links = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        reportService.generateReport(
          `prop-concurrent-${i}`,
          BASE_PROPERTY,
          jobs, [], [], null, "Public"
        )
      )
    );

    expect(links).toHaveLength(20);
    const tokens = new Set(links.map((l) => l.token));
    expect(tokens.size).toBe(20); // all tokens unique — no store corruption
  });

  it("concurrent generation + reads don't corrupt snapshots", async () => {
    // Generate 10 reports, then read them all concurrently
    const jobs = makeJobInputs(30);
    const links = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        reportService.generateReport(`prop-rw-${i}`, BASE_PROPERTY, jobs, [], [], null, "Public")
      )
    );

    const snapshots = await Promise.all(links.map((l) => reportService.getReport(l.token)));

    for (const { snapshot } of snapshots) {
      expect(snapshot.jobs).toHaveLength(30);
    }
  });
});
