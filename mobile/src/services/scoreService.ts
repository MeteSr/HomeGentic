/**
 * HomeGentic Score — the same rubric and decay rules as the web app
 * (frontend/src/services/scoreService.ts and scoreDecayService.ts):
 *
 *   • Verified jobs  – 4 pts each, max 40
 *   • Total value    – 1 pt per $2,500, max 20
 *   • Verification   – Premium 10, Basic 5 (max 20)
 *   • Job diversity  – 4 pts per service type, max 20
 *
 * minus decay: −2 per lapsed warranty, −1 per month past 6 months without a
 * verified job (max 6), −1 per overdue maintenance task (max 5); floor 30.
 * Pure functions only, so they're easy to unit test.
 */
import type { Job } from "./jobService";
import type { Property } from "./propertyService";
import { serviceTypeLabel } from "./serviceTypes";

const DAY_MS   = 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * DAY_MS;

export const SCORE_DECAY_FLOOR         = 30;
export const INACTIVITY_GRACE_MONTHS   = 6;
export const INACTIVITY_MAX_DECAY      = 6;
export const MAINTENANCE_GAP_MAX_DECAY = 5;

export interface ScoreBreakdown {
  verifiedJobPts:  number;
  valuePts:        number;
  verificationPts: number;
  diversityPts:    number;
}

export function computeBreakdown(jobs: Job[], property: Property): ScoreBreakdown {
  const verifiedJobPts = Math.min(jobs.filter((j) => j.verified).length * 4, 40);
  const valuePts       = Math.min(Math.floor(jobs.reduce((s, j) => s + j.amountCents, 0) / 100 / 2500), 20);
  const verificationPts =
    property.verificationLevel === "Premium" ? 10 :
    property.verificationLevel === "Basic"   ? 5  : 0;
  const diversityPts   = Math.min(new Set(jobs.map((j) => j.serviceType)).size * 4, 20);
  return { verifiedJobPts, valuePts, verificationPts, diversityPts };
}

export function rawScore(jobs: Job[], property: Property): number {
  const b = computeBreakdown(jobs, property);
  return Math.min(b.verifiedJobPts + b.valuePts + b.verificationPts + b.diversityPts, 100);
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
 * it's worth.
 */
export function scoreHint(jobs: Job[], property: Property, now = Date.now(), overdueTasks = 0): string {
  const score = computeScore(jobs, property, now, overdueTasks);
  const unsigned = jobs.filter((j) => !j.verified).length;
  const b = computeBreakdown(jobs, property);

  if (unsigned > 0 && b.verifiedJobPts < 40) {
    const gain = Math.min(unsigned * 4, 40 - b.verifiedJobPts);
    const target = Math.min(score + gain, 100);
    return `${unsigned === 1 ? "One job is" : `${unsigned} jobs are`} waiting on a signature. Verifying ${unsigned === 1 ? "it" : "them"} moves you to ${target}.`;
  }
  if (overdueTasks > 0) {
    const n = Math.min(overdueTasks, MAINTENANCE_GAP_MAX_DECAY);
    return `${overdueTasks === 1 ? "One maintenance task is" : `${overdueTasks} maintenance tasks are`} overdue. Completing ${overdueTasks === 1 ? "it" : "them"} recovers ${n} ${n === 1 ? "point" : "points"}.`;
  }
  if (property.verificationLevel !== "Premium") {
    return property.verificationLevel === "Basic"
      ? "Verify ownership with a deed or tax record to reach Premium and add 5 points."
      : "Verify ownership to add up to 10 points.";
  }
  if (jobs.length === 0) return "Log your first job to start building the record.";
  return "Your record is complete. Keep logging work as it happens.";
}
