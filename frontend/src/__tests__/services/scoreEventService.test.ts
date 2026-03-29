import { describe, it, expect, beforeEach, vi } from "vitest";
import { getRecentScoreEvents, categoryColor, categoryBg } from "@/services/scoreEventService";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";

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
    id:                BigInt(1),
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
    vi.setSystemTime(NOW_MS);
  });

  it("returns empty array for empty inputs", () => {
    expect(getRecentScoreEvents([], [])).toEqual([]);
  });

  it("emits a Job event for each verified job (4 pts)", () => {
    const job = makeJob({ status: "verified" });
    const events = getRecentScoreEvents([job], []);
    const jobEvent = events.find((e) => e.id === `verified-${job.id}`);
    expect(jobEvent).toBeDefined();
    expect(jobEvent!.pts).toBe(4);
    expect(jobEvent!.category).toBe("Job");
  });

  it("emits 1-pt events for recent DIY (non-verified) jobs", () => {
    const diy = makeJob({ id: "diy1", isDiy: true, status: "pending", verified: false, date: "2025-01-10" });
    const events = getRecentScoreEvents([diy], []);
    const diyEvent = events.find((e) => e.id === `diy-${diy.id}`);
    expect(diyEvent).toBeDefined();
    expect(diyEvent!.pts).toBe(1);
  });

  it("excludes DIY jobs older than 90 days", () => {
    const old = makeJob({ id: "old", isDiy: true, status: "pending", verified: false, date: "2024-09-01" });
    const events = getRecentScoreEvents([old], []);
    expect(events.find((e) => e.id === `diy-${old.id}`)).toBeUndefined();
  });

  it("includes verified jobs regardless of age", () => {
    const old = makeJob({ id: "old-verified", date: "2020-01-01", status: "verified" });
    const events = getRecentScoreEvents([old], []);
    expect(events.find((e) => e.id === `verified-${old.id}`)).toBeDefined();
  });

  it("emits Property event for Basic (5 pts) and Premium (10 pts)", () => {
    const basic   = makeProperty({ id: BigInt(1), verificationLevel: "Basic" });
    const premium = makeProperty({ id: BigInt(2), verificationLevel: "Premium", address: "456 Oak Ave" });
    const events  = getRecentScoreEvents([], [basic, premium]);
    const basicEv = events.find((e) => e.id === `prop-1`);
    const premEv  = events.find((e) => e.id === `prop-2`);
    expect(basicEv?.pts).toBe(5);
    expect(premEv?.pts).toBe(10);
    expect(basicEv?.category).toBe("Property");
  });

  it("does not emit Property events for Unverified or PendingReview", () => {
    const p1 = makeProperty({ id: BigInt(1), verificationLevel: "Unverified" });
    const p2 = makeProperty({ id: BigInt(2), verificationLevel: "PendingReview" });
    const events = getRecentScoreEvents([], [p1, p2]);
    expect(events.filter((e) => e.category === "Property")).toHaveLength(0);
  });

  it("emits a Diversity event when 3+ unique verified service types", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Roofing" }),
      makeJob({ id: "j3", serviceType: "Plumbing" }),
    ];
    const events = getRecentScoreEvents(jobs, []);
    const divEvent = events.find((e) => e.category === "Diversity");
    expect(divEvent).toBeDefined();
    expect(divEvent!.pts).toBe(12); // 3 * 4
  });

  it("does not emit Diversity event with fewer than 3 types", () => {
    const jobs = [
      makeJob({ id: "j1", serviceType: "HVAC" }),
      makeJob({ id: "j2", serviceType: "Roofing" }),
    ];
    const events = getRecentScoreEvents(jobs, []);
    expect(events.find((e) => e.category === "Diversity")).toBeUndefined();
  });

  it("emits a Value event at highest crossed threshold", () => {
    const job = makeJob({ amount: 1_100_000 }); // $11,000 → crosses $10,000 threshold
    const events = getRecentScoreEvents([job], []);
    const valEvent = events.find((e) => e.category === "Value");
    expect(valEvent).toBeDefined();
    expect(valEvent!.id).toBe("value-1000000"); // highest crossed = $10,000
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
