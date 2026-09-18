/**
 * scoreDecayService — real logic worth locking down:
 *   - applyDecayFloor never lets score go below the floor
 *   - systemAgeDecayPts ramps 0 at <=80% life, up to 5 at 120%+ life
 *   - getWarrantyDecayEvents only fires for jobs whose warranty has lapsed
 *   - computeInactivityDecay applies the grace period and caps at max decay
 *   - computeMaintenanceGapDecay clamps to [0, MAX]
 *   - getAtRiskWarnings only includes events due within the lookahead window
 */

import { describe, it, expect } from "vitest";
import {
  applyDecayFloor, systemAgeDecayPts, getSystemAgeDecayEvents, warrantyExpiryMs,
  getWarrantyDecayEvents, computeInactivityDecay, getInactivityDecayEvent,
  computeMaintenanceGapDecay, getAllDecayEvents, getTotalDecay, getAtRiskWarnings,
  SCORE_DECAY_FLOOR, INACTIVITY_GRACE_MONTHS, INACTIVITY_MAX_DECAY, MAINTENANCE_GAP_MAX_DECAY,
} from "@/services/scoreDecayService";
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

describe("applyDecayFloor", () => {
  it("never lets the score fall below the floor", () => {
    expect(applyDecayFloor(10)).toBe(SCORE_DECAY_FLOOR);
    expect(applyDecayFloor(50)).toBe(50);
  });
});

describe("systemAgeDecayPts", () => {
  it("returns 0 at or below 80% of lifespan", () => {
    expect(systemAgeDecayPts(8, 15)).toBe(0); // 53%
    expect(systemAgeDecayPts(12, 15)).toBe(0); // 80%
  });

  it("ramps up between 80% and 120% of lifespan, capped at 5", () => {
    expect(systemAgeDecayPts(18, 15)).toBe(5); // 120%
    expect(systemAgeDecayPts(24, 15)).toBe(5); // 160%, still capped at 5
  });

  it("returns 0 for non-positive lifespan or negative age", () => {
    expect(systemAgeDecayPts(5, 0)).toBe(0);
    expect(systemAgeDecayPts(-1, 15)).toBe(0);
  });
});

describe("getSystemAgeDecayEvents", () => {
  it("only includes systems that have decayed past the threshold", () => {
    const events = getSystemAgeDecayEvents({ HVAC: 2000 }, 2024); // 24 yrs, lifespan 15 -> well past
    expect(events).toHaveLength(1);
    expect(events[0].category).toBe("SystemAge");
    expect(events[0].pts).toBeLessThan(0);
  });

  it("excludes systems with no decay", () => {
    const events = getSystemAgeDecayEvents({ HVAC: 2023 }, 2024);
    expect(events).toHaveLength(0);
  });
});

describe("warrantyExpiryMs / getWarrantyDecayEvents", () => {
  it("computes expiry as jobDate + warrantyMonths * 30 days", () => {
    const expiry = warrantyExpiryMs("2024-01-01", 12);
    expect(expiry).toBe(new Date("2024-01-01").getTime() + 12 * 30 * 86_400_000);
  });

  it("fires a decay event only for a lapsed warranty", () => {
    const lapsed = makeJob({ id: "j1", date: "2020-01-01", warrantyMonths: 12 });
    const active = makeJob({ id: "j2", date: "2024-01-01", warrantyMonths: 120 });
    const events = getWarrantyDecayEvents([lapsed, active], Date.now());
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("warranty-expired-j1");
  });
});

describe("computeInactivityDecay", () => {
  it("returns 0 when there are no verified jobs", () => {
    expect(computeInactivityDecay([makeJob({ verified: false, status: "pending" as any })], Date.now())).toBe(0);
  });

  it("returns 0 within the grace period", () => {
    const recentJob = makeJob({ date: new Date().toISOString().slice(0, 10) });
    expect(computeInactivityDecay([recentJob], Date.now())).toBe(0);
  });

  it("decays 1pt/month past grace, capped at INACTIVITY_MAX_DECAY", () => {
    const now = Date.now();
    const oldJob = makeJob({ date: new Date(now - (INACTIVITY_GRACE_MONTHS + 20) * 30 * 86_400_000).toISOString().slice(0, 10) });
    expect(computeInactivityDecay([oldJob], now)).toBe(INACTIVITY_MAX_DECAY);
  });
});

describe("getInactivityDecayEvent", () => {
  it("returns null when there's no inactivity decay", () => {
    expect(getInactivityDecayEvent([makeJob({ date: new Date().toISOString().slice(0, 10) })], Date.now())).toBeNull();
  });
});

describe("computeMaintenanceGapDecay", () => {
  it("clamps to [0, MAINTENANCE_GAP_MAX_DECAY]", () => {
    expect(computeMaintenanceGapDecay(-5)).toBe(0);
    expect(computeMaintenanceGapDecay(2)).toBe(2);
    expect(computeMaintenanceGapDecay(100)).toBe(MAINTENANCE_GAP_MAX_DECAY);
  });
});

describe("getAllDecayEvents / getTotalDecay", () => {
  it("combines all decay sources and sums their absolute pts", () => {
    const lapsed = makeJob({ id: "j1", date: "2020-01-01", warrantyMonths: 12 });
    const events = getAllDecayEvents([lapsed], { HVAC: 2000 }, Date.now(), 2);
    expect(events.length).toBeGreaterThanOrEqual(2); // warranty + system age + maintenance gap
    expect(getTotalDecay(events)).toBeGreaterThan(0);
  });

  it("returns 0 total decay for a fresh, active home", () => {
    const events = getAllDecayEvents([], {}, Date.now(), 0);
    expect(getTotalDecay(events)).toBe(0);
  });
});

describe("getAtRiskWarnings", () => {
  it("includes a warranty expiring within the lookahead window", () => {
    const now = Date.now();
    const job = makeJob({ date: new Date(now - 350 * 86_400_000).toISOString().slice(0, 10), warrantyMonths: 12 }); // expires in ~10 days
    const warnings = getAtRiskWarnings([job], {}, now, 30);
    expect(warnings.some((w) => w.id.startsWith("warranty-expiring"))).toBe(true);
  });

  it("excludes a warranty expiring beyond the lookahead window", () => {
    const now = Date.now();
    const job = makeJob({ date: new Date(now).toISOString().slice(0, 10), warrantyMonths: 24 }); // expires far in the future
    const warnings = getAtRiskWarnings([job], {}, now, 30);
    expect(warnings).toEqual([]);
  });
});
