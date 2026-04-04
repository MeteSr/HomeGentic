/**
 * §17.7 — Public System Age Estimator
 *
 * Pure functions that power the unauthenticated /home-systems page.
 * Wraps predictMaintenance() with no-job-history to give a year-built
 * baseline estimate of each home system's current age and urgency.
 */

import { predictMaintenance } from "./maintenance";

export interface EstimatorInput {
  yearBuilt:    number;
  propertyType: string;
  state?:       string;
}

export interface SystemEstimate {
  systemName:          string;
  installYear:         number;
  ageYears:            number;
  lifespanYears:       number;
  percentLifeUsed:     number;
  yearsRemaining:      number;
  urgency:             "Critical" | "Soon" | "Watch" | "Good";
  replacementCostLow:  number;  // dollars
  replacementCostHigh: number;  // dollars
}

const CURRENT_YEAR = new Date().getFullYear();

/** Parse + validate URL search params for the estimator page.
 *  Returns null if yearBuilt is absent or invalid. */
export function parseEstimatorParams(params: URLSearchParams): EstimatorInput | null {
  const rawYear = params.get("yearBuilt");
  if (!rawYear) return null;

  const yearBuilt = parseInt(rawYear, 10);
  if (isNaN(yearBuilt) || yearBuilt < 1800 || yearBuilt > CURRENT_YEAR) return null;

  const propertyType = params.get("type") ?? "single-family";
  const state        = params.get("state") ?? undefined;

  return { yearBuilt, propertyType, state };
}

/** Build a shareable /home-systems URL from estimator inputs. */
export function buildEstimatorUrl(input: EstimatorInput): string {
  const p = new URLSearchParams({
    yearBuilt: String(input.yearBuilt),
    type:      input.propertyType,
  });
  if (input.state) p.set("state", input.state);
  return `/home-systems?${p.toString()}`;
}

/** Compute age estimates for all 9 tracked systems from year built alone. */
export function estimateSystems(yearBuilt: number, state?: string): SystemEstimate[] {
  const report = predictMaintenance(yearBuilt, [], {}, state);
  return report.systemPredictions.map((p) => ({
    systemName:          p.systemName,
    installYear:         yearBuilt,
    ageYears:            Math.max(0, CURRENT_YEAR - yearBuilt),
    lifespanYears:       p.yearsRemaining + Math.max(0, CURRENT_YEAR - yearBuilt),
    percentLifeUsed:     p.percentLifeUsed,
    yearsRemaining:      p.yearsRemaining,
    urgency:             p.urgency,
    replacementCostLow:  Math.round(p.estimatedCostLowCents  / 100),
    replacementCostHigh: Math.round(p.estimatedCostHighCents / 100),
  }));
}
