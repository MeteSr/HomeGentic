import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  warrantyExpiry,
  warrantyStatus,
  daysRemaining,
  getWarrantyJobs,
  MS_PER_MONTH,
  EXPIRY_ALERT_DAYS,
} from "@/services/warranty";
import type { Job } from "@/services/job";

// ─── Fixed time ───────────────────────────────────────────────────────────────
// "now" = 2026-01-15T00:00:00Z  (ms = 1736899200000)

const NOW = new Date("2026-01-15T00:00:00Z").getTime();

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "j1",
    propertyId:       "p1",
    homeowner:        "principal1",
    serviceType:      "HVAC",
    amount:           120_000,
    date:             "2024-01-15",   // 2 years ago from NOW
    description:      "HVAC install",
    isDiy:            false,
    status:           "verified",
    verified:         true,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        NOW,
    ...overrides,
  };
}

// ─── MS_PER_MONTH constant ────────────────────────────────────────────────────

describe("MS_PER_MONTH", () => {
  it("is approximately 30.44 days in milliseconds", () => {
    expect(MS_PER_MONTH).toBeCloseTo(30.44 * 24 * 60 * 60 * 1000, -3);
  });
});

// ─── EXPIRY_ALERT_DAYS constant ───────────────────────────────────────────────

describe("EXPIRY_ALERT_DAYS", () => {
  it("is 90", () => {
    expect(EXPIRY_ALERT_DAYS).toBe(90);
  });
});

// ─── warrantyExpiry ───────────────────────────────────────────────────────────

describe("warrantyExpiry", () => {
  it("returns job start date + warrantyMonths × MS_PER_MONTH", () => {
    // job.date = 2024-01-15, warrantyMonths = 12
    // expected = 2024-01-15 + 12 * MS_PER_MONTH
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 12 });
    const expected = new Date("2024-01-15").getTime() + 12 * MS_PER_MONTH;
    expect(warrantyExpiry(job)).toBe(expected);
  });

  it("returns job start date when warrantyMonths is 0", () => {
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 0 });
    expect(warrantyExpiry(job)).toBe(new Date("2024-01-15").getTime());
  });

  it("returns job start date when warrantyMonths is undefined", () => {
    const job = makeJob({ date: "2024-01-15", warrantyMonths: undefined });
    expect(warrantyExpiry(job)).toBe(new Date("2024-01-15").getTime());
  });

  it("longer warranty produces a later expiry", () => {
    const job12 = makeJob({ date: "2024-01-15", warrantyMonths: 12 });
    const job24 = makeJob({ date: "2024-01-15", warrantyMonths: 24 });
    expect(warrantyExpiry(job24)).toBeGreaterThan(warrantyExpiry(job12));
  });
});

// ─── warrantyStatus ───────────────────────────────────────────────────────────
//
// NOW = 2026-01-15
// job.date = "2024-01-15" (2 years before NOW)
//
// For warrantyMonths = 24: expiry = 2026-01-15 = NOW → expired (expiry <= now)
// For warrantyMonths = 25: expiry ≈ NOW + 1 month → active? no, within 90 days → expiring
// For warrantyMonths = 27: expiry ≈ NOW + 3 months → expiring (within 90 days)
// For warrantyMonths = 30: expiry ≈ NOW + 6 months → active (more than 90 days away)

describe("warrantyStatus", () => {
  it("'expired' when expiry <= now (exactly at expiry)", () => {
    // 24 months after 2024-01-15 ≈ 2026-01-15 = NOW exactly
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 24 });
    expect(warrantyStatus(job)).toBe("expired");
  });

  it("'expired' when expiry is well in the past", () => {
    // 12 months after 2024-01-15 = 2025-01-15, which is before NOW (2026-01-15)
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 12 });
    expect(warrantyStatus(job)).toBe("expired");
  });

  it("'expiring' when 0 < daysLeft <= 90", () => {
    // expiry = NOW + 45 days → well within 90-day alert window
    const fortyFiveDaysMs = 45 * 24 * 60 * 60 * 1000;
    const pastMs = NOW - 12 * MS_PER_MONTH + fortyFiveDaysMs;
    const jobDate = new Date(pastMs).toISOString().split("T")[0];
    const job = makeJob({ date: jobDate, warrantyMonths: 12 });
    expect(warrantyStatus(job)).toBe("expiring");
  });

  it("'active' when daysLeft > 90", () => {
    // expiry = NOW + 6 months → well beyond the 90-day window
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 30 });
    expect(warrantyStatus(job)).toBe("active");
  });

  it("'expired' for a job with no warrantyMonths (treats as 0 months)", () => {
    // expiry = job.date (in the past) → expired
    const job = makeJob({ date: "2024-01-15", warrantyMonths: undefined });
    expect(warrantyStatus(job)).toBe("expired");
  });
});

// ─── daysRemaining ────────────────────────────────────────────────────────────

describe("daysRemaining", () => {
  it("returns a positive number when warranty is still active", () => {
    // 30 months after 2024-01-15 is about 6 months past NOW → days > 0
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 30 });
    expect(daysRemaining(job)).toBeGreaterThan(0);
  });

  it("returns 0 or negative when expired", () => {
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 12 });
    expect(daysRemaining(job)).toBeLessThanOrEqual(0);
  });

  it("returns approximately 180 for 6 months remaining", () => {
    // expiry = NOW + ~6 months = NOW + 6 * MS_PER_MONTH
    // job.date such that date + 12 months = NOW + 6 months → date = NOW - 6 months
    const jobDateMs = NOW - 6 * MS_PER_MONTH;
    const jobDate = new Date(jobDateMs).toISOString().split("T")[0];
    const job = makeJob({ date: jobDate, warrantyMonths: 12 });
    const days = daysRemaining(job);
    expect(days).toBeGreaterThan(170);
    expect(days).toBeLessThan(190);
  });

  it("rounds to whole days", () => {
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 30 });
    expect(Number.isInteger(daysRemaining(job))).toBe(true);
  });
});

// ─── getWarrantyJobs ──────────────────────────────────────────────────────────

describe("getWarrantyJobs", () => {
  it("returns empty array for empty input", () => {
    expect(getWarrantyJobs([])).toHaveLength(0);
  });

  it("excludes jobs with no warrantyMonths", () => {
    const job = makeJob({ warrantyMonths: undefined });
    expect(getWarrantyJobs([job])).toHaveLength(0);
  });

  it("excludes jobs with warrantyMonths = 0", () => {
    const job = makeJob({ warrantyMonths: 0 });
    expect(getWarrantyJobs([job])).toHaveLength(0);
  });

  it("includes jobs with warrantyMonths > 0", () => {
    const job = makeJob({ warrantyMonths: 12 });
    expect(getWarrantyJobs([job])).toHaveLength(1);
  });

  it("each result has job, status, expiry (Date), and daysLeft", () => {
    const job = makeJob({ warrantyMonths: 30 });
    const [result] = getWarrantyJobs([job]);
    expect(result.job).toEqual(job);
    expect(typeof result.status).toBe("string");
    expect(result.expiry).toBeInstanceOf(Date);
    expect(typeof result.daysLeft).toBe("number");
  });

  it("status is consistent with warrantyStatus()", () => {
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 30 });
    const [result] = getWarrantyJobs([job]);
    expect(result.status).toBe(warrantyStatus(job));
  });

  it("daysLeft is consistent with daysRemaining()", () => {
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 30 });
    const [result] = getWarrantyJobs([job]);
    expect(result.daysLeft).toBe(daysRemaining(job));
  });

  it("expiry Date value matches warrantyExpiry()", () => {
    const job = makeJob({ date: "2024-01-15", warrantyMonths: 30 });
    const [result] = getWarrantyJobs([job]);
    expect(result.expiry.getTime()).toBe(warrantyExpiry(job));
  });

  it("filters multiple jobs correctly", () => {
    const jobs = [
      makeJob({ id: "j1", warrantyMonths: 12 }),   // has warranty
      makeJob({ id: "j2", warrantyMonths: 0 }),    // no warranty
      makeJob({ id: "j3", warrantyMonths: 24 }),   // has warranty
      makeJob({ id: "j4", warrantyMonths: undefined }), // no warranty
    ];
    const results = getWarrantyJobs(jobs);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.job.id)).toEqual(["j1", "j3"]);
  });
});
