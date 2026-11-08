/**
 * Maintenance reserve target (#723): what to set aside each month so the
 * replacements the forecast puts within the next five years are covered,
 * next to what was actually spent this year.
 *
 * Pure: works from the same SystemEstimate list as the dashboard's Forecast
 * panel (estimateSystems), so the two never disagree. It is an estimate from
 * system ages and typical costs, not a quote and not financial advice.
 */
import type { SystemEstimate } from "./systemAgeEstimator";
import type { Job } from "./job";

export const RESERVE_YEARS = 5;
const MONTHS = RESERVE_YEARS * 12;

export const RESERVE_NOTE =
  "An estimate from your systems' ages and typical replacement costs, not a quote and not financial advice.";

export interface MaintenanceReserve {
  /** Systems due within RESERVE_YEARS (past their rated life included), soonest first. */
  systemsDue: string[];
  dueLow: number; // dollars
  dueHigh: number; // dollars
  monthlyLow: number; // whole dollars
  monthlyHigh: number; // whole dollars
  yearlyLow: number; // whole dollars
  yearlyHigh: number; // whole dollars
  year: number;
  spentThisYearCents: number;
}

export function maintenanceReserve(
  estimates: SystemEstimate[],
  jobs: Job[],
  now: Date = new Date(),
): MaintenanceReserve {
  const due = estimates
    .filter((e) => e.yearsRemaining <= RESERVE_YEARS)
    .sort((a, b) => a.yearsRemaining - b.yearsRemaining);
  const dueLow = due.reduce((s, e) => s + e.replacementCostLow, 0);
  const dueHigh = due.reduce((s, e) => s + e.replacementCostHigh, 0);
  const monthlyLow = Math.round(dueLow / MONTHS);
  const monthlyHigh = Math.round(dueHigh / MONTHS);
  const year = now.getFullYear();
  const prefix = `${year}-`;
  const spentThisYearCents = jobs.filter((j) => j.date?.startsWith(prefix)).reduce((s, j) => s + j.amount, 0);
  return {
    systemsDue: due.map((e) => e.systemName),
    dueLow,
    dueHigh,
    monthlyLow,
    monthlyHigh,
    yearlyLow: monthlyLow * 12,
    yearlyHigh: monthlyHigh * 12,
    year,
    spentThisYearCents,
  };
}
