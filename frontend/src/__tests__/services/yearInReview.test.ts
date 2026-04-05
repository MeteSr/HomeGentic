/**
 * TDD — 8.5.3: Year-in-Review Email
 *
 * yearInReviewService builds a structured summary of the past 12 months
 * (jobs logged, score change, warranties set, estimated value added) and
 * renders it as an HTML email + plain text.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createYearInReviewService,
  type YearInReviewContext,
  type YearInReviewSummary,
} from "@/services/yearInReviewService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date("2026-01-15").getTime();
const ONE_YEAR_AGO = new Date("2025-01-15").getTime();

function makeJob(overrides: {
  id?: string;
  serviceType?: string;
  amountCents?: number;
  date?: string;
  verified?: boolean;
  isDiy?: boolean;
  warrantyMonths?: number;
  contractorName?: string;
} = {}) {
  return {
    id:             overrides.id            ?? `j-${Math.random()}`,
    serviceType:    overrides.serviceType   ?? "HVAC",
    amountCents:    overrides.amountCents   ?? 50000,
    date:           overrides.date          ?? "2025-06-01",
    verified:       overrides.verified      ?? true,
    isDiy:          overrides.isDiy         ?? false,
    warrantyMonths: overrides.warrantyMonths,
    contractorName: overrides.contractorName ?? "Pro Co",
  };
}

function makeCtx(overrides: Partial<YearInReviewContext> = {}): YearInReviewContext {
  return {
    propertyId:   overrides.propertyId   ?? "prop-1",
    address:      overrides.address      ?? "100 Elm St",
    city:         overrides.city         ?? "Austin",
    state:        overrides.state        ?? "TX",
    zipCode:      overrides.zipCode      ?? "78701",
    ownerName:    overrides.ownerName    ?? "Jordan",
    yearJoined:   overrides.yearJoined   ?? 2025,
    jobs:         overrides.jobs         ?? [],
    scoreStart:   overrides.scoreStart   ?? 50,
    scoreEnd:     overrides.scoreEnd     ?? 68,
    nowMs:        overrides.nowMs        ?? NOW,
    ...overrides,
  };
}

// ── buildSummary ──────────────────────────────────────────────────────────────

describe("yearInReviewService.buildSummary (8.5.3)", () => {
  let svc: ReturnType<typeof createYearInReviewService>;
  beforeEach(() => { svc = createYearInReviewService(); });

  it("returns a YearInReviewSummary object", () => {
    const s = svc.buildSummary(makeCtx());
    expect(s).toBeDefined();
    expect(typeof s).toBe("object");
  });

  it("counts only jobs from the past 12 months", () => {
    const ctx = makeCtx({
      nowMs: NOW,
      jobs: [
        makeJob({ date: "2025-06-01" }),                    // within year
        makeJob({ date: "2025-12-01" }),                    // within year
        makeJob({ date: "2024-01-01" }),                    // older than 1 year
      ],
    });
    expect(svc.buildSummary(ctx).jobsLogged).toBe(2);
  });

  it("sums amountCents for jobs in the past 12 months", () => {
    const ctx = makeCtx({
      jobs: [
        makeJob({ amountCents: 100_000, date: "2025-06-01" }),
        makeJob({ amountCents: 200_000, date: "2025-09-01" }),
        makeJob({ amountCents: 999_999, date: "2024-01-01" }), // excluded
      ],
    });
    expect(svc.buildSummary(ctx).totalSpentCents).toBe(300_000);
  });

  it("counts verified jobs only in verifiedCount", () => {
    const ctx = makeCtx({
      jobs: [
        makeJob({ verified: true,  date: "2025-06-01" }),
        makeJob({ verified: false, date: "2025-07-01" }),
        makeJob({ verified: true,  date: "2025-08-01" }),
      ],
    });
    expect(svc.buildSummary(ctx).verifiedCount).toBe(2);
  });

  it("counts DIY jobs separately", () => {
    const ctx = makeCtx({
      jobs: [
        makeJob({ isDiy: true,  date: "2025-05-01" }),
        makeJob({ isDiy: false, date: "2025-06-01" }),
      ],
    });
    expect(svc.buildSummary(ctx).diyCount).toBe(1);
  });

  it("counts jobs with a warrantyMonths value in warrantiesSet", () => {
    const ctx = makeCtx({
      jobs: [
        makeJob({ warrantyMonths: 12, date: "2025-06-01" }),
        makeJob({ warrantyMonths: 24, date: "2025-07-01" }),
        makeJob({ date: "2025-08-01" }),                    // no warranty
      ],
    });
    expect(svc.buildSummary(ctx).warrantiesSet).toBe(2);
  });

  it("computes scoreChange as scoreEnd - scoreStart", () => {
    const s = svc.buildSummary(makeCtx({ scoreStart: 40, scoreEnd: 65 }));
    expect(s.scoreChange).toBe(25);
  });

  it("scoreChange is negative when score dropped", () => {
    const s = svc.buildSummary(makeCtx({ scoreStart: 70, scoreEnd: 55 }));
    expect(s.scoreChange).toBe(-15);
  });

  it("includes scoreStart and scoreEnd", () => {
    const s = svc.buildSummary(makeCtx({ scoreStart: 50, scoreEnd: 72 }));
    expect(s.scoreStart).toBe(50);
    expect(s.scoreEnd).toBe(72);
  });

  it("computes topServiceTypes as most-frequent service types in the year", () => {
    const ctx = makeCtx({
      jobs: [
        makeJob({ serviceType: "HVAC",     date: "2025-03-01" }),
        makeJob({ serviceType: "HVAC",     date: "2025-06-01" }),
        makeJob({ serviceType: "Plumbing", date: "2025-07-01" }),
        makeJob({ serviceType: "Roofing",  date: "2025-08-01" }),
      ],
    });
    const s = svc.buildSummary(ctx);
    expect(s.topServiceTypes[0]).toBe("HVAC");
  });

  it("estimatedValueAddedCents is non-negative", () => {
    const s = svc.buildSummary(makeCtx({
      jobs: [makeJob({ amountCents: 150_000, verified: true, date: "2025-06-01" })],
    }));
    expect(s.estimatedValueAddedCents).toBeGreaterThanOrEqual(0);
  });

  it("returns 0 jobsLogged for empty job list", () => {
    expect(svc.buildSummary(makeCtx({ jobs: [] })).jobsLogged).toBe(0);
  });
});

// ── renderHtml ────────────────────────────────────────────────────────────────

describe("yearInReviewService.renderHtml (8.5.3)", () => {
  let svc: ReturnType<typeof createYearInReviewService>;
  beforeEach(() => { svc = createYearInReviewService(); });

  const ctx = () => makeCtx({
    ownerName: "Jordan",
    jobs: [makeJob({ amountCents: 120_000, warrantyMonths: 12, date: "2025-06-01" })],
    scoreStart: 50,
    scoreEnd: 70,
  });

  it("returns a non-empty HTML string", () => {
    const html = svc.renderHtml(ctx());
    expect(typeof html).toBe("string");
    expect(html).toContain("<");
  });

  it("includes the owner name", () => {
    expect(svc.renderHtml(ctx())).toContain("Jordan");
  });

  it("includes HomeGentic branding", () => {
    expect(svc.renderHtml(ctx()).toLowerCase()).toContain("homegentic");
  });

  it("includes the score change", () => {
    const html = svc.renderHtml(ctx());
    expect(html).toMatch(/\+?20|50.*70|70.*50/);
  });

  it("includes jobs logged count", () => {
    const html = svc.renderHtml(ctx());
    expect(html).toContain("1");    // 1 job logged
  });

  it("includes the property address", () => {
    expect(svc.renderHtml(ctx())).toContain("100 Elm St");
  });

  it("includes a year number (2025 or 2026)", () => {
    expect(svc.renderHtml(ctx())).toMatch(/202[56]/);
  });
});

// ── renderText ────────────────────────────────────────────────────────────────

describe("yearInReviewService.renderText (8.5.3)", () => {
  let svc: ReturnType<typeof createYearInReviewService>;
  beforeEach(() => { svc = createYearInReviewService(); });

  it("returns plain text with no HTML tags", () => {
    const text = svc.renderText(makeCtx());
    expect(text).not.toMatch(/<[^>]+>/);
  });

  it("includes the owner name", () => {
    expect(svc.renderText(makeCtx({ ownerName: "Alex" }))).toContain("Alex");
  });

  it("includes HomeGentic", () => {
    expect(svc.renderText(makeCtx()).toLowerCase()).toContain("homegentic");
  });
});

// ── send ──────────────────────────────────────────────────────────────────────

describe("yearInReviewService.send (8.5.3)", () => {
  let svc: ReturnType<typeof createYearInReviewService>;
  beforeEach(() => { svc = createYearInReviewService(); });

  it("returns ok: true", async () => {
    const r = await svc.send("owner@example.com", makeCtx());
    expect(r.ok).toBe(true);
  });

  it("returns a messageId", async () => {
    const r = await svc.send("owner@example.com", makeCtx());
    expect(typeof r.messageId).toBe("string");
    expect(r.messageId.length).toBeGreaterThan(0);
  });

  it("records send in outbox", async () => {
    await svc.send("a@b.com", makeCtx({ propertyId: "p42" }));
    const [entry] = svc.getOutbox();
    expect(entry.to).toBe("a@b.com");
    expect(entry.propertyId).toBe("p42");
  });

  it("throws for empty 'to'", async () => {
    await expect(svc.send("", makeCtx())).rejects.toThrow();
  });
});
