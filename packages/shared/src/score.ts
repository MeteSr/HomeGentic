/**
 * The HomeGentic Score — the one formula. Mirrors backend/shared/Score.mo,
 * which the market canister uses for certificates and the FSBO index, so the
 * number a homeowner sees is the number a buyer or lender sees. The test
 * vectors in frontend/src/__tests__/services/sharedScore.test.ts and
 * backend/shared/test/Score.test.mo are the same; change both together.
 *
 *   score = (maintenance × 40 + modernization × 35 + verification × 25) / 100
 *
 * Each dimension is 0–100:
 *   • Maintenance coverage — key systems with a job on record, weighted
 *     (HVAC 25, Roofing 25, Plumbing 15, Electrical 15, Windows 10, any other
 *     trade 10). A system earns its weight once, from its best job: verified
 *     100 %, DIY 80 %, anything else 50 %. Repeat jobs on one system add
 *     nothing, so many small jobs can't outweigh one major system.
 *   • System modernization — remaining life of each major system, weighted.
 *     A system's age counts from its most recent major job (at least the
 *     REPLACEMENT_MIN_CENTS for that system), else from the year built.
 *   • Verification depth — the share of jobs that are verified.
 *
 * Dependency-free: plain numbers in, plain numbers out.
 */

export interface ScoreJob {
  serviceType:   string;   // display label, e.g. "HVAC"
  completedYear: number;   // 4-digit year
  amountCents:   number;
  isDiy:         boolean;
  isVerified:    boolean;  // verified and not signed by an unverified contractor profile
}

export interface ScoreBreakdown {
  maintenance:   number;   // 0–100
  modernization: number;   // 0–100
  verification:  number;   // 0–100
  total:         number;   // 0–100
}

export const SCORE_WEIGHTS = { maintenance: 40, modernization: 35, verification: 25 } as const;

/** Maintenance-coverage weight per key system; "other" is any other trade. */
export const MAINTENANCE_SYSTEMS: ReadonlyArray<{ system: string; weight: number }> = [
  { system: "HVAC",       weight: 25 },
  { system: "Roofing",    weight: 25 },
  { system: "Plumbing",   weight: 15 },
  { system: "Electrical", weight: 15 },
  { system: "Windows",    weight: 10 },
  { system: "other",      weight: 10 },
];

/** Expected lifespan and modernization weight per major system. */
export const SYSTEM_LIFESPANS: ReadonlyArray<{ system: string; lifespanYears: number; weight: number }> = [
  { system: "HVAC",       lifespanYears: 18, weight: 25 },
  { system: "Roofing",    lifespanYears: 25, weight: 25 },
  { system: "Plumbing",   lifespanYears: 50, weight: 15 },
  { system: "Electrical", lifespanYears: 35, weight: 15 },
  { system: "Windows",    lifespanYears: 22, weight: 10 },
  { system: "Flooring",   lifespanYears: 25, weight: 10 },
];

/**
 * The smallest job that counts as replacing a system for modernization. A
 * $90 filter change is maintenance (it counts for coverage) but doesn't make
 * a 15-year-old furnace new.
 */
export const REPLACEMENT_MIN_CENTS: Readonly<Record<string, number>> = {
  HVAC:       300_000,
  Roofing:    500_000,
  Plumbing:   250_000,
  Electrical: 200_000,
  Windows:    250_000,
  Flooring:   200_000,
};

const NAMED_SYSTEMS = MAINTENANCE_SYSTEMS.filter((s) => s.system !== "other").map((s) => s.system);

/** Coverage factor out of 10 for one job: verified 10, DIY 8, else 5. */
function jobFactor(j: ScoreJob): number {
  return j.isVerified ? 10 : j.isDiy ? 8 : 5;
}

export function maintenanceScore(jobs: ScoreJob[]): number {
  let total = 0;
  for (const { system, weight } of MAINTENANCE_SYSTEMS) {
    const matching = jobs.filter((j) =>
      system === "other" ? !NAMED_SYSTEMS.includes(j.serviceType) : j.serviceType === system);
    if (matching.length === 0) continue;
    const best = Math.max(...matching.map(jobFactor));
    total += Math.floor((weight * best) / 10);
  }
  return total;
}

export function modernizationScore(jobs: ScoreJob[], yearBuilt: number, currentYear: number): number {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const { system, lifespanYears, weight } of SYSTEM_LIFESPANS) {
    totalWeight += weight;
    const min = REPLACEMENT_MIN_CENTS[system] ?? 0;
    let lastYear = yearBuilt;
    for (const j of jobs) {
      if (j.serviceType === system && j.amountCents >= min && j.completedYear > lastYear) lastYear = j.completedYear;
    }
    const age = Math.max(currentYear - lastYear, 0);
    const fraction = age >= lifespanYears ? 0 : Math.floor(((lifespanYears - age) * 100) / lifespanYears);
    weightedSum += weight * fraction;
  }
  return totalWeight === 0 ? 0 : Math.floor(weightedSum / totalWeight);
}

export function verificationDepth(jobs: ScoreJob[]): number {
  if (jobs.length === 0) return 0;
  return Math.floor((jobs.filter((j) => j.isVerified).length * 100) / jobs.length);
}

export function compositeScore(maintenance: number, modernization: number, verification: number): number {
  return Math.floor(
    (maintenance * SCORE_WEIGHTS.maintenance +
      modernization * SCORE_WEIGHTS.modernization +
      verification * SCORE_WEIGHTS.verification) / 100,
  );
}

/** The full breakdown for one property. */
export function scoreBreakdown(jobs: ScoreJob[], yearBuilt: number, currentYear: number): ScoreBreakdown {
  const maintenance   = maintenanceScore(jobs);
  const modernization = modernizationScore(jobs, yearBuilt, currentYear);
  const verification  = verificationDepth(jobs);
  return { maintenance, modernization, verification, total: compositeScore(maintenance, modernization, verification) };
}

/** How many of the composite's points one dimension contributes (for "N of 40 pts" labels). */
export function weightedPoints(dimensionScore: number, dimension: keyof typeof SCORE_WEIGHTS): number {
  return Math.floor((dimensionScore * SCORE_WEIGHTS[dimension]) / 100);
}
