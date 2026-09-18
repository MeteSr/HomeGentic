/**
 * maintenanceForecast (buildMaintenanceForecast) — real logic worth locking
 * down, using the real predictMaintenance() engine (pure, deterministic):
 *   - returns null when there are no properties
 *   - uses the first property when multiple are registered
 *   - converts cent costs to dollars and counts urgent/critical systems
 */

import { describe, it, expect } from "vitest";
import { buildMaintenanceForecast } from "@/services/maintenanceForecast";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 1970n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

describe("buildMaintenanceForecast", () => {
  it("returns null when there are no properties", () => {
    expect(buildMaintenanceForecast([], [])).toBeNull();
  });

  it("builds a forecast from the first property's yearBuilt and address", () => {
    const props = [
      makeProperty({ yearBuilt: 1960n, address: "1 Old St" }),
      makeProperty({ yearBuilt: 2020n, address: "2 New St" }),
    ];
    const forecast = buildMaintenanceForecast(props, []);

    expect(forecast).not.toBeNull();
    expect(forecast!.propertyAddress).toBe("1 Old St, Austin, TX");
    expect(forecast!.predictions.length).toBeGreaterThan(0);
  });

  it("counts urgentCount as Critical + Soon systems and lists critical system names", () => {
    const forecast = buildMaintenanceForecast([makeProperty({ yearBuilt: 1960n })], [] as Job[]);
    expect(forecast).not.toBeNull();

    const criticalCount = forecast!.predictions.filter((p) => p.urgency === "Critical").length;
    const soonCount = forecast!.predictions.filter((p) => p.urgency === "Soon").length;
    expect(forecast!.urgentCount).toBe(criticalCount + soonCount);
    expect(forecast!.criticalSystems).toHaveLength(criticalCount);
  });

  it("converts cent costs to whole dollars for both replacement and service call ranges", () => {
    const forecast = buildMaintenanceForecast([makeProperty({ yearBuilt: 1960n })], []);
    for (const p of forecast!.predictions) {
      expect(Number.isInteger(p.replacementCostLow)).toBe(true);
      expect(Number.isInteger(p.replacementCostHigh)).toBe(true);
      expect(Number.isInteger(p.serviceCallLow)).toBe(true);
      expect(Number.isInteger(p.serviceCallHigh)).toBe(true);
    }
    expect(Number.isInteger(forecast!.totalBudgetLow)).toBe(true);
    expect(Number.isInteger(forecast!.totalBudgetHigh)).toBe(true);
  });
});
