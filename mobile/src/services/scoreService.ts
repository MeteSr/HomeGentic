/**
 * HomeGentic Score — the shared formula (@homegentic/shared/score), the same
 * one the web app and the market canister use:
 *
 *   maintenance coverage × 40 % + system modernization × 35 %
 *   + verification depth × 25 %
 *
 * minus the web app's decay: −2 per lapsed warranty, −1 per month past 6
 * months without a verified job (max 6), −1 per overdue maintenance task
 * (max 5); floor 30. Pure functions only, so they're easy to unit test.
 */
import type { Job } from "./jobService";
import type { Property } from "./propertyService";
import { serviceTypeLabel } from "@homegentic/shared/serviceTypes";
import { scoreBreakdown, weightedPoints, type ScoreJob } from "@homegentic/shared/score";

const DAY_MS   = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

export const SCORE_DECAY_FLOOR         = 30;
export const INACTIVITY_GRACE_MONTHS   = 6;
export const INACTIVITY_MAX_DECAY      = 6;
export const MAINTENANCE_GAP_MAX_DECAY = 5;

/** Points each part adds to the score. */
export interface ScoreBreakdown {
  maintenancePts:   number;   // of 40
  modernizationPts: number;   // of 35
  verificationPts:  number;   // of 25
  total:            number;
}

function toScoreJob(j: Job): ScoreJob {
  const year = parseInt((j.completedDate ?? "").slice(0, 4), 10);
  return {
    serviceType:   serviceTypeLabel(j.serviceType),
    completedYear: Number.isFinite(year) ? year : new Date().getFullYear(),
    amountCents:   j.amountCents,
    isDiy:         j.isDiy,
    isVerified:    j.verified,
  };
}

export function computeBreakdown(jobs: Job[], property: Property): ScoreBreakdown {
  if (jobs.length === 0) return { maintenancePts: 0, modernizationPts: 0, verificationPts: 0, total: 0 };
  const b = scoreBreakdown(jobs.map(toScoreJob), property.yearBuilt, new Date().getFullYear());
  return {
    maintenancePts:   weightedPoints(b.maintenance, "maintenance"),
    modernizationPts: weightedPoints(b.modernization, "modernization"),
    verificationPts:  weightedPoints(b.verification, "verification"),
    total:            b.total,
  };
}

export function rawScore(jobs: Job[], property: Property): number {
  return computeBreakdown(jobs, property).total;
}

function warrantyExpiryMs(job: Job): number | null {
  if (!job.warrantyMonths || job.warrantyMonths <= 0 || !job.completedDate) return null;
  return new Date(job.completedDate).getTime() + job.warrantyMonths * MONTH_MS;
}

function lastVerifiedMs(jobs: Job[]): number | null {
  const verified = jobs.filter((j) => j.verified && j.completedDate);
  if (!verified.length) return null;
  return Math.max(...verified.map((j) => new Date(j.completedDate).getTime()));
}

/** Points currently lost to decay (a positive number). */
export function decayPoints(jobs: Job[], now: number, overdueTasks = 0): number {
  let pts = 0;
  for (const j of jobs) {
    const exp = warrantyExpiryMs(j);
    if (exp != null && exp < now) pts += 2;
  }
  const last = lastVerifiedMs(jobs);
  if (last != null) {
    const monthsAgo = (now - last) / MONTH_MS;
    if (monthsAgo > INACTIVITY_GRACE_MONTHS) {
      pts += Math.min(Math.floor(monthsAgo - INACTIVITY_GRACE_MONTHS), INACTIVITY_MAX_DECAY);
    }
  }
  pts += Math.min(Math.max(overdueTasks, 0), MAINTENANCE_GAP_MAX_DECAY);
  return pts;
}

export function computeScore(jobs: Job[], property: Property, now = Date.now(), overdueTasks = 0): number {
  const raw   = rawScore(jobs, property);
  const decay = decayPoints(jobs, now, overdueTasks);
  if (decay === 0) return raw;
  // Same as the web: the floor only applies when decay would take the score below zero.
  return decay >= raw ? SCORE_DECAY_FLOOR : raw - decay;
}

export function getScoreGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

export interface AtRiskItem {
  label:         string;
  pts:           number;   // points that will be lost (positive)
  daysRemaining: number;
}

/** Decay that will start within `lookaheadDays` — the "Score at risk" card. */
export function getAtRisk(jobs: Job[], now: number, lookaheadDays = 30): AtRiskItem[] {
  const items: AtRiskItem[] = [];
  const horizon = now + lookaheadDays * DAY_MS;
  for (const j of jobs) {
    const exp = warrantyExpiryMs(j);
    if (exp != null && exp >= now && exp <= horizon) {
      items.push({ label: `${serviceTypeLabel(j.serviceType)} warranty expires`, pts: 2, daysRemaining: Math.ceil((exp - now) / DAY_MS) });
    }
  }
  const last = lastVerifiedMs(jobs);
  if (last != null) {
    const graceEnd = last + INACTIVITY_GRACE_MONTHS * MONTH_MS;
    if (graceEnd >= now && graceEnd <= horizon) {
      items.push({ label: "Inactivity decay starts", pts: 1, daysRemaining: Math.ceil((graceEnd - now) / DAY_MS) });
    }
  }
  return items.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * One sentence under the score: the single most useful next step and what
 * it's worth, worked out with the real formula.
 */
export function scoreHint(jobs: Job[], property: Property, now = Date.now(), overdueTasks = 0): string {
  const score = computeScore(jobs, property, now, overdueTasks);
  const unsigned = jobs.filter((j) => !j.verified);

  if (unsigned.length > 0) {
    const signed = jobs.map((j) => (j.verified ? j : { ...j, verified: true }));
    const target = computeScore(signed, property, now, overdueTasks);
    if (target > score) {
      return `${unsigned.length === 1 ? "One job is" : `${unsigned.length} jobs are`} waiting on a signature. Verifying ${unsigned.length === 1 ? "it" : "them"} moves you to ${target}.`;
    }
  }
  if (overdueTasks > 0) {
    const n = Math.min(overdueTasks, MAINTENANCE_GAP_MAX_DECAY);
    return `${overdueTasks === 1 ? "One maintenance task is" : `${overdueTasks} maintenance tasks are`} overdue. Completing ${overdueTasks === 1 ? "it" : "them"} recovers ${n} ${n === 1 ? "point" : "points"}.`;
  }
  if (jobs.length === 0) return "Log your first job to start building the record.";
  const missing = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows"]
    .find((sys) => !jobs.some((j) => serviceTypeLabel(j.serviceType) === sys));
  if (missing) {
    const withIt = [...jobs, { ...jobs[0], id: "hypothetical", serviceType: missing, amountCents: 0, verified: true, isDiy: false }];
    const gain = computeScore(withIt, property, now, overdueTasks) - score;
    if (gain > 0) return `${missing} has nothing on record yet. A verified ${missing} job adds ${gain} ${gain === 1 ? "point" : "points"}.`;
  }
  return "Your record covers every key system. Keep logging work as it happens.";
}
