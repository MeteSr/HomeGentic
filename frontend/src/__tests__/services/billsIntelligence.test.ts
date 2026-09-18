/**
 * billsIntelligence — real logic worth locking down:
 *   - getUsageTrend filters bills to the given type and within the month
 *     window, sorted chronologically
 *   - analyzeEfficiencyTrend needs >=4 periods, flags degradation only when
 *     the late-half average usage rises more than 15% over the early half
 *   - findRebates only supports Electric bills
 *   - negotiateTelecom validates provider and amountCents before fetching
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetBillsForProperty } = vi.hoisted(() => ({ mockGetBillsForProperty: vi.fn() }));
vi.mock("@/services/billService", () => ({ billService: { getBillsForProperty: mockGetBillsForProperty } }));

import { getUsageTrend, analyzeEfficiencyTrend, findRebates, negotiateTelecom, type UsagePeriod } from "@/services/billsIntelligence";

beforeEach(() => vi.clearAllMocks());

function makeBill(overrides: Record<string, unknown> = {}) {
  return { billType: "Electric", usageAmount: 500, usageUnit: "kWh", periodStart: "2024-06-01", ...overrides };
}

describe("getUsageTrend", () => {
  it("filters to the requested bill type and excludes bills missing usage data", async () => {
    mockGetBillsForProperty.mockResolvedValue([
      makeBill({ billType: "Electric", periodStart: new Date().toISOString().slice(0, 10) }),
      makeBill({ billType: "Water", periodStart: new Date().toISOString().slice(0, 10) }),
      makeBill({ billType: "Electric", usageAmount: null, periodStart: new Date().toISOString().slice(0, 10) }),
    ]);
    const trend = await getUsageTrend("prop-1", "Electric", 6);
    expect(trend).toHaveLength(1);
  });

  it("excludes bills outside the requested month window", async () => {
    mockGetBillsForProperty.mockResolvedValue([makeBill({ periodStart: "2020-01-01" })]);
    const trend = await getUsageTrend("prop-1", "Electric", 3);
    expect(trend).toEqual([]);
  });

  it("sorts results chronologically", async () => {
    const now = new Date().toISOString().slice(0, 10);
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    mockGetBillsForProperty.mockResolvedValue([
      makeBill({ periodStart: now, usageAmount: 200 }),
      makeBill({ periodStart: twoMonthsAgo.toISOString().slice(0, 10), usageAmount: 100 }),
    ]);
    const trend = await getUsageTrend("prop-1", "Electric", 24);
    expect(trend[0].usageAmount).toBe(100);
  });
});

describe("analyzeEfficiencyTrend", () => {
  it("returns no degradation for fewer than 4 periods", () => {
    const periods: UsagePeriod[] = [{ periodStart: "2024-01-01", usageAmount: 100, usageUnit: "kWh" }];
    expect(analyzeEfficiencyTrend(periods)).toEqual({ degradationDetected: false });
  });

  it("flags degradation when late-half usage rises more than 15%", () => {
    const periods: UsagePeriod[] = [
      { periodStart: "1", usageAmount: 100, usageUnit: "kWh" }, { periodStart: "2", usageAmount: 100, usageUnit: "kWh" },
      { periodStart: "3", usageAmount: 150, usageUnit: "kWh" }, { periodStart: "4", usageAmount: 150, usageUnit: "kWh" },
    ];
    const result = analyzeEfficiencyTrend(periods);
    expect(result.degradationDetected).toBe(true);
    expect(result.estimatedAnnualWaste).toBeGreaterThan(0);
  });

  it("does not flag degradation for a rise of 15% or less", () => {
    const periods: UsagePeriod[] = [
      { periodStart: "1", usageAmount: 100, usageUnit: "kWh" }, { periodStart: "2", usageAmount: 100, usageUnit: "kWh" },
      { periodStart: "3", usageAmount: 110, usageUnit: "kWh" }, { periodStart: "4", usageAmount: 110, usageUnit: "kWh" },
    ];
    expect(analyzeEfficiencyTrend(periods).degradationDetected).toBe(false);
  });
});

describe("findRebates", () => {
  it("throws for non-Electric bill types", async () => {
    await expect(findRebates({ state: "TX", zipCode: "78701", utilityProvider: "Austin Energy", billType: "Water" as any })).rejects.toThrow(/only supports Electric/);
  });

  describe("with fetch mocked", () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

    it("returns rebates on a successful response", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ rebates: [{ name: "Solar Credit" }] }) });
      const rebates = await findRebates({ state: "TX", zipCode: "78701", utilityProvider: "Austin Energy", billType: "Electric" });
      expect(rebates).toEqual([{ name: "Solar Credit" }]);
    });

    it("throws when the response is not ok", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      await expect(findRebates({ state: "TX", zipCode: "78701", utilityProvider: "Austin Energy", billType: "Electric" })).rejects.toThrow(/failed: 500/);
    });
  });
});

describe("negotiateTelecom", () => {
  it("throws when provider is missing", async () => {
    await expect(negotiateTelecom({ provider: "", amountCents: 5000, mbps: 300, zipCode: "78701" })).rejects.toThrow(/Provider name is required/);
  });

  it("throws when amountCents is not a positive integer", async () => {
    await expect(negotiateTelecom({ provider: "Comcast", amountCents: 0, mbps: 300, zipCode: "78701" })).rejects.toThrow(/must be a positive integer/);
    await expect(negotiateTelecom({ provider: "Comcast", amountCents: 50.5, mbps: 300, zipCode: "78701" })).rejects.toThrow(/must be a positive integer/);
  });

  describe("with fetch mocked", () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

    it("returns the negotiation result on success", async () => {
      const mockResult = { verdict: "overpaying", medianCents: 5000, savingsOpportunityCents: 1000, negotiationScript: "Ask for a loyalty discount" };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockResult });
      const result = await negotiateTelecom({ provider: "Comcast", amountCents: 8000, mbps: 300, zipCode: "78701" });
      expect(result).toEqual(mockResult);
    });
  });
});
