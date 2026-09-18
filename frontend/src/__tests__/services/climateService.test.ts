/**
 * climateService — real logic worth locking down:
 *   - getZone maps known zip prefixes to their NOAA climate zone, and falls
 *     back to zone 4 for unmapped prefixes
 *   - getSeason maps month index (0-based) to a season
 *   - getSeasonalPriorities returns the zone/season list, falling back to
 *     zone 4's list when zone is out of the 1-8 range
 */

import { describe, it, expect } from "vitest";
import { climateService } from "@/services/climateService";

describe("climateService.getZone", () => {
  it("maps a known zip prefix to its climate zone", () => {
    expect(climateService.getZone("33101").zone).toBe(1); // Miami — Very Hot-Humid
    expect(climateService.getZone("59901").zone).toBe(6); // Montana — Very Cold
  });

  it("falls back to zone 4 for an unmapped prefix", () => {
    expect(climateService.getZone("00000").zone).toBe(4);
  });
});

describe("climateService.getSeason", () => {
  it("maps month indices to the correct season", () => {
    expect(climateService.getSeason(11)).toBe("winter"); // Dec
    expect(climateService.getSeason(0)).toBe("winter");  // Jan
    expect(climateService.getSeason(2)).toBe("spring");  // Mar
    expect(climateService.getSeason(6)).toBe("summer");  // Jul
    expect(climateService.getSeason(9)).toBe("fall");    // Oct
  });

  it("defaults to the current date's month when none is passed", () => {
    const season = climateService.getSeason();
    expect(["winter", "spring", "summer", "fall"]).toContain(season);
  });
});

describe("climateService.getSeasonalPriorities", () => {
  it("returns the zone-specific priority list", () => {
    const priorities = climateService.getSeasonalPriorities(1, "summer");
    expect(priorities).toContain("AC filter replacement (monthly)");
  });

  it("clamps an out-of-range zone to the nearest valid zone", () => {
    const clampedHigh = climateService.getSeasonalPriorities(99, "winter");
    const zone8 = climateService.getSeasonalPriorities(8, "winter");
    expect(clampedHigh).toEqual(zone8);

    const clampedLow = climateService.getSeasonalPriorities(-5, "winter");
    const zone1 = climateService.getSeasonalPriorities(1, "winter");
    expect(clampedLow).toEqual(zone1);
  });
});
