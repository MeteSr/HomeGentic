import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  applyDecayFloor,
  systemAgeDecayPts,
  getSystemAgeDecayEvents,
  warrantyExpiryMs,
  getWarrantyDecayEvents,
  computeInactivityDecay,
  getInactivityDecayEvent,
  computeMaintenanceGapDecay,
  getAllDecayEvents,
  getTotalDecay,
  getAtRiskWarnings,
  decayCategoryColor,
  decayCategoryBg,
  SCORE_DECAY_FLOOR,
  INACTIVITY_GRACE_MONTHS,
  INACTIVITY_MAX_DECAY,
  MAINTENANCE_GAP_MAX_DECAY,
  SYSTEM_LIFESPANS,
} from "@/services/scoreDecayService";
import type { Job } from "@/services/job";
import type { SystemAges } from "@/services/systemAges";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = new Date("2025-01-15").getTime();
const DAY_MS  = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id:               "j1",
    propertyId:       "p1",
    homeowner:        "principal-abc",
    serviceType:      "HVAC",
    description:      "HVAC service",
    amount:           240_000,
    date:             "2024-06-15",
    status:           "verified",
    verified:         true,
    isDiy:            false,
    warrantyMonths:   0,
    homeownerSigned:  true,
    contractorSigned: true,
    photos:           [],
    createdAt:        NOW,
    ...overrides,
  };
}

// ─── applyDecayFloor (8.7.8) ──────────────────────────────────────────────────

describe("applyDecayFloor", () => {
  it(`defaults to ${SCORE_DECAY_FLOOR}`, () => {
    expect(SCORE_DECAY_FLOOR).toBe(30);
  });

  it("returns score when above floor", () => {
    expect(applyDecayFloor(75)).toBe(75);
    expect(applyDecayFloor(31)).toBe(31);
  });

  it("returns floor when score is below it", () => {
    expect(applyDecayFloor(10)).toBe(SCORE_DECAY_FLOOR);
    expect(applyDecayFloor(0)).toBe(SCORE_DECAY_FLOOR);
  });

  it("returns floor when score equals floor", () => {
    expect(applyDecayFloor(SCORE_DECAY_FLOOR)).toBe(SCORE_DECAY_FLOOR);
  });

  it("accepts a custom floor", () => {
    expect(applyDecayFloor(20, 15)).toBe(20);
    expect(applyDecayFloor(10, 15)).toBe(15);
  });
});

// ─── systemAgeDecayPts (8.7.1) ───────────────────────────────────────────────

describe("systemAgeDecayPts", () => {
  it("returns 0 when age is below 80% of lifespan", () => {
    expect(systemAgeDecayPts(10, 15)).toBe(0); // HVAC: 10/15 = 67%
    expect(systemAgeDecayPts(12, 15)).toBe(0); // exactly 80%
  });

  it("starts penalizing above 80% threshold", () => {
    expect(systemAgeDecayPts(13, 15)).toBeGreaterThan(0); // 87%
  });

  it("returns 3 at 100% of lifespan (15yr HVAC at 15yr)", () => {
    // pct=1.0: (1.0 - 0.8) * 12.5 = 2.5 → round = 3
    expect(systemAgeDecayPts(15, 15)).toBe(3);
  });

  it("caps at 5 pts at 120%+ of lifespan", () => {
    expect(systemAgeDecayPts(18, 15)).toBe(5); // 120%
    expect(systemAgeDecayPts(25, 15)).toBe(5); // 167%, still capped
  });

  it("returns 0 for zero or negative lifespan", () => {
    expect(systemAgeDecayPts(10, 0)).toBe(0);
  });

  it("returns 0 for negative age", () => {
    expect(systemAgeDecayPts(-1, 15)).toBe(0);
  });

  it("covers all SYSTEM_LIFESPANS entries", () => {
    // Each lifespan should be a positive number
    for (const [, lifespan] of Object.entries(SYSTEM_LIFESPANS)) {
      expect(lifespan).toBeGreaterThan(0);
    }
  });
});

// ─── getSystemAgeDecayEvents (8.7.1) ─────────────────────────────────────────

describe("getSystemAgeDecayEvents", () => {
  it("returns empty array when no system ages set", () => {
    expect(getSystemAgeDecayEvents({}, 2025)).toEqual([]);
  });

  it("returns empty array when all systems are within threshold", () => {
    const ages: SystemAges = { HVAC: 2020 }; // 5yr old in 2025, lifespan=15 → 33%
    expect(getSystemAgeDecayEvents(ages, 2025)).toHaveLength(0);
  });

  it("emits an event for an overdue system", () => {
    // HVAC lifespan=15, install 2005 → age 20yr in 2025 → 133% → max 5pts
    const ages: SystemAges = { HVAC: 2005 };
    const events = getSystemAgeDecayEvents(ages, 2025);
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("SystemAge");
    expect(events[0].pts).toBeLessThan(0);
    expect(events[0].pts).toBeGreaterThanOrEqual(-5);
  });

  it("event id contains the system name", () => {
    const ages: SystemAges = { HVAC: 2005 };
    const [ev] = getSystemAgeDecayEvents(ages, 2025);
    expect(ev.id).toContain("hvac");
  });

  it("emits multiple events for multiple overdue systems", () => {
    const ages: SystemAges = { HVAC: 2005, "Water Heater": 2010 };
    // Water Heater lifespan=10, install 2010 → age 15yr in 2025 → 150% → capped at 5pts
    const events = getSystemAgeDecayEvents(ages, 2025);
    expect(events).toHaveLength(2);
  });

  it("includes a non-empty recoveryPrompt", () => {
    const ages: SystemAges = { HVAC: 2005 };
    const [ev] = getSystemAgeDecayEvents(ages, 2025);
    expect(ev.recoveryPrompt).toBeTruthy();
    expect(ev.recoveryPrompt).toContain("HVAC");
  });
});

// ─── warrantyExpiryMs ────────────────────────────────────────────────────────

describe("warrantyExpiryMs", () => {
  it("adds 12 × 30 days for a 12-month warranty", () => {
    const start = new Date("2024-01-01").getTime();
    const expiry = warrantyExpiryMs("2024-01-01", 12);
    expect(expiry).toBe(start + 12 * 30 * DAY_MS);
  });
});

// ─── getWarrantyDecayEvents (8.7.2) ──────────────────────────────────────────

describe("getWarrantyDecayEvents", () => {
  it("returns empty array when no jobs have warranties", () => {
    expect(getWarrantyDecayEvents([makeJob({ warrantyMonths: 0 })], NOW)).toEqual([]);
  });

  it("returns empty array when warranty has not yet expired", () => {
    // warranty started 6 months ago, 12-month term → still valid
    const sixMonthsAgo = new Date(NOW - 6 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ date: sixMonthsAgo, warrantyMonths: 12 });
    expect(getWarrantyDecayEvents([job], NOW)).toHaveLength(0);
  });

  it("emits a -2 pt event for an expired warranty", () => {
    // warranty started 24 months ago with 12-month term → expired 12 months ago
    const twoYearsAgo = new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ date: twoYearsAgo, warrantyMonths: 12 });
    const events = getWarrantyDecayEvents([job], NOW);
    expect(events).toHaveLength(1);
    expect(events[0].pts).toBe(-2);
    expect(events[0].category).toBe("Warranty");
  });

  it("emits one event per expired warranty", () => {
    const old = new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0];
    const jobs = [
      makeJob({ id: "j1", date: old, warrantyMonths: 12 }),
      makeJob({ id: "j2", date: old, warrantyMonths: 6 }),
    ];
    expect(getWarrantyDecayEvents(jobs, NOW)).toHaveLength(2);
  });

  it("does not emit events for jobs with warrantyMonths undefined", () => {
    const job = makeJob({ warrantyMonths: undefined });
    expect(getWarrantyDecayEvents([job], NOW)).toHaveLength(0);
  });

  it("event id contains the job id", () => {
    const old = new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ id: "j-abc", date: old, warrantyMonths: 12 });
    const [ev] = getWarrantyDecayEvents([job], NOW);
    expect(ev.id).toContain("j-abc");
  });
});

// ─── computeInactivityDecay (8.7.4) ──────────────────────────────────────────

describe("computeInactivityDecay", () => {
  it("returns 0 with no verified jobs", () => {
    expect(computeInactivityDecay([], NOW)).toBe(0);
  });

  it("returns 0 when last verified job is within grace period", () => {
    const job = makeJob({ date: new Date(NOW - 3 * MONTH_MS).toISOString().split("T")[0] });
    expect(computeInactivityDecay([job], NOW)).toBe(0);
  });

  it("returns 0 at exactly the grace period boundary", () => {
    const job = makeJob({ date: new Date(NOW - INACTIVITY_GRACE_MONTHS * MONTH_MS).toISOString().split("T")[0] });
    expect(computeInactivityDecay([job], NOW)).toBe(0);
  });

  it("returns 1 when 1 month past grace period (7 months inactive)", () => {
    const job = makeJob({ date: new Date(NOW - 7 * MONTH_MS).toISOString().split("T")[0] });
    expect(computeInactivityDecay([job], NOW)).toBe(1);
  });

  it("returns 3 when 3 months past grace period (9 months inactive)", () => {
    const job = makeJob({ date: new Date(NOW - 9 * MONTH_MS).toISOString().split("T")[0] });
    expect(computeInactivityDecay([job], NOW)).toBe(3);
  });

  it(`caps at ${INACTIVITY_MAX_DECAY} pts regardless of how long inactive`, () => {
    const job = makeJob({ date: new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0] });
    expect(computeInactivityDecay([job], NOW)).toBe(INACTIVITY_MAX_DECAY);
  });

  it("ignores unverified jobs when computing recency", () => {
    // recent unverified job + old verified job → decay based on old verified job
    const recentUnverified = makeJob({ id: "u", date: new Date(NOW - 1 * MONTH_MS).toISOString().split("T")[0], verified: false, status: "pending" });
    const oldVerified      = makeJob({ id: "v", date: new Date(NOW - 9 * MONTH_MS).toISOString().split("T")[0], verified: true,  status: "verified" });
    expect(computeInactivityDecay([recentUnverified, oldVerified], NOW)).toBe(3);
  });

  it("uses the most recent verified job when multiple exist", () => {
    const j1 = makeJob({ id: "j1", date: new Date(NOW - 9 * MONTH_MS).toISOString().split("T")[0] });
    const j2 = makeJob({ id: "j2", date: new Date(NOW - 2 * MONTH_MS).toISOString().split("T")[0] });
    expect(computeInactivityDecay([j1, j2], NOW)).toBe(0);
  });
});

// ─── getInactivityDecayEvent (8.7.4) ─────────────────────────────────────────

describe("getInactivityDecayEvent", () => {
  it("returns null when there is no decay", () => {
    const job = makeJob({ date: new Date(NOW - 2 * MONTH_MS).toISOString().split("T")[0] });
    expect(getInactivityDecayEvent([job], NOW)).toBeNull();
  });

  it("returns null with no jobs", () => {
    expect(getInactivityDecayEvent([], NOW)).toBeNull();
  });

  it("returns a DecayEvent when inactive past grace period", () => {
    const job = makeJob({ date: new Date(NOW - 9 * MONTH_MS).toISOString().split("T")[0] });
    const ev = getInactivityDecayEvent([job], NOW);
    expect(ev).not.toBeNull();
    expect(ev!.pts).toBe(-3);
    expect(ev!.category).toBe("Inactivity");
    expect(ev!.id).toBe("inactivity-decay");
  });

  it("includes a recovery prompt", () => {
    const job = makeJob({ date: new Date(NOW - 9 * MONTH_MS).toISOString().split("T")[0] });
    const ev = getInactivityDecayEvent([job], NOW)!;
    expect(ev.recoveryPrompt).toBeTruthy();
  });
});

// ─── computeMaintenanceGapDecay (8.7.3) ──────────────────────────────────────

describe("computeMaintenanceGapDecay", () => {
  it("returns 0 for zero overdue tasks", () => {
    expect(computeMaintenanceGapDecay(0)).toBe(0);
  });

  it("returns 1 pt per overdue task", () => {
    expect(computeMaintenanceGapDecay(1)).toBe(1);
    expect(computeMaintenanceGapDecay(3)).toBe(3);
  });

  it(`caps at ${MAINTENANCE_GAP_MAX_DECAY} pts`, () => {
    expect(computeMaintenanceGapDecay(MAINTENANCE_GAP_MAX_DECAY)).toBe(MAINTENANCE_GAP_MAX_DECAY);
    expect(computeMaintenanceGapDecay(10)).toBe(MAINTENANCE_GAP_MAX_DECAY);
  });

  it("handles negative input gracefully (treats as 0)", () => {
    expect(computeMaintenanceGapDecay(-1)).toBe(0);
  });
});

// ─── getAllDecayEvents ────────────────────────────────────────────────────────

describe("getAllDecayEvents", () => {
  it("returns empty array with no decay sources", () => {
    const job = makeJob({ date: new Date(NOW - 1 * MONTH_MS).toISOString().split("T")[0], warrantyMonths: 0 });
    expect(getAllDecayEvents([job], {}, NOW)).toEqual([]);
  });

  it("combines system-age, warranty, and inactivity events", () => {
    const oldWarrantyDate = new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0];
    const oldJobDate      = new Date(NOW - 9 * MONTH_MS).toISOString().split("T")[0];
    const ages: SystemAges = { HVAC: 2005 }; // very old
    const jobs = [
      makeJob({ id: "j1", date: oldWarrantyDate, warrantyMonths: 12 }),
      makeJob({ id: "j2", date: oldJobDate }),
    ];
    const events = getAllDecayEvents(jobs, ages, NOW);
    const categories = events.map((e) => e.category);
    expect(categories).toContain("SystemAge");
    expect(categories).toContain("Warranty");
    expect(categories).toContain("Inactivity");
  });

  it("includes a MaintenanceGap event when overdueTaskCount > 0", () => {
    const events = getAllDecayEvents([], {}, NOW, 3);
    const gap = events.find((e) => e.category === "MaintenanceGap");
    expect(gap).toBeDefined();
    expect(gap!.pts).toBe(-3);
  });

  it("returns events sorted newest-timestamp first", () => {
    const oldDate = new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0];
    const jobs = [makeJob({ id: "j1", date: oldDate, warrantyMonths: 12 })];
    const ages: SystemAges = { HVAC: 2005 };
    const events = getAllDecayEvents(jobs, ages, NOW);
    for (let i = 0; i < events.length - 1; i++) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i + 1].timestamp);
    }
  });

  it("all event pts are negative or zero", () => {
    const oldDate = new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0];
    const jobs = [makeJob({ id: "j1", date: oldDate, warrantyMonths: 12 })];
    const events = getAllDecayEvents(jobs, { HVAC: 2005 }, NOW, 2);
    for (const ev of events) {
      expect(ev.pts).toBeLessThanOrEqual(0);
    }
  });
});

// ─── getTotalDecay ────────────────────────────────────────────────────────────

describe("getTotalDecay", () => {
  it("returns 0 for empty event list", () => {
    expect(getTotalDecay([])).toBe(0);
  });

  it("sums the absolute values of all decay event pts", () => {
    const events = [
      { id: "a", label: "", detail: "", pts: -2, timestamp: 0, category: "Warranty" as const, recoveryPrompt: "" },
      { id: "b", label: "", detail: "", pts: -3, timestamp: 0, category: "Inactivity" as const, recoveryPrompt: "" },
    ];
    expect(getTotalDecay(events)).toBe(5);
  });
});

// ─── getAtRiskWarnings (8.7.7) ────────────────────────────────────────────────

describe("getAtRiskWarnings", () => {
  it("returns empty array when nothing is at risk", () => {
    const job = makeJob({ date: new Date(NOW - 1 * MONTH_MS).toISOString().split("T")[0], warrantyMonths: 0 });
    expect(getAtRiskWarnings([job], {}, NOW)).toEqual([]);
  });

  it("flags a warranty expiring within the lookahead window", () => {
    // Warranty started 11.5 months ago, 12-month term → expires in ~0.5 months (15 days) → within 30-day window
    const startDate = new Date(NOW - 11.5 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ date: startDate, warrantyMonths: 12 });
    const warnings = getAtRiskWarnings([job], {}, NOW);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].id).toContain("warranty-expiring");
    expect(warnings[0].pts).toBe(-2);
    expect(warnings[0].daysRemaining).toBeGreaterThan(0);
    expect(warnings[0].daysRemaining).toBeLessThanOrEqual(30);
  });

  it("does not flag a warranty expiring beyond the lookahead window", () => {
    // Warranty started 1 month ago, 12-month term → 11 months remaining → outside 30-day window
    const startDate = new Date(NOW - 1 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ date: startDate, warrantyMonths: 12 });
    expect(getAtRiskWarnings([job], {}, NOW)).toHaveLength(0);
  });

  it("does not flag an already-expired warranty", () => {
    const old = new Date(NOW - 24 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ date: old, warrantyMonths: 12 });
    expect(getAtRiskWarnings([job], {}, NOW)).toHaveLength(0);
  });

  it("flags approaching inactivity threshold", () => {
    // Last verified job was 5.5 months ago → grace ends in 0.5 months → within 30 days
    const date = new Date(NOW - 5.5 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ date });
    const warnings = getAtRiskWarnings([job], {}, NOW);
    const inactivity = warnings.find((w) => w.id === "inactivity-threshold");
    expect(inactivity).toBeDefined();
    expect(inactivity!.pts).toBe(-1);
  });

  it("returns warnings sorted by dueAt ascending (soonest first)", () => {
    // Two expiring warranties at different times
    const soon   = new Date(NOW - 11.9 * MONTH_MS).toISOString().split("T")[0];
    const later  = new Date(NOW - 11.1 * MONTH_MS).toISOString().split("T")[0];
    const jobs = [
      makeJob({ id: "j1", date: soon,  warrantyMonths: 12 }),
      makeJob({ id: "j2", date: later, warrantyMonths: 12 }),
    ];
    const warnings = getAtRiskWarnings(jobs, {}, NOW);
    const warrantyWarnings = warnings.filter((w) => w.id.startsWith("warranty"));
    if (warrantyWarnings.length >= 2) {
      expect(warrantyWarnings[0].dueAt).toBeLessThanOrEqual(warrantyWarnings[1].dueAt);
    }
  });

  it("accepts a custom lookaheadDays parameter", () => {
    // Warranty expires in ~15 days → within 20-day window, outside 10-day window
    const startDate = new Date(NOW - 11.5 * MONTH_MS).toISOString().split("T")[0];
    const job = makeJob({ date: startDate, warrantyMonths: 12 });
    expect(getAtRiskWarnings([job], {}, NOW, 20)).toHaveLength(1);
    expect(getAtRiskWarnings([job], {}, NOW, 10)).toHaveLength(0);
  });
});

// ─── Styling helpers ──────────────────────────────────────────────────────────

describe("decayCategoryColor / decayCategoryBg", () => {
  it("returns non-empty strings for all decay categories", () => {
    for (const cat of ["Warranty", "SystemAge", "Inactivity", "MaintenanceGap"] as const) {
      expect(decayCategoryColor(cat)).toBeTruthy();
      expect(decayCategoryBg(cat)).toBeTruthy();
    }
  });

  it("color and bg are different for each category", () => {
    for (const cat of ["Warranty", "SystemAge", "Inactivity", "MaintenanceGap"] as const) {
      expect(decayCategoryColor(cat)).not.toBe(decayCategoryBg(cat));
    }
  });
});
