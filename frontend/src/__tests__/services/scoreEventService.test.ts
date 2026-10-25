import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getRecentScoreEvents, categoryColor, categoryBg } from "@/services/scoreEventService";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";
import { computeScore } from "@/services/scoreService";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW_MS = new Date("2025-01-15").getTime();

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "j1",
    propertyId:       "p1",
    homeowner:        "principal-abc",
    serviceType:      "HVAC",
    description:      "HVAC service",
    contractorName:   "Cool Air LLC",
    amount:           240_000,
    date:             "2025-01-01",
    status:           "verified",
    verified:         true,
    isDiy:            false,
    permitNumber:     undefined,
    warrantyMonths:   0,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        Date.now(),
    ...overrides,
  };
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id:                "prop-1",
    owner:             "principal",
    address:           "123 Elm St",
    city:              "Austin",
    state:             "TX",
    zipCode:           "78701",
    propertyType:      "SingleFamily",
    yearBuilt:         BigInt(2000),
    squareFeet:        BigInt(2200),
    verificationLevel: "Basic",
    tier:              "Free",
    createdAt:         BigInt(NOW_MS * 1_000_000),
    updatedAt:         BigInt(NOW_MS * 1_000_000),
    isActive:          true,
    ...overrides,
  };
}

describe("getRecentScoreEvents", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW_MS);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty array for empty inputs", () => {
    expect(getRecentScoreEvents([], [])).toEqual([]);
  });

  const prop = makeProperty({ id: "p1" });

  it("gives each job the points it added when it joined the record, so they sum to the score", () => {
    const jobs = [
      makeJob({ id: "a", serviceType: "HVAC", date: "2024-03-01" }),
      makeJob({ id: "b", serviceType: "Roofing", date: "2024-06-01", amount: 1_200_000 }),
      makeJob({ id: "c", serviceType: "Plumbing", date: "2024-09-01", verified: false, status: "pending" }),
    ];
    const events = getRecentScoreEvents(jobs, [prop]);
    expect(events.reduce((s, e) => s + e.pts, 0)).toBe(computeScore(jobs, [prop]));
  });

  it("labels verified and unverified jobs differently", () => {
    const events = getRecentScoreEvents([
      makeJob({ id: "a", date: "2024-03-01" }),
      makeJob({ id: "b", serviceType: "Roofing", date: "2024-04-01", verified: false, status: "pending" }),
    ], [prop]);
    expect(events.map((e) => e.label)).toEqual(expect.arrayContaining(["HVAC Verified", "Roofing Logged"]));
  });

  it("leaves out a job that didn't change the score", () => {
    const jobs = [makeJob({ id: "a", date: "2024-03-01" }), makeJob({ id: "b", date: "2024-04-01" })];
    const events = getRecentScoreEvents(jobs, [prop]);
    expect(events.find((e) => e.id === "job-b")).toBeUndefined();
  });

  it("returns events sorted newest first", () => {
    const jobs = [
      makeJob({ id: "j1", date: "2024-06-01", status: "verified" }),
      makeJob({ id: "j2", serviceType: "Roofing", date: "2025-01-10", status: "verified" }),
    ];
    const events = getRecentScoreEvents(jobs, []);
    const jobEvents = events.filter((e) => e.category === "Job");
    expect(jobEvents[0].timestamp).toBeGreaterThan(jobEvents[1].timestamp);
  });

  it("caps returned events at 12", () => {
    const jobs = Array.from({ length: 20 }, (_, i) =>
      makeJob({ id: `j${i}`, serviceType: `Type${i}`, date: "2025-01-01" })
    );
    const events = getRecentScoreEvents(jobs, []);
    expect(events.length).toBeLessThanOrEqual(12);
  });
});

describe("categoryColor / categoryBg", () => {
  it("returns non-empty strings for all categories", () => {
    for (const cat of ["Job", "Property", "Diversity", "Value"] as const) {
      expect(categoryColor(cat)).toBeTruthy();
      expect(categoryBg(cat)).toBeTruthy();
    }
  });
});
