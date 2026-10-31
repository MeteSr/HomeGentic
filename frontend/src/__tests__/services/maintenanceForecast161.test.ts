/**
 * TDD tests for §16.1 — Predictive Maintenance Intelligence
 *
 * Covers:
 *   - buildMaintenanceForecast() helper (16.1.1)
 *   - executeTool("get_maintenance_forecast", ...) (16.1.3)
 *   - Proactive alert data (criticalSystems) for 16.1.4
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Service mocks (for tool executor tests) ──────────────────────────────────

vi.mock("@/services/property", () => ({
  propertyService: {
    getMyProperties: vi.fn(),
    getAll:          vi.fn(),
  },
}));

vi.mock("@/services/job", () => ({
  jobService: {
    create:          vi.fn(),
    verifyJob:       vi.fn(),
    updateJobStatus: vi.fn(),
    getAll:          vi.fn(),
  },
}));

vi.mock("@/services/quote", () => ({
  quoteService: { createRequest: vi.fn() },
}));

vi.mock("@/services/contractor", () => ({
  contractorService: { search: vi.fn() },
}));

vi.mock("@/services/maintenance", async (importOriginal) => {
  // Keep the real predictMaintenance — it is pure and we want to test it
  const actual = await importOriginal<typeof import("@/services/maintenance")>();
  return {
    ...actual,
    maintenanceService: {
      createScheduleEntry: vi.fn(),
    },
  };
});

import { buildMaintenanceForecast } from "@/services/maintenanceForecast";
import { executeTool } from "@/services/agentTools";
import { propertyService } from "@/services/property";
import { jobService }      from "@/services/job";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<{
  yearBuilt: number; state: string; address: string; city: string; zipCode: string;
}> = {}) {
  return {
    id:                "prop-1",
    address:           overrides.address   ?? "123 Main St",
    city:              overrides.city      ?? "Austin",
    state:             overrides.state     ?? "TX",
    zipCode:           overrides.zipCode   ?? "78701",
    propertyType:      "SingleFamily" as const,
    yearBuilt:         BigInt(overrides.yearBuilt ?? 2000),
    squareFeet:        BigInt(2000),
    verificationLevel: "Unverified" as const,
    tier:              "Free" as const,
    owner:             "owner",
    createdAt:         BigInt(0),
    updatedAt:         BigInt(0),
    isActive:          true,
  };
}

function makeJob(serviceType: string, year: number) {
  return {
    id:               `job-${serviceType}-${year}`,
    propertyId:       "prop-1",
    serviceType,
    description:      "work done",
    amount:           100_000,
    date:             `${year}-06-01`,
    status:           "verified" as const,
    verified:         true,
    homeownerSigned:  true,
    contractorSigned: true,
    isDiy:            false,
    contractorName:   "Test Co",
    photos:           [],
    homeowner:        "owner",
    contractor:       undefined,
    createdAt:        0,
  };
}

beforeEach(() => vi.clearAllMocks());

// ─── buildMaintenanceForecast ─────────────────────────────────────────────────

describe("buildMaintenanceForecast", () => {
  it("returns null when no properties are provided", () => {
    expect(buildMaintenanceForecast([], [])).toBeNull();
  });

  it("returns a forecast with predictions for all tracked systems", () => {
    const result = buildMaintenanceForecast([makeProperty()], []);
    expect(result).not.toBeNull();
    expect(result!.predictions.length).toBeGreaterThanOrEqual(8);
    const names = result!.predictions.map((p) => p.systemName);
    expect(names).toContain("HVAC");
    expect(names).toContain("Roofing");
    expect(names).toContain("Water Heater");
  });

  it("sorts predictions Critical → Soon → Watch → Good", () => {
    // A house built in 1980 (45 years old) will have several Critical/Soon systems
    const result = buildMaintenanceForecast([makeProperty({ yearBuilt: 1980 })], []);
    const urgencyOrder = ["Critical", "Soon", "Watch", "Good"];
    let lastIndex = 0;
    for (const pred of result!.predictions) {
      const idx = urgencyOrder.indexOf(pred.urgency);
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
  });

  it("marks HVAC as Critical for a house built in 1980 (45 years old, lifespan 18)", () => {
    const result = buildMaintenanceForecast([makeProperty({ yearBuilt: 1980 })], []);
    const hvac = result!.predictions.find((p) => p.systemName === "HVAC")!;
    expect(hvac.urgency).toBe("Critical");
    expect(hvac.percentLifeUsed).toBeGreaterThanOrEqual(100);
  });

  it("marks HVAC as Good for a recently built house (2022)", () => {
    const result = buildMaintenanceForecast([makeProperty({ yearBuilt: 2022 })], []);
    const hvac = result!.predictions.find((p) => p.systemName === "HVAC")!;
    expect(hvac.urgency).toBe("Good");
    expect(hvac.yearsRemaining).toBeGreaterThan(10);
  });

  it("resets the clock for a system that has a recent job", () => {
    const currentYear = new Date().getFullYear();
    // House built in 1990, but HVAC was replaced last year
    const jobs = [makeJob("HVAC", currentYear - 1)];
    const result = buildMaintenanceForecast([makeProperty({ yearBuilt: 1990 })], jobs);
    const hvac = result!.predictions.find((p) => p.systemName === "HVAC")!;
    // Should be Good since it was just replaced
    expect(hvac.urgency).toBe("Good");
    expect(hvac.yearsRemaining).toBeGreaterThan(10);
  });

  it("applies hotHumid climate zone for FL properties (shorter HVAC lifespan)", () => {
    const txResult = buildMaintenanceForecast([makeProperty({ yearBuilt: 2000, state: "TX" })], []);
    const flResult = buildMaintenanceForecast([makeProperty({ yearBuilt: 2000, state: "FL" })], []);
    expect(flResult!.climateZone).toBe("Hot-Humid");
    // FL HVAC has 0.85 multiplier → shorter effective lifespan → higher % used
    const txHvac = txResult!.predictions.find((p) => p.systemName === "HVAC")!;
    const flHvac = flResult!.predictions.find((p) => p.systemName === "HVAC")!;
    expect(flHvac.percentLifeUsed).toBeGreaterThanOrEqual(txHvac.percentLifeUsed);
  });

  it("urgentCount equals the number of Critical + Soon systems", () => {
    const result = buildMaintenanceForecast([makeProperty({ yearBuilt: 1980 })], []);
    const expected = result!.predictions.filter(
      (p) => p.urgency === "Critical" || p.urgency === "Soon"
    ).length;
    expect(result!.urgentCount).toBe(expected);
  });

  it("criticalSystems lists only Critical system names (used for proactive alerts)", () => {
    const result = buildMaintenanceForecast([makeProperty({ yearBuilt: 1980 })], []);
    const criticalFromPredictions = result!.predictions
      .filter((p) => p.urgency === "Critical")
      .map((p) => p.systemName);
    expect(result!.criticalSystems).toEqual(criticalFromPredictions);
  });

  it("replacementCostLow and replacementCostHigh are in dollars, not cents", () => {
    const result = buildMaintenanceForecast([makeProperty()], []);
    const hvac = result!.predictions.find((p) => p.systemName === "HVAC")!;
    // HVAC replacement is $8,000–$15,000 — if cents were returned it'd be 800000+
    expect(hvac.replacementCostLow).toBeLessThan(100_000);
    expect(hvac.replacementCostLow).toBeGreaterThan(100);
  });

  it("totalBudgetLow/High covers only Critical and Soon systems (in dollars)", () => {
    const result = buildMaintenanceForecast([makeProperty({ yearBuilt: 1980 })], []);
    // Should be a non-zero dollar amount (not zero, not astronomically large cents)
    if (result!.urgentCount > 0) {
      expect(result!.totalBudgetLow).toBeGreaterThan(0);
      expect(result!.totalBudgetLow).toBeLessThan(500_000); // dollars, not cents
    }
  });

  it("propertyAddress is formatted as 'address, city, state'", () => {
    const result = buildMaintenanceForecast(
      [makeProperty({ address: "42 Elm St", city: "Denver", state: "CO" })],
      []
    );
    expect(result!.propertyAddress).toBe("42 Elm St, Denver, CO");
  });

  it("returns forecasts for multi-property users using the first property", () => {
    const prop1 = makeProperty({ yearBuilt: 1980, address: "100 Old St" });
    const prop2 = { ...makeProperty({ yearBuilt: 2020, address: "200 New St" }), id: "prop-2" };
    const result = buildMaintenanceForecast([prop1, prop2], []);
    // Should use the first property (1980 → more Critical systems)
    expect(result!.propertyAddress).toContain("100 Old St");
    expect(result!.urgentCount).toBeGreaterThan(0);
  });
});

// ─── executeTool — get_maintenance_forecast ───────────────────────────────────

describe("executeTool — get_maintenance_forecast", () => {
  const oldHouse = makeProperty({ yearBuilt: 1980 });
  const newHouse = makeProperty({ yearBuilt: 2022 });

  it("calls propertyService.getMyProperties and jobService.getAll", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([newHouse]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    await executeTool("get_maintenance_forecast", {});
    expect(propertyService.getMyProperties).toHaveBeenCalled();
    expect(jobService.getAll).toHaveBeenCalled();
  });

  it("returns a summary for a specific system_name", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([oldHouse]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    const result = await executeTool("get_maintenance_forecast", { system_name: "HVAC" });
    expect(result.success).toBe(true);
    expect(result.data?.systemName).toBe("HVAC");
    expect(result.data?.urgency).toBe("Critical");
    expect(typeof result.data?.yearsRemaining).toBe("number");
    expect(typeof result.data?.replacementCostLow).toBe("number");
    expect(String(result.data?.summary)).toMatch(/HVAC/i);
  });

  it("is case-insensitive for system_name lookup", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([oldHouse]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    const result = await executeTool("get_maintenance_forecast", { system_name: "hvac" });
    expect(result.success).toBe(true);
    expect(result.data?.systemName).toBe("HVAC");
  });

  it("returns a graceful message for an unknown system name", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([newHouse]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    const result = await executeTool("get_maintenance_forecast", { system_name: "Jacuzzi" });
    expect(result.success).toBe(true);
    expect(String(result.data?.summary)).toMatch(/no prediction found/i);
    // Should list available systems so Claude can rephrase
    expect(String(result.data?.summary)).toMatch(/HVAC/i);
  });

  it("returns top urgent systems when no system_name given", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([oldHouse]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    const result = await executeTool("get_maintenance_forecast", {});
    expect(result.success).toBe(true);
    expect((result.data!.systems as any[]).length).toBeGreaterThan(0);
    expect(result.data?.urgentCount).toBeGreaterThan(0);
  });

  it("returns an 'all good' summary when no urgent systems exist", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([newHouse]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    const result = await executeTool("get_maintenance_forecast", {});
    expect(result.success).toBe(true);
    expect(String(result.data?.summary)).toMatch(/good shape|no urgent/i);
  });

  it("returns a helpful message when no properties are registered", async () => {
    vi.mocked(propertyService.getMyProperties).mockResolvedValue([]);
    vi.mocked(jobService.getAll).mockResolvedValue([]);
    const result = await executeTool("get_maintenance_forecast", {});
    expect(result.success).toBe(true);
    expect(String(result.data?.summary)).toMatch(/no properties/i);
  });

  it("returns success:false when propertyService throws", async () => {
    vi.mocked(propertyService.getMyProperties).mockRejectedValue(new Error("Canister error"));
    const result = await executeTool("get_maintenance_forecast", {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Canister error/);
  });
});
