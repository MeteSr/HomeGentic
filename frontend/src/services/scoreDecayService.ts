/**
 * Score Decay & Depreciation Engine (8.7)
 *
 * Models the forces that reduce a HomeFax score over time:
 *   8.7.1  System-age depreciation — systems aging past rated lifespan
 *   8.7.2  Warranty expiration     — coverage lapsing on logged jobs
 *   8.7.3  Maintenance gap penalty — critical tasks left overdue
 *   8.7.4  Inactivity decay        — no verified jobs for 6+ months
 *   8.7.7  At-risk warnings        — upcoming decay within N days
 *   8.7.8  Score floor             — score never falls below SCORE_DECAY_FLOOR
 */

import type { Job } from "./job";
import type { SystemAges, SystemName } from "./systemAges";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Rated lifespans in years per tracked system. */
export const SYSTEM_LIFESPANS: Record<SystemName, number> = {
  "HVAC":         15,
  "Roofing":      20,
  "Water Heater": 10,
  "Windows":      25,
  "Electrical":   40,
  "Plumbing":     50,
  "Flooring":     20,
  "Insulation":   30,
  "Solar Panels": 25,
};

export const SCORE_DECAY_FLOOR       = 30;
export const INACTIVITY_GRACE_MONTHS = 6;
export const INACTIVITY_MAX_DECAY    = 6;
export const MAINTENANCE_GAP_MAX_DECAY = 5;

const DAY_MS   = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

// ── Types ─────────────────────────────────────────────────────────────────────

export type DecayCategory = "Warranty" | "SystemAge" | "Inactivity" | "MaintenanceGap";

export interface DecayEvent {
  id:             string;
  label:          string;
  detail:         string;
  pts:            number;      // always ≤ 0
  timestamp:      number;      // ms since epoch when event became active
  category:       DecayCategory;
  recoveryPrompt: string;
}

export interface AtRiskWarning {
  id:            string;
  label:         string;
  pts:           number;       // future negative pts (e.g., -2)
  dueAt:         number;       // ms timestamp when penalty activates
  daysRemaining: number;
}

// ── 8.7.8 Score floor ─────────────────────────────────────────────────────────

/** Ensures the score never falls below `floor` (default: SCORE_DECAY_FLOOR). */
export function applyDecayFloor(score: number, floor = SCORE_DECAY_FLOOR): number {
  return Math.max(score, floor);
}

// ── 8.7.1 System-age depreciation ────────────────────────────────────────────

/**
 * Returns the positive number of pts to deduct for a system of the given age.
 *
 * Linear ramp: 0 pts at 80% of lifespan, 5 pts (max) at 120%+.
 * Each 8 percentage points above the 80% threshold adds 1 pt.
 */
export function systemAgeDecayPts(ageYears: number, lifespanYears: number): number {
  if (lifespanYears <= 0 || ageYears < 0) return 0;
  const pct = ageYears / lifespanYears;
  if (pct <= 0.8) return 0;
  return Math.min(Math.ceil((pct - 0.8) * 12.5), 5);
}

export function getSystemAgeDecayEvents(
  systemAges: SystemAges,
  currentYear: number,
): DecayEvent[] {
  const events: DecayEvent[] = [];
  for (const [system, installYear] of Object.entries(systemAges) as [SystemName, number][]) {
    const lifespan = SYSTEM_LIFESPANS[system];
    if (!lifespan || installYear == null) continue;
    const ageYears = currentYear - installYear;
    const pts = systemAgeDecayPts(ageYears, lifespan);
    if (pts > 0) {
      const safeId = system.replace(/ /g, "-").toLowerCase();
      events.push({
        id:             `system-age-${safeId}`,
        label:          `${system} — Age Depreciation`,
        detail:         `${system} is ${ageYears} yr${ageYears !== 1 ? "s" : ""} old (rated life: ${lifespan} yrs)`,
        pts:            -pts,
        timestamp:      Date.now(),
        category:       "SystemAge",
        recoveryPrompt: `Replace or upgrade your ${system} to restore ${pts} point${pts !== 1 ? "s" : ""}.`,
      });
    }
  }
  return events;
}

// ── 8.7.2 Warranty expiration events ─────────────────────────────────────────

/** Warranty expiry timestamp in ms (approx: 30 days per month). */
export function warrantyExpiryMs(jobDate: string, warrantyMonths: number): number {
  return new Date(jobDate).getTime() + warrantyMonths * MONTH_MS;
}

/** Returns -2 pt DecayEvent for each job whose warranty has already lapsed. */
export function getWarrantyDecayEvents(jobs: Job[], now: number): DecayEvent[] {
  const events: DecayEvent[] = [];
  for (const job of jobs) {
    if (!job.warrantyMonths || job.warrantyMonths <= 0) continue;
    const expiryMs = warrantyExpiryMs(job.date, job.warrantyMonths);
    if (expiryMs < now) {
      events.push({
        id:             `warranty-expired-${job.id}`,
        label:          `${job.serviceType} Warranty Expired`,
        detail:         `${job.serviceType} warranty expired — coverage no longer active`,
        pts:            -2,
        timestamp:      expiryMs,
        category:       "Warranty",
        recoveryPrompt: `Log a new ${job.serviceType} service to reestablish coverage and recover 2 pts.`,
      });
    }
  }
  return events;
}

// ── 8.7.4 Inactivity decay ────────────────────────────────────────────────────

/**
 * Returns how many pts to deduct for inactivity.
 * Grace period: INACTIVITY_GRACE_MONTHS. After that: -1 pt/month, capped at INACTIVITY_MAX_DECAY.
 * Returns 0 if there are no verified jobs at all (home has no history yet).
 */
export function computeInactivityDecay(jobs: Job[], now: number): number {
  const verified = jobs.filter((j) => j.verified || j.status === "verified");
  if (verified.length === 0) return 0;
  const lastMs    = Math.max(...verified.map((j) => new Date(j.date).getTime()));
  const monthsAgo = (now - lastMs) / MONTH_MS;
  if (monthsAgo <= INACTIVITY_GRACE_MONTHS) return 0;
  const decayMonths = Math.floor(monthsAgo - INACTIVITY_GRACE_MONTHS);
  return Math.min(decayMonths, INACTIVITY_MAX_DECAY);
}

export function getInactivityDecayEvent(jobs: Job[], now: number): DecayEvent | null {
  const pts = computeInactivityDecay(jobs, now);
  if (pts === 0) return null;
  const verified  = jobs.filter((j) => j.verified || j.status === "verified");
  const lastMs    = Math.max(...verified.map((j) => new Date(j.date).getTime()));
  const monthsAgo = Math.floor((now - lastMs) / MONTH_MS);
  return {
    id:             "inactivity-decay",
    label:          "No Recent Activity",
    detail:         `No verified jobs in ${monthsAgo} month${monthsAgo !== 1 ? "s" : ""} — score drifting`,
    pts:            -pts,
    timestamp:      now,
    category:       "Inactivity",
    recoveryPrompt: `Log a verified job to stop inactivity decay and recover up to ${pts} pt${pts !== 1 ? "s" : ""}.`,
  };
}

// ── 8.7.3 Maintenance gap penalty ─────────────────────────────────────────────

/**
 * Returns pts to deduct for overdue critical maintenance tasks.
 * -1 pt per overdue task, capped at MAINTENANCE_GAP_MAX_DECAY.
 */
export function computeMaintenanceGapDecay(overdueCount: number): number {
  return Math.min(Math.max(overdueCount, 0), MAINTENANCE_GAP_MAX_DECAY);
}

// ── Combined ──────────────────────────────────────────────────────────────────

/**
 * Returns all active decay events, sorted newest-first.
 * Pass `overdueTaskCount` from the maintenance canister when available.
 */
export function getAllDecayEvents(
  jobs: Job[],
  systemAges: SystemAges,
  now: number,
  overdueTaskCount = 0,
): DecayEvent[] {
  const currentYear = new Date(now).getFullYear();
  const events: DecayEvent[] = [
    ...getSystemAgeDecayEvents(systemAges, currentYear),
    ...getWarrantyDecayEvents(jobs, now),
  ];

  const inactivity = getInactivityDecayEvent(jobs, now);
  if (inactivity) events.push(inactivity);

  if (overdueTaskCount > 0) {
    const pts = computeMaintenanceGapDecay(overdueTaskCount);
    events.push({
      id:             "maintenance-gap",
      label:          "Overdue Maintenance Tasks",
      detail:         `${overdueTaskCount} critical task${overdueTaskCount !== 1 ? "s" : ""} overdue`,
      pts:            -pts,
      timestamp:      now,
      category:       "MaintenanceGap",
      recoveryPrompt: `Complete overdue maintenance tasks to recover ${pts} pt${pts !== 1 ? "s" : ""}.`,
    });
  }

  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/** Returns the total pts to subtract from the raw score (positive number). */
export function getTotalDecay(events: DecayEvent[]): number {
  return Math.abs(events.reduce((sum, e) => sum + e.pts, 0));
}

// ── 8.7.7 At-risk warnings ────────────────────────────────────────────────────

/**
 * Returns upcoming decay events that will activate within `lookaheadDays` days.
 * Use these to show the "Score at Risk" warning card on the Dashboard.
 */
export function getAtRiskWarnings(
  jobs: Job[],
  systemAges: SystemAges,
  now: number,
  lookaheadDays = 30,
): AtRiskWarning[] {
  const warnings: AtRiskWarning[] = [];
  const lookaheadMs = lookaheadDays * DAY_MS;

  // Upcoming warranty expirations
  for (const job of jobs) {
    if (!job.warrantyMonths || job.warrantyMonths <= 0) continue;
    const expiryMs = warrantyExpiryMs(job.date, job.warrantyMonths);
    if (expiryMs >= now && expiryMs <= now + lookaheadMs) {
      warnings.push({
        id:            `warranty-expiring-${job.id}`,
        label:         `${job.serviceType} Warranty Expiring`,
        pts:           -2,
        dueAt:         expiryMs,
        daysRemaining: Math.ceil((expiryMs - now) / DAY_MS),
      });
    }
  }

  // Upcoming inactivity threshold
  const verified = jobs.filter((j) => j.verified || j.status === "verified");
  if (verified.length > 0) {
    const lastMs     = Math.max(...verified.map((j) => new Date(j.date).getTime()));
    const graceEndMs = lastMs + INACTIVITY_GRACE_MONTHS * MONTH_MS;
    if (graceEndMs >= now && graceEndMs <= now + lookaheadMs) {
      warnings.push({
        id:            "inactivity-threshold",
        label:         "Inactivity Decay Approaching",
        pts:           -1,
        dueAt:         graceEndMs,
        daysRemaining: Math.ceil((graceEndMs - now) / DAY_MS),
      });
    }
  }

  return warnings.sort((a, b) => a.dueAt - b.dueAt);
}

// ── Styling helpers ───────────────────────────────────────────────────────────

export function decayCategoryColor(cat: DecayCategory): string {
  switch (cat) {
    case "Warranty":       return "#b45309"; // amber-700
    case "SystemAge":      return "#6b7280"; // gray-500
    case "Inactivity":     return "#3b4f6b"; // slate blue
    case "MaintenanceGap": return "#dc2626"; // red-600
  }
}

export function decayCategoryBg(cat: DecayCategory): string {
  switch (cat) {
    case "Warranty":       return "#fef3c7"; // amber-50
    case "SystemAge":      return "#f3f4f6"; // gray-50
    case "Inactivity":     return "#e8edf5"; // slate-50
    case "MaintenanceGap": return "#fee2e2"; // red-50
  }
}
