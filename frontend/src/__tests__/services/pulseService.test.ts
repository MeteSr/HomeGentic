import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getWeeklyPulse } from "@/services/pulseService";
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date("2025-06-15").getTime(); // month = 6

function makeProperty(): Property {
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
    createdAt:         BigInt(NOW * 1_000_000),
    updatedAt:         BigInt(NOW * 1_000_000),
    isActive:          true,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "j1",
    propertyId:       "p1",
    homeowner:        "principal-abc",
    serviceType:      "HVAC",
    description:      "HVAC tune-up",
    contractorName:   "Cool Air LLC",
    amount:           20_000,
    date:             "2025-06-01",   // recent — within last 12 months
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

// ─── getWeeklyPulse ───────────────────────────────────────────────────────────

describe("getWeeklyPulse", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null when there are no properties", () => {
    expect(getWeeklyPulse([], [])).toBeNull();
  });

  it("returns null when there are no properties even with jobs", () => {
    const job = makeJob();
    expect(getWeeklyPulse([], [job])).toBeNull();
  });

  it("returns an Overdue tip when HVAC hasn't been serviced in over a year", () => {
    // Date over a year ago
    const oldJob = makeJob({ serviceType: "HVAC", date: "2023-01-01" });
    const result = getWeeklyPulse([makeProperty()], [oldJob]);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("Overdue");
    expect(result!.headline).toContain("HVAC");
  });

  it("returns Overdue for Plumbing when no plumbing job in last 12 months", () => {
    // All annual services are present and recent except Plumbing
    const hvacJob      = makeJob({ id: "j1", serviceType: "HVAC",       date: "2025-06-01" });
    const plumbingOld  = makeJob({ id: "j2", serviceType: "Plumbing",   date: "2023-01-01" });
    const result = getWeeklyPulse([makeProperty()], [hvacJob, plumbingOld]);
    expect(result).not.toBeNull();
    expect(result!.headline).toContain("Plumbing");
  });

  it("skips overdue check for a service type with a recent job", () => {
    // All four annual service types serviced recently → no Overdue, falls through to seasonal
    const recentJobs: Job[] = [
      makeJob({ id: "j1", serviceType: "HVAC",       date: "2025-06-01" }),
      makeJob({ id: "j2", serviceType: "Plumbing",   date: "2025-05-01" }),
      makeJob({ id: "j3", serviceType: "Electrical", date: "2025-04-01" }),
      makeJob({ id: "j4", serviceType: "Roof",       date: "2025-03-01" }),
    ];
    const result = getWeeklyPulse([makeProperty()], recentJobs);
    // Should fall through to the seasonal tip for month 6 (June)
    expect(result).not.toBeNull();
    expect(result!.category).not.toBe("Overdue");
    expect(result!.headline).toBe("Clean dryer vents");
  });

  it("returns no jobs → Overdue immediately (no jobs at all)", () => {
    const result = getWeeklyPulse([makeProperty()], []);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("Overdue");
    // First annual service checked is HVAC
    expect(result!.headline).toContain("HVAC");
  });

  it("returns the seasonal tip for each month when no overdue services", () => {
    const recentJobs: Job[] = [
      makeJob({ id: "j1", serviceType: "HVAC",       date: "2025-06-01" }),
      makeJob({ id: "j2", serviceType: "Plumbing",   date: "2025-05-01" }),
      makeJob({ id: "j3", serviceType: "Electrical", date: "2025-04-01" }),
      makeJob({ id: "j4", serviceType: "Roof",       date: "2025-03-01" }),
    ];

    const expectedHeadlines: Record<number, string> = {
      1:  "Check your heating system filters",
      2:  "Inspect attic insulation",
      3:  "Schedule a roof inspection",
      4:  "Service your AC before summer",
      5:  "Flush your water heater",
      6:  "Clean dryer vents",
      7:  "Caulk windows and exterior gaps",
      8:  "Test smoke and CO detectors",
      9:  "Drain and winterize irrigation",
      10: "Chimney inspection before heating season",
      11: "Insulate exposed pipes",
      12: "Reverse ceiling fans for winter",
    };

    for (const [monthNum, headline] of Object.entries(expectedHeadlines)) {
      const m = Number(monthNum);
      // Set time to that month (day 15)
      vi.setSystemTime(new Date(`2025-${String(m).padStart(2, "0")}-15`).getTime());
      const result = getWeeklyPulse([makeProperty()], recentJobs);
      expect(result?.headline).toBe(headline);
    }
  });

  it("overdue detection uses case-insensitive substring match on serviceType", () => {
    // serviceType "hvac" (lowercase) should count as an HVAC record
    const lowercaseJob = makeJob({ serviceType: "hvac", date: "2025-06-01" });
    const result = getWeeklyPulse([makeProperty()], [lowercaseJob]);
    // HVAC is covered, so overdue check moves to Plumbing
    expect(result?.headline).not.toContain("HVAC");
  });

  it("overdue tip has non-empty headline and detail", () => {
    const result = getWeeklyPulse([makeProperty()], []);
    expect(result!.headline.length).toBeGreaterThan(0);
    expect(result!.detail.length).toBeGreaterThan(0);
  });
});
