/**
 * TDD — 8.1.2: Climate Zone Data Integration
 *
 * Maps zip code → NOAA climate zone (1–8) and derives season/maintenance context.
 */

import { describe, it, expect } from "vitest";
import {
  climateService,
  type ClimateZone,
  CLIMATE_ZONES,
} from "@/services/climateService";

// ── Zone lookup ───────────────────────────────────────────────────────────────

describe("climateService.getZone", () => {
  it("returns zone 1 for a Miami FL zip (very hot-humid)", () => {
    const z = climateService.getZone("33101");
    expect(z.zone).toBe(1);
  });

  it("returns zone 5 for a Chicago IL zip (cold)", () => {
    const z = climateService.getZone("60601");
    expect(z.zone).toBe(5);
  });

  it("returns zone 3 for an Austin TX zip (hot-mixed)", () => {
    const z = climateService.getZone("78701");
    expect(z.zone).toBe(3);
  });

  it("returns zone 6 for a Minneapolis MN zip (very cold)", () => {
    const z = climateService.getZone("55401");
    expect(z.zone).toBe(6);
  });

  it("returns zone 4 for a Charlotte NC zip (mixed-humid)", () => {
    const z = climateService.getZone("28201");
    expect(z.zone).toBe(4);
  });

  it("returns zone 2 for a Houston TX zip (hot-humid)", () => {
    const z = climateService.getZone("77001");
    expect(z.zone).toBe(2);
  });

  it("falls back to zone 4 for unknown zip", () => {
    const z = climateService.getZone("00000");
    expect(z.zone).toBe(4);
  });

  it("zone object includes a label", () => {
    const z = climateService.getZone("78701");
    expect(typeof z.label).toBe("string");
    expect(z.label.length).toBeGreaterThan(0);
  });

  it("zone object includes a description", () => {
    const z = climateService.getZone("78701");
    expect(typeof z.description).toBe("string");
  });
});

// ── Season detection ──────────────────────────────────────────────────────────

describe("climateService.getSeason", () => {
  it("returns winter for January", () => {
    expect(climateService.getSeason(0)).toBe("winter");
  });

  it("returns spring for April", () => {
    expect(climateService.getSeason(3)).toBe("spring");
  });

  it("returns summer for July", () => {
    expect(climateService.getSeason(6)).toBe("summer");
  });

  it("returns fall for October", () => {
    expect(climateService.getSeason(9)).toBe("fall");
  });

  it("returns winter for December", () => {
    expect(climateService.getSeason(11)).toBe("winter");
  });

  it("uses current month when no argument passed", () => {
    const season = climateService.getSeason();
    expect(["winter", "spring", "summer", "fall"]).toContain(season);
  });
});

// ── Seasonal maintenance priorities ──────────────────────────────────────────

describe("climateService.getSeasonalPriorities", () => {
  it("returns an array of priority strings", () => {
    const p = climateService.getSeasonalPriorities(3, "winter");
    expect(Array.isArray(p)).toBe(true);
    expect(p.length).toBeGreaterThan(0);
    p.forEach((item) => expect(typeof item).toBe("string"));
  });

  it("winter priorities for cold zone include heating-system checks", () => {
    const p = climateService.getSeasonalPriorities(5, "winter");
    expect(p.some((s) => /heat|furnace|boiler/i.test(s))).toBe(true);
  });

  it("summer priorities for hot zone include AC / cooling checks", () => {
    const p = climateService.getSeasonalPriorities(2, "summer");
    expect(p.some((s) => /ac|air.?condition|cool/i.test(s))).toBe(true);
  });

  it("spring priorities include HVAC filter or gutter maintenance", () => {
    const p = climateService.getSeasonalPriorities(4, "spring");
    expect(p.some((s) => /filter|gutter|hvac|inspect/i.test(s))).toBe(true);
  });

  it("fall priorities include weatherization or heating prep", () => {
    const p = climateService.getSeasonalPriorities(5, "fall");
    expect(p.some((s) => /weather|heat|furnace|seal|insul/i.test(s))).toBe(true);
  });
});

// ── CLIMATE_ZONES export ──────────────────────────────────────────────────────

describe("CLIMATE_ZONES constant", () => {
  it("has 8 entries (zones 1–8)", () => {
    expect(Object.keys(CLIMATE_ZONES).length).toBe(8);
  });

  it("each entry has zone, label, description", () => {
    for (const z of Object.values(CLIMATE_ZONES) as ClimateZone[]) {
      expect(typeof z.zone).toBe("number");
      expect(typeof z.label).toBe("string");
      expect(typeof z.description).toBe("string");
    }
  });
});
