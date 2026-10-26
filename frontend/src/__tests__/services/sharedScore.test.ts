/**
 * The shared score formula (packages/shared/src/score.ts). Same vectors as
 * backend/shared/test/Score.test.mo: the web app and the canisters must give
 * every home the same score, so change both files together.
 */
import { describe, it, expect } from "vitest";
import { scoreBreakdown, maintenanceScore, type ScoreJob } from "@homegentic/shared/score";

const j = (serviceType: string, completedYear: number, amountCents: number, isDiy: boolean, isVerified: boolean): ScoreJob =>
  ({ serviceType, completedYear, amountCents, isDiy, isVerified });

describe("shared score vectors", () => {
  it("no jobs: only the age of the house counts", () => {
    expect(scoreBreakdown([], 2000, 2026)).toEqual({ maintenance: 0, modernization: 10, verification: 0, total: 3 });
  });

  it("100 verified filter changes cover HVAC once and replace nothing", () => {
    const filters = Array.from({ length: 100 }, () => j("HVAC", 2025, 9_000, false, true));
    expect(scoreBreakdown(filters, 2000, 2026)).toEqual({ maintenance: 25, modernization: 10, verification: 100, total: 38 });
  });

  it("one verified $14k roof outscores them", () => {
    expect(scoreBreakdown([j("Roofing", 2025, 1_400_000, false, true)], 2000, 2026))
      .toEqual({ maintenance: 25, modernization: 34, verification: 100, total: 46 });
  });

  it("mixed: verified, DIY, unverified, and an other trade", () => {
    expect(scoreBreakdown([
      j("HVAC", 2020, 800_000, false, true),
      j("Plumbing", 2023, 30_000, true, false),
      j("Electrical", 2022, 250_000, false, false),
      j("Painting", 2024, 150_000, false, true),
    ], 1995, 2026)).toEqual({ maintenance: 54, modernization: 35, verification: 50, total: 46 });
  });

  it("a well-kept newer home", () => {
    expect(scoreBreakdown([
      j("HVAC", 2024, 900_000, false, true),
      j("Roofing", 2023, 1_600_000, false, true),
      j("Plumbing", 2022, 400_000, false, true),
      j("Electrical", 2024, 300_000, false, true),
      j("Windows", 2021, 1_200_000, false, true),
      j("Flooring", 2023, 600_000, false, true),
      j("Painting", 2024, 300_000, true, true),
    ], 2015, 2026)).toEqual({ maintenance: 100, modernization: 88, verification: 100, total: 95 });
  });

  it("best job per system wins, whatever the order", () => {
    expect(maintenanceScore([j("HVAC", 2020, 100, false, false), j("HVAC", 2021, 100, false, true)])).toBe(25);
  });
});
