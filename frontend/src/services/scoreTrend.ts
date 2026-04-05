/**
 * §16.3 — Score Trend & Milestone Coaching
 *
 * Pure functions — no canister calls, no localStorage access.
 * The caller (useVoiceAgent.ts) passes pre-fetched history and breakdown in.
 */

import type { Job } from "./job";
import type { ScoreBreakdown, ScoreSnapshot } from "./scoreService";
import { scoreDelta } from "./scoreService";

// ─── Milestones ───────────────────────────────────────────────────────────────

export interface Milestone {
  score: number;
  label: string;
}

export const MILESTONES: Milestone[] = [
  { score: 50, label: "Grade D" },
  { score: 60, label: "Grade C" },
  { score: 70, label: "Grade B" },
  { score: 80, label: "Grade A" },
  { score: 88, label: "HomeGentic Certified™" },
  { score: 90, label: "Grade A+" },
];

const COACHING_WINDOW = 5; // pts within a milestone to trigger coaching

// ─── Output types ─────────────────────────────────────────────────────────────

export interface MilestoneCoaching {
  milestone:      number;
  milestoneLabel: string;
  ptsNeeded:      number;
  action:         string;
  isFree:         boolean;
}

export interface ScoreTrendContext {
  delta:             number;
  trend:             "up" | "down" | "flat";
  previousScore:     number | null;
  history:           ScoreSnapshot[];   // last 4 snapshots
  milestoneCoaching: MilestoneCoaching | null;
}

// ─── computeMilestoneCoaching ─────────────────────────────────────────────────

/**
 * Returns coaching when the current score is within COACHING_WINDOW pts of
 * the next grade boundary or HomeGentic Certified threshold. Returns null otherwise.
 *
 * Action priority (cheapest first):
 *   1. Pending contractor jobs that can be verified for free (+4 pts each)
 *   2. New job category if diversity gap exists (+4 pts)
 *   3. Document more costs if value gap exists (+1 pt per $2,500)
 *   4. Property verification if verification gap exists (+5–10 pts)
 */
export function computeMilestoneCoaching(
  score:     number,
  breakdown: ScoreBreakdown,
  jobs:      Job[],
): MilestoneCoaching | null {
  const next = MILESTONES.find(
    (m) => m.score > score && m.score - score <= COACHING_WINDOW
  );
  if (!next) return null;

  const ptsNeeded = next.score - score;

  // 1. Free: pending contractor jobs that haven't been homeowner-signed yet
  const pendingJob = jobs.find(
    (j) => !j.isDiy && !j.verified && j.status !== "verified" && !j.homeownerSigned
  );
  if (pendingJob) {
    return {
      milestone:      next.score,
      milestoneLabel: next.label,
      ptsNeeded,
      action: `Get contractor sign-off on your ${pendingJob.serviceType} job — it's free and adds 4 pts toward ${next.label}`,
      isFree: true,
    };
  }

  // 2. New job category (diversity gap)
  if (breakdown.diversityPts < 20) {
    const verifiedTypes = new Set(
      jobs.filter((j) => j.verified || j.status === "verified").map((j) => j.serviceType)
    );
    const all = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows", "Flooring"];
    const missing = all.find((t) => !verifiedTypes.has(t)) ?? "a new system type";
    return {
      milestone:      next.score,
      milestoneLabel: next.label,
      ptsNeeded,
      action: `Log a verified ${missing} job to earn 4 diversity pts toward ${next.label}`,
      isFree: false,
    };
  }

  // 3. Document more costs (value gap)
  if (breakdown.valuePts < 20) {
    return {
      milestone:      next.score,
      milestoneLabel: next.label,
      ptsNeeded,
      action: `Each additional $2,500 in documented job costs adds 1 pt — log ${ptsNeeded} more job${ptsNeeded > 1 ? "s" : ""} with costs to reach ${next.label}`,
      isFree: false,
    };
  }

  // 4. Property verification gap
  return {
    milestone:      next.score,
    milestoneLabel: next.label,
    ptsNeeded,
    action: `Complete property verification to earn 5–10 pts and reach ${next.label}`,
    isFree: false,
  };
}

// ─── buildScoreTrend ──────────────────────────────────────────────────────────

/**
 * Shapes score history into the context payload for the voice agent.
 * Pass the result of loadHistory() from scoreService as `history`.
 */
export function buildScoreTrend(
  score:     number,
  breakdown: ScoreBreakdown,
  jobs:      Job[],
  history:   ScoreSnapshot[],
): ScoreTrendContext {
  const delta         = scoreDelta(history);
  const trend: ScoreTrendContext["trend"] = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const previousScore = history.length >= 2 ? history[history.length - 2].score : null;

  return {
    delta,
    trend,
    previousScore,
    history: history.slice(-4),
    milestoneCoaching: computeMilestoneCoaching(score, breakdown, jobs),
  };
}
