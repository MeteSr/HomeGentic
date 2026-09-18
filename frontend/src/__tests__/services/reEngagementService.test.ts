/**
 * reEngagementService (getReEngagementPrompts) — real logic worth locking
 * down:
 *   - only verified, non-DIY jobs with a contractor name are eligible
 *   - only the most recent job per service type is considered
 *   - a prompt is produced only when that job's date falls 10–13 months
 *     before the reference time (calendar-month arithmetic, day-of-month
 *     aware)
 */

import { describe, it, expect } from "vitest";
import { getReEngagementPrompts } from "@/services/reEngagementService";
import type { Job } from "@/services/job";

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 50000, date: "2024-01-01", description: "Service", isDiy: false,
    contractorName: "Cool Air Co.", status: "verified" as any, verified: true,
    homeownerSigned: true, contractorSigned: true, photos: [], createdAt: Date.now(),
    ...overrides,
  };
}

const NOW = new Date("2025-01-15T00:00:00Z").getTime();

describe("getReEngagementPrompts — eligibility", () => {
  it("excludes unverified jobs", () => {
    const jobs = [makeJob({ verified: false, date: "2024-02-15" })];
    expect(getReEngagementPrompts(jobs, NOW)).toEqual([]);
  });

  it("excludes DIY jobs", () => {
    const jobs = [makeJob({ isDiy: true, date: "2024-02-15" })];
    expect(getReEngagementPrompts(jobs, NOW)).toEqual([]);
  });

  it("excludes jobs with no contractor name", () => {
    const jobs = [makeJob({ contractorName: undefined, date: "2024-02-15" })];
    expect(getReEngagementPrompts(jobs, NOW)).toEqual([]);
  });
});

describe("getReEngagementPrompts — window", () => {
  it("excludes a job less than 10 months old", () => {
    const jobs = [makeJob({ date: "2024-06-15" })]; // ~7 months before NOW
    expect(getReEngagementPrompts(jobs, NOW)).toEqual([]);
  });

  it("excludes a job more than 13 months old", () => {
    const jobs = [makeJob({ date: "2023-10-01" })]; // ~15 months before NOW
    expect(getReEngagementPrompts(jobs, NOW)).toEqual([]);
  });

  it("includes a job exactly within the 10-13 month window", () => {
    const jobs = [makeJob({ date: "2024-02-15" })]; // 11 months before NOW
    const prompts = getReEngagementPrompts(jobs, NOW);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toMatchObject({
      jobId: "job-1",
      contractorName: "Cool Air Co.",
      serviceType: "HVAC",
      monthsSince: 11,
    });
    expect(prompts[0].message).toBe("Book Cool Air Co. again — they did your last HVAC service 11 months ago.");
  });
});

describe("getReEngagementPrompts — grouping by service type", () => {
  it("only considers the most recent job per service type", () => {
    const jobs = [
      makeJob({ id: "old", date: "2023-01-01", serviceType: "HVAC" }), // too old
      makeJob({ id: "recent", date: "2024-02-15", serviceType: "HVAC" }), // in window
    ];
    const prompts = getReEngagementPrompts(jobs, NOW);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].jobId).toBe("recent");
  });

  it("produces one prompt per eligible service type", () => {
    const jobs = [
      makeJob({ id: "hvac-job", serviceType: "HVAC", date: "2024-02-15" }),
      makeJob({ id: "roof-job", serviceType: "Roofing", date: "2024-03-01" }),
    ];
    const prompts = getReEngagementPrompts(jobs, NOW);
    expect(prompts.map((p) => p.jobId).sort()).toEqual(["hvac-job", "roof-job"]);
  });
});
