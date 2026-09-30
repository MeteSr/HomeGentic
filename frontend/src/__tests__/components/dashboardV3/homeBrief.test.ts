import { describe, it, expect } from "vitest";
import { buildHomeBrief, greetingFor, MAX_BRIEF_ITEMS, type BriefInput } from "@/components/dashboardV3/homeBrief";
import type { SystemEstimate } from "@/services/systemAgeEstimator";

const NOW = new Date(2026, 8, 30, 19, 0, 0); // 7pm local

function input(overrides: Partial<BriefInput> = {}): BriefInput {
  return {
    now: NOW, pendingProposals: [], sensorAlerts: [], quoteRequests: [], bidCountMap: {}, jobs: [],
    recurringServices: [], visitLogMap: {}, atRiskWarnings: [], systems: [], billInsights: [],
    people: null, quotaExhausted: false,
    ...overrides,
  };
}

function system(overrides: Partial<SystemEstimate> = {}): SystemEstimate {
  return {
    systemName: "Water Heater", installYear: 2010, ageYears: 16, lifespanYears: 12, percentLifeUsed: 133,
    yearsRemaining: -4, urgency: "Critical", replacementCostLow: 1200, replacementCostHigh: 3500,
    ...overrides,
  };
}

describe("greetingFor", () => {
  it("greets by time of day", () => {
    expect(greetingFor(new Date(2026, 0, 1, 8))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 0, 1, 14))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 0, 1, 21))).toBe("Good evening");
  });
});

describe("buildHomeBrief", () => {
  it("says nothing needs you when the record is quiet", () => {
    const b = buildHomeBrief(input());
    expect(b.greeting).toBe("Good evening");
    expect(b.summary).toBe("Nothing needs you today.");
    expect(b.items).toEqual([]);
  });

  it("puts a sensor alert first, then approvals and bids", () => {
    const b = buildHomeBrief(input({
      sensorAlerts: [{ id: "e1", deviceId: "d", propertyId: "p", eventType: "WaterLeak", value: 1, unit: "", timestamp: 0, severity: "Critical" } as any],
      pendingProposals: [{ id: "j1" } as any, { id: "j2" } as any],
      quoteRequests: [{ id: "q1", status: "open", serviceType: "Roofing" } as any],
      bidCountMap: { q1: 3 },
    }));
    expect(b.items.map((i) => i.id)).toEqual(["sensor", "approvals", "bids"]);
    expect(b.items[0].text).toMatch(/water leak/);
    expect(b.items[1].text).toBe("2 jobs are waiting on your approval.");
    expect(b.items[2]).toMatchObject({ text: "3 bids are waiting on your roofing request.", flow: "bids" });
    expect(b.summary).toBe("3 things need you.");
  });

  it("flags a recurring visit due within a week, and ignores later ones", () => {
    const day = 86_400_000;
    const svc = (id: string, lastVisitDaysAgo: number) => ({
      id, serviceType: "Pest Control", providerName: "Bugs Co", frequency: "Monthly", status: "Active",
      startDate: new Date(NOW.getTime() - lastVisitDaysAgo * day).toISOString().slice(0, 10),
    } as any);
    const b = buildHomeBrief(input({ recurringServices: [svc("soon", 27), svc("later", 5)] }));
    expect(b.items).toHaveLength(1);
    expect(b.items[0]).toMatchObject({ id: "visit", go: "maint" });
    expect(b.items[0].text).toMatch(/^Pest Control with Bugs Co is due in [23] days\.$/);
  });

  it("names the system furthest past its life, with its replacement range", () => {
    const b = buildHomeBrief(input({
      systems: [system({ systemName: "Roofing", yearsRemaining: -1 }), system(), system({ systemName: "HVAC", urgency: "Good", yearsRemaining: 10 })],
    }));
    expect(b.items).toHaveLength(1);
    expect(b.items[0].text).toBe("Your water heater is 4 years past its expected life. Replacement runs $1,200–$3,500.");
    expect(b.items[0].go).toBe("forecast");
  });

  it("surfaces an upcoming housing payment and a utility rise from the bills forecast", () => {
    const b = buildHomeBrief(input({
      billInsights: [
        { type: "upcoming", key: "housing:PropertyTax", month: "2026-11", amountCents: 210_000 },
        { type: "yoy", key: "utility:Gas", changePct: 22, recentCents: 1, priorCents: 1, months: 8 },
        { type: "yoy", key: "utility:Water", changePct: 5, recentCents: 1, priorCents: 1, months: 8 },
      ],
    }));
    expect(b.items.map((i) => i.text)).toEqual([
      "Property Tax of $2,100 is due in November.",
      "Gas bills are up 22% on last year.",
    ]);
  });

  it(`shows at most ${MAX_BRIEF_ITEMS} items but counts everything actionable`, () => {
    const b = buildHomeBrief(input({
      sensorAlerts: [{ eventType: "HighHumidity" } as any],
      pendingProposals: [{ id: "j1" } as any],
      jobs: [{ id: "j", contractorName: "Ace", contractorSigned: false, serviceType: "HVAC" } as any],
      atRiskWarnings: [{ id: "w", label: "HVAC service", pts: -2, dueAt: 0, daysRemaining: 12 }],
      systems: [system()],
      people: [{ name: "Sam", isPending: true } as any],
    }));
    expect(b.items).toHaveLength(MAX_BRIEF_ITEMS);
    expect(b.summary).toBe("5 things need you.");
  });

  it("does not count informational items as needing you", () => {
    const b = buildHomeBrief(input({ quotaExhausted: true }));
    expect(b.items).toHaveLength(1);
    expect(b.summary).toBe("Nothing needs you today.");
  });
});
