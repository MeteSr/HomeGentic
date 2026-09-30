import { describe, it, expect } from "vitest";
import { buildSystemAnswer, matchSystemQuestion, SYSTEM_SERVICE_TYPE, type AnswerInput } from "@/components/dashboardV3/answerCards";
import { serviceTypeKey } from "@/services/serviceTypes";
import type { SystemEstimate } from "@/services/systemAgeEstimator";

describe("matchSystemQuestion", () => {
  it.each([
    ["Should I replace my water heater?", "Water Heater"],
    ["how long will the roof last", "Roofing"],
    ["Is my AC worth repairing?", "HVAC"],
    ["when should we replace the furnace", "HVAC"],
    ["how old are my windows", "Windows"],
    ["should i get new solar panels", "Solar Panels"],
  ])("%s → %s", (q, system) => {
    expect(matchSystemQuestion(q)).toBe(system);
  });

  it.each([
    "what's my score",          // no system
    "my roof",                   // a system but no decision
    "how much have I spent",     // decision-ish, no system
  ])("leaves %s to panel routing", (q) => {
    expect(matchSystemQuestion(q)).toBeNull();
  });
});

describe("SYSTEM_SERVICE_TYPE", () => {
  it("maps every system to a service type the quote canister accepts", () => {
    for (const serviceType of Object.values(SYSTEM_SERVICE_TYPE)) {
      expect(serviceTypeKey(serviceType)).toBeDefined();
    }
  });
});

const WATER_HEATER: SystemEstimate = {
  systemName: "Water Heater", installYear: 2000, ageYears: 26, lifespanYears: 12, percentLifeUsed: 217,
  yearsRemaining: -14, urgency: "Critical", replacementCostLow: 1200, replacementCostHigh: 3500,
};

function answerInput(overrides: Partial<AnswerInput> = {}): AnswerInput {
  return {
    system: WATER_HEATER, yearBuilt: 2000, zipCode: "78701",
    billInsights: [], hasBills: false, benchmark: null, proCount: null,
    ...overrides,
  };
}

describe("buildSystemAnswer", () => {
  it("answers from the forecast alone when nothing else is available", () => {
    const a = buildSystemAnswer(answerInput());
    expect(a.title).toBe("Your water heater is 26 years old and past its expected life");
    expect(a.verdict).toMatch(/^Plan the replacement now/);
    expect(a.serviceType).toBe("Plumbing");
    expect(a.installYearAssumed).toBe(true);
    expect(a.facts.map((f) => [f.label, f.value])).toEqual([
      ["Age", "26 years"],
      ["Replacement", "$1,200–$3,500"],
      ["Your bills", "Not tracked"],
    ]);
    expect(a.facts[0]).toMatchObject({ tone: "bad" });
    expect(a.facts[0].detail).toMatch(/assumed from the build year/);
    expect(a.sources).toEqual(["Ten-year forecast"]);
  });

  it("composes local prices, the owner's bill trend and the pro count", () => {
    const a = buildSystemAnswer(answerInput({
      system: { ...WATER_HEATER, installYear: 2012 },
      benchmark: { serviceType: "Plumbing", zipCode: "78701", low: 150_000, median: 240_000, high: 380_000, sampleSize: 12, lastUpdated: "2026-08" },
      billInsights: [{ type: "yoy", key: "utility:Gas", changePct: 18, recentCents: 1, priorCents: 1, months: 9 }],
      hasBills: true,
      proCount: 7,
    }));
    const byLabel = Object.fromEntries(a.facts.map((f) => [f.label, f]));
    expect(byLabel["Local prices"]).toMatchObject({ value: "$1,500–$3,800" });
    expect(byLabel["Local prices"].detail).toBe("12 closed Plumbing bids near 78701, median $2,400");
    expect(byLabel["Your bills"]).toMatchObject({ value: "Gas up 18%", tone: "warn" });
    expect(byLabel["Pros"]).toMatchObject({ value: "7" });
    expect(a.installYearAssumed).toBe(false);
    expect(a.sources).toEqual(["Ten-year forecast", "Local prices", "Your bills", "Contractor directory"]);
  });

  it("drops a price benchmark with too few samples to trust", () => {
    const a = buildSystemAnswer(answerInput({
      benchmark: { serviceType: "Plumbing", zipCode: "78701", low: 1, median: 2, high: 3, sampleSize: 2, lastUpdated: "2026-08" },
    }));
    expect(a.facts.some((f) => f.label === "Local prices")).toBe(false);
  });

  it("says bills are steady when they're tracked but show no change", () => {
    const a = buildSystemAnswer(answerInput({ hasBills: true }));
    expect(a.facts.find((f) => f.label === "Your bills")).toMatchObject({ value: "Steady", tone: "good" });
  });

  it("skips the bills fact for systems that don't show up in utility bills", () => {
    const a = buildSystemAnswer(answerInput({ system: { ...WATER_HEATER, systemName: "Roofing" } }));
    expect(a.facts.some((f) => f.label === "Your bills")).toBe(false);
  });

  it("tells a healthy system's owner no action is needed, and asks for service quotes", () => {
    const a = buildSystemAnswer(answerInput({
      system: { ...WATER_HEATER, systemName: "HVAC", ageYears: 3, installYear: 2023, yearsRemaining: 15, urgency: "Good" },
    }));
    expect(a.title).toBe("Your hvac is 3 years old with about 15 years left");
    expect(a.verdict).toBe("No action needed yet.");
    expect(a.quoteDescription).toMatch(/service and inspection quotes/);
  });
});
