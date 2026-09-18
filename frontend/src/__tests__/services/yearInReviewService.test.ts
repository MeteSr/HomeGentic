/**
 * yearInReviewService — real logic worth locking down:
 *   - buildSummary filters to jobs within the trailing 365.25-day window
 *   - estimatedValueAddedCents is 80% of verified, non-DIY job spend only
 *   - topServiceTypes is ordered by frequency, most common first
 *   - send throws when 'to' is missing
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createYearInReviewService } from "@/services/yearInReviewService";
import type { YearInReviewContext, YearInReviewJob } from "@/services/yearInReviewService";

function makeJob(overrides: Partial<YearInReviewJob> = {}): YearInReviewJob {
  return { id: "j1", serviceType: "HVAC", amountCents: 50000, date: "2024-06-01", verified: true, isDiy: false, ...overrides };
}

function makeContext(overrides: Partial<YearInReviewContext> = {}): YearInReviewContext {
  return {
    propertyId: "prop-1", address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701",
    ownerName: "Jane", yearJoined: 2022, jobs: [], scoreStart: 60, scoreEnd: 70,
    nowMs: new Date("2025-01-01").getTime(),
    ...overrides,
  };
}

describe("yearInReviewService.buildSummary", () => {
  it("excludes jobs older than 365.25 days from nowMs", () => {
    const service = createYearInReviewService();
    const ctx = makeContext({ jobs: [makeJob({ date: "2023-06-01" })], nowMs: new Date("2025-01-01").getTime() });
    expect(service.buildSummary(ctx).jobsLogged).toBe(0);
  });

  it("includes jobs within the trailing year and counts verified/diy/warrantied", () => {
    const service = createYearInReviewService();
    const jobs = [
      makeJob({ id: "j1", verified: true, isDiy: false, date: "2024-06-01" }),
      makeJob({ id: "j2", verified: false, isDiy: true, date: "2024-07-01" }),
      makeJob({ id: "j3", warrantyMonths: 12, date: "2024-08-01" }),
    ];
    const summary = service.buildSummary(makeContext({ jobs }));
    expect(summary.jobsLogged).toBe(3);
    expect(summary.verifiedCount).toBe(2);
    expect(summary.diyCount).toBe(1);
    expect(summary.warrantiesSet).toBe(1);
  });

  it("computes estimatedValueAddedCents as 80% of verified, non-DIY spend only", () => {
    const service = createYearInReviewService();
    const jobs = [
      makeJob({ id: "j1", amountCents: 100000, verified: true, isDiy: false }),
      makeJob({ id: "j2", amountCents: 50000, verified: true, isDiy: true }), // excluded: DIY
      makeJob({ id: "j3", amountCents: 20000, verified: false, isDiy: false }), // excluded: unverified
    ];
    const summary = service.buildSummary(makeContext({ jobs }));
    expect(summary.estimatedValueAddedCents).toBe(80000);
    expect(summary.totalSpentCents).toBe(170000);
  });

  it("orders topServiceTypes by frequency, most common first", () => {
    const service = createYearInReviewService();
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }), makeJob({ id: "j2", serviceType: "HVAC" }),
      makeJob({ id: "j3", serviceType: "Roofing" }),
    ];
    const summary = service.buildSummary(makeContext({ jobs }));
    expect(summary.topServiceTypes[0]).toBe("HVAC");
  });

  it("computes scoreChange and reviewYear as the year before nowMs", () => {
    const service = createYearInReviewService();
    const summary = service.buildSummary(makeContext({ scoreStart: 60, scoreEnd: 75, nowMs: new Date("2025-03-01").getTime() }));
    expect(summary.scoreChange).toBe(15);
    expect(summary.reviewYear).toBe(2024);
  });
});

describe("yearInReviewService.renderHtml / renderText", () => {
  it("embeds the owner name and address in both formats", () => {
    const service = createYearInReviewService();
    const ctx = makeContext();
    expect(service.renderHtml(ctx)).toContain("Jane");
    expect(service.renderHtml(ctx)).toContain("1 Main St");
    expect(service.renderText(ctx)).toContain("Jane");
  });
});

describe("yearInReviewService.send", () => {
  let service: ReturnType<typeof createYearInReviewService>;
  beforeEach(() => { service = createYearInReviewService(); });

  it("throws when 'to' is missing", async () => {
    await expect(service.send("", makeContext())).rejects.toThrow("'to' address is required");
  });

  it("records a successful send in the outbox", async () => {
    const result = await service.send("owner@example.com", makeContext());
    expect(result.ok).toBe(true);
    expect(service.getOutbox()).toHaveLength(1);
  });
});
