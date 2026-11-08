/**
 * #723: maintenance reserve target (services/maintenanceReserve.ts).
 *
 *  MR.1 the target is the replacement cost of every system due within five
 *       years (past-life ones included), spread over 60 months, as a low–high range
 *  MR.2 nothing due gives a zero target
 *  MR.3 actual spend counts only this calendar year's jobs
 *  MR.4 the copy says it's an estimate, not a quote or financial advice
 */
import { describe, it, expect } from "vitest";
import { maintenanceReserve, RESERVE_YEARS, RESERVE_NOTE } from "@/services/maintenanceReserve";
import type { SystemEstimate } from "@/services/systemAgeEstimator";
import type { Job } from "@/services/job";

const est = (systemName: string, yearsRemaining: number, low: number, high: number): SystemEstimate => ({
  systemName,
  installYear: 2000,
  ageYears: 26,
  lifespanYears: 26 + yearsRemaining,
  percentLifeUsed: 90,
  yearsRemaining,
  urgency: "Soon",
  replacementCostLow: low,
  replacementCostHigh: high,
});

const job = (date: string, amount: number): Job => ({ id: date, date, amount }) as unknown as Job;

const NOW = new Date(2026, 10, 8);

describe("maintenanceReserve", () => {
  it("MR.1 spreads five years of due replacements over 60 months", () => {
    const r = maintenanceReserve(
      [est("Roofing", -1, 12_000, 18_000), est("HVAC", 5, 6_000, 12_000), est("Plumbing", 6, 4_000, 9_000)],
      [],
      NOW,
    );
    expect(RESERVE_YEARS).toBe(5);
    expect(r.systemsDue).toEqual(["Roofing", "HVAC"]);
    expect(r.dueLow).toBe(18_000);
    expect(r.dueHigh).toBe(30_000);
    expect(r.monthlyLow).toBe(300);
    expect(r.monthlyHigh).toBe(500);
    expect(r.yearlyLow).toBe(3_600);
    expect(r.yearlyHigh).toBe(6_000);
  });

  it("MR.2 is zero when nothing is due within five years", () => {
    const r = maintenanceReserve([est("Plumbing", 12, 4_000, 9_000)], [], NOW);
    expect(r.systemsDue).toEqual([]);
    expect(r.monthlyLow).toBe(0);
    expect(r.monthlyHigh).toBe(0);
  });

  it("MR.3 counts only jobs dated this calendar year as actual spend", () => {
    const r = maintenanceReserve(
      [],
      [job("2026-01-02", 50_000), job("2026-10-31", 25_000), job("2025-12-31", 99_999)],
      NOW,
    );
    expect(r.spentThisYearCents).toBe(75_000);
    expect(r.year).toBe(2026);
  });

  it("MR.4 rounds monthly amounts to whole dollars and says what it is", () => {
    const r = maintenanceReserve([est("Water Heater", 2, 1_000, 1_999)], [], NOW);
    expect(r.monthlyLow).toBe(17);
    expect(r.monthlyHigh).toBe(33);
    expect(RESERVE_NOTE).toMatch(/estimate/i);
    expect(RESERVE_NOTE).toMatch(/not a quote/i);
    expect(RESERVE_NOTE).toMatch(/not financial advice/i);
  });
});
