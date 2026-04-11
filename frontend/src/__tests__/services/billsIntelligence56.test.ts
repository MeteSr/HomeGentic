/**
 * TDD — Epic #49 Stories 3–6 (Issue #56)
 *
 * Story 3 — System Efficiency Degradation Alerts
 *   getUsageTrend()        — filters + sorts bills into UsagePeriod[]
 *   analyzeEfficiencyTrend() — pure function; detects rising usage trend
 *
 * Story 4 — Rebate & Incentive Finder
 *   findRebates()          — shape + validation (fetch is mocked)
 *
 * Story 5 — Insurance Premium Triggers
 *   deriveEvents()         — water anomaly → insurance_trigger event emitted
 *
 * Story 6 — Telecom Negotiation Assistant
 *   negotiateTelecom()     — shape + validation (fetch is mocked)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  analyzeEfficiencyTrend,
  getUsageTrend,
  findRebates,
  negotiateTelecom,
  type UsagePeriod,
  type EfficiencyAnalysisResult,
  type RebateResult,
  type TelecomNegotiationResult,
} from "@/services/billsIntelligence";

import { deriveEvents } from "@/components/Layout";
import type { BillRecord } from "@/services/billService";

// ─── Story 3 — analyzeEfficiencyTrend (pure function) ────────────────────────

describe("analyzeEfficiencyTrend — Story 3", () => {
  it("returns degradationDetected:false when fewer than 3 periods provided", () => {
    const trend: UsagePeriod[] = [
      { periodStart: "2024-01-01", usageAmount: 800, usageUnit: "kWh" },
      { periodStart: "2024-02-01", usageAmount: 850, usageUnit: "kWh" },
    ];
    const result = analyzeEfficiencyTrend(trend);
    expect(result.degradationDetected).toBe(false);
  });

  it("returns degradationDetected:false for flat usage", () => {
    const trend: UsagePeriod[] = [
      { periodStart: "2024-01-01", usageAmount: 800, usageUnit: "kWh" },
      { periodStart: "2024-02-01", usageAmount: 810, usageUnit: "kWh" },
      { periodStart: "2024-03-01", usageAmount: 795, usageUnit: "kWh" },
    ];
    const result = analyzeEfficiencyTrend(trend);
    expect(result.degradationDetected).toBe(false);
  });

  it("returns degradationDetected:true when late usage is >15% above early usage", () => {
    // Early avg: 800, Late avg: 950 → +18.75% → degradation
    const trend: UsagePeriod[] = [
      { periodStart: "2024-01-01", usageAmount: 800, usageUnit: "kWh" },
      { periodStart: "2024-02-01", usageAmount: 810, usageUnit: "kWh" },
      { periodStart: "2024-03-01", usageAmount: 820, usageUnit: "kWh" },
      { periodStart: "2024-04-01", usageAmount: 940, usageUnit: "kWh" },
      { periodStart: "2024-05-01", usageAmount: 950, usageUnit: "kWh" },
      { periodStart: "2024-06-01", usageAmount: 960, usageUnit: "kWh" },
    ];
    const result = analyzeEfficiencyTrend(trend);
    expect(result.degradationDetected).toBe(true);
    expect(result.estimatedAnnualWaste).toBeGreaterThan(0);
    expect(typeof result.recommendation).toBe("string");
    expect(result.trendPct).toBeGreaterThan(15);
  });

  it("includes the usage unit in the recommendation text", () => {
    const trend: UsagePeriod[] = [
      { periodStart: "2024-01-01", usageAmount: 3000, usageUnit: "gallons" },
      { periodStart: "2024-02-01", usageAmount: 3050, usageUnit: "gallons" },
      { periodStart: "2024-03-01", usageAmount: 3060, usageUnit: "gallons" },
      { periodStart: "2024-04-01", usageAmount: 3600, usageUnit: "gallons" },
      { periodStart: "2024-05-01", usageAmount: 3650, usageUnit: "gallons" },
      { periodStart: "2024-06-01", usageAmount: 3700, usageUnit: "gallons" },
    ];
    const result = analyzeEfficiencyTrend(trend);
    expect(result.degradationDetected).toBe(true);
    expect(result.recommendation).toContain("gallons");
  });

  it("estimatedAnnualWaste = (lateAvg - earlyAvg) * 12", () => {
    // earlyAvg = 800, lateAvg = 960 → waste = 160/period × 12 = 1920
    const trend: UsagePeriod[] = [
      { periodStart: "2024-01-01", usageAmount: 800, usageUnit: "kWh" },
      { periodStart: "2024-02-01", usageAmount: 800, usageUnit: "kWh" },
      { periodStart: "2024-03-01", usageAmount: 960, usageUnit: "kWh" },
      { periodStart: "2024-04-01", usageAmount: 960, usageUnit: "kWh" },
    ];
    const result = analyzeEfficiencyTrend(trend);
    expect(result.degradationDetected).toBe(true);
    expect(result.estimatedAnnualWaste).toBeCloseTo(1920, 0);
  });
});

// ─── Story 3 — getUsageTrend ──────────────────────────────────────────────────

import { billService } from "@/services/billService";

describe("getUsageTrend — Story 3", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only bills with usageAmount for the given billType, sorted chronologically", async () => {
    vi.setSystemTime(new Date("2024-06-01"));
    vi.spyOn(billService, "getBillsForProperty").mockResolvedValue([
      { id: "1", billType: "Electric", periodStart: "2024-03-01", usageAmount: 900, usageUnit: "kWh", amountCents: 12000, propertyId: "p1", homeowner: "h", provider: "FPL", periodEnd: "2024-03-31", uploadedAt: 0, anomalyFlag: false },
      { id: "2", billType: "Electric", periodStart: "2024-01-01", usageAmount: 800, usageUnit: "kWh", amountCents: 11000, propertyId: "p1", homeowner: "h", provider: "FPL", periodEnd: "2024-01-31", uploadedAt: 0, anomalyFlag: false },
      { id: "3", billType: "Water",    periodStart: "2024-02-01", usageAmount: 2000, usageUnit: "gallons", amountCents: 4000, propertyId: "p1", homeowner: "h", provider: "TECO", periodEnd: "2024-02-28", uploadedAt: 0, anomalyFlag: false },
      { id: "4", billType: "Electric", periodStart: "2024-02-01", usageAmount: undefined, usageUnit: undefined, amountCents: 9000, propertyId: "p1", homeowner: "h", provider: "FPL", periodEnd: "2024-02-28", uploadedAt: 0, anomalyFlag: false },
    ] as any);

    const trend = await getUsageTrend("prop-1", "Electric", 6);

    // Only Electric bills with usageAmount, sorted by periodStart ascending
    expect(trend).toHaveLength(2);
    expect(trend[0].periodStart).toBe("2024-01-01");
    expect(trend[1].periodStart).toBe("2024-03-01");
    expect(trend[0].usageAmount).toBe(800);
    vi.useRealTimers();
  });

  it("limits to the requested number of months", async () => {
    const now = new Date("2024-06-01");
    vi.setSystemTime(now);

    vi.spyOn(billService, "getBillsForProperty").mockResolvedValue([
      // 8 months old — outside a 6-month window
      { id: "1", billType: "Electric", periodStart: "2023-10-01", usageAmount: 700, usageUnit: "kWh", amountCents: 9000, propertyId: "p1", homeowner: "h", provider: "FPL", periodEnd: "2023-10-31", uploadedAt: 0, anomalyFlag: false },
      { id: "2", billType: "Electric", periodStart: "2024-04-01", usageAmount: 900, usageUnit: "kWh", amountCents: 12000, propertyId: "p1", homeowner: "h", provider: "FPL", periodEnd: "2024-04-30", uploadedAt: 0, anomalyFlag: false },
      { id: "3", billType: "Electric", periodStart: "2024-05-01", usageAmount: 950, usageUnit: "kWh", amountCents: 13000, propertyId: "p1", homeowner: "h", provider: "FPL", periodEnd: "2024-05-31", uploadedAt: 0, anomalyFlag: false },
    ] as any);

    const trend = await getUsageTrend("prop-1", "Electric", 6);
    expect(trend.every((p) => p.periodStart >= "2023-12-01")).toBe(true);

    vi.useRealTimers();
  });
});

// ─── Story 4 — findRebates ────────────────────────────────────────────────────

describe("findRebates — Story 4", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an array of rebate objects with required fields", async () => {
    const mockRebates: RebateResult[] = [
      {
        name: "FPL Smart Thermostat Rebate",
        description: "Up to $75 rebate for smart thermostat installation",
        estimatedAmount: "$75",
        provider: "FPL",
        url: "https://fpl.com/rebates",
      },
    ];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ rebates: mockRebates }),
    } as any);

    const result = await findRebates({
      state: "FL",
      zipCode: "32801",
      utilityProvider: "FPL",
      billType: "Electric",
    });

    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toMatchObject({
      name: expect.any(String),
      description: expect.any(String),
      estimatedAmount: expect.any(String),
      provider: expect.any(String),
    });
  });

  it("throws when billType is not Electric", async () => {
    await expect(
      findRebates({ state: "FL", zipCode: "32801", utilityProvider: "TECO", billType: "Gas" })
    ).rejects.toThrow();
  });

  it("throws when server returns non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server error" }),
    } as any);

    await expect(
      findRebates({ state: "FL", zipCode: "32801", utilityProvider: "FPL", billType: "Electric" })
    ).rejects.toThrow();
  });
});

// ─── Story 5 — deriveEvents insurance_trigger ─────────────────────────────────

describe("deriveEvents — insurance_trigger (Story 5)", () => {
  const baseBill = (overrides: Partial<BillRecord>): BillRecord => ({
    id:           "b1",
    propertyId:   "prop-1",
    homeowner:    "principal-1",
    billType:     "Water",
    provider:     "TECO Water",
    periodStart:  "2024-05-01",
    periodEnd:    "2024-05-31",
    amountCents:  8000,
    uploadedAt:   Date.now(),
    anomalyFlag:  false,
    ...overrides,
  });

  it("emits an insurance_trigger event for a Water bill with anomalyFlag=true", () => {
    const bill = baseBill({ anomalyFlag: true, anomalyReason: "Bill is 35% above 3-month average" });
    const events = deriveEvents([], [], [], [bill]);
    const trigger = events.find((e) => e.type === "insurance_trigger");
    expect(trigger).toBeDefined();
    expect(trigger?.href).toBe("/insurance-defense");
  });

  it("does NOT emit insurance_trigger for non-Water anomaly bills", () => {
    const bill = baseBill({ billType: "Electric", anomalyFlag: true });
    const events = deriveEvents([], [], [], [bill]);
    const trigger = events.find((e) => e.type === "insurance_trigger");
    expect(trigger).toBeUndefined();
  });

  it("does NOT emit insurance_trigger for Water bill with no anomaly", () => {
    const bill = baseBill({ billType: "Water", anomalyFlag: false });
    const events = deriveEvents([], [], [], [bill]);
    const trigger = events.find((e) => e.type === "insurance_trigger");
    expect(trigger).toBeUndefined();
  });

  it("still emits a bill_anomaly event alongside the insurance_trigger for Water anomalies", () => {
    const bill = baseBill({ anomalyFlag: true });
    const events = deriveEvents([], [], [], [bill]);
    const anomaly = events.find((e) => e.type === "bill_anomaly");
    const trigger = events.find((e) => e.type === "insurance_trigger");
    expect(anomaly).toBeDefined();
    expect(trigger).toBeDefined();
  });
});

// ─── Story 6 — negotiateTelecom ───────────────────────────────────────────────

describe("negotiateTelecom — Story 6", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns verdict, medianCents, savingsOpportunityCents, and negotiationScript", async () => {
    const mockResult: TelecomNegotiationResult = {
      verdict: "overpaying",
      medianCents: 5500,
      savingsOpportunityCents: 2000,
      negotiationScript: "Call and say: 'I've been a loyal customer...'",
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResult,
    } as any);

    const result = await negotiateTelecom({
      provider:     "Spectrum",
      amountCents:  7500,
      mbps:         200,
      zipCode:      "32801",
    });

    expect(result.verdict).toBe("overpaying");
    expect(result.medianCents).toBeGreaterThan(0);
    expect(typeof result.negotiationScript).toBe("string");
    expect(result.savingsOpportunityCents).toBeGreaterThanOrEqual(0);
  });

  it("throws when provider is missing", async () => {
    await expect(
      negotiateTelecom({ provider: "", amountCents: 7500, mbps: 200, zipCode: "32801" })
    ).rejects.toThrow();
  });

  it("throws when amountCents is not a positive integer", async () => {
    await expect(
      negotiateTelecom({ provider: "Spectrum", amountCents: -100, mbps: 200, zipCode: "32801" })
    ).rejects.toThrow();
  });

  it("throws when server returns non-ok response", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Claude API error" }),
    } as any);

    await expect(
      negotiateTelecom({ provider: "Xfinity", amountCents: 8000, mbps: 300, zipCode: "90210" })
    ).rejects.toThrow();
  });
});
