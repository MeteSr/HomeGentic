/**
 * §16.3 — Score Trend & Milestone Coaching
 *
 * Pure functions — no canister calls, no localStorage access.
 * The caller (useVoiceAgent.ts) passes pre-fetched history and breakdown in.
 */

import type { Job } from "./job";
import type { Property } from "./property";
import type { ScoreSnapshot } from "./scoreService";
import { scoreDelta, scoreSuggestions } from "./scoreService";

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
 * the next grade boundary or HomeGentic Certified threshold. Returns null
 * otherwise. The action is the best of scoreSuggestions() — a free sign-off
 * first — so its point value comes from the real formula.
 */
export function computeMilestoneCoaching(
  score:    number,
  jobs:     Job[],
  property: Property | null,
): MilestoneCoaching | null {
  const next = MILESTONES.find(
    (m) => m.score > score && m.score - score <= COACHING_WINDOW
  );
  if (!next) return null;

  const best = scoreSuggestions(jobs, property)[0];
  if (!best) return null;
  return {
    milestone:      next.score,
    milestoneLabel: next.label,
    ptsNeeded:      next.score - score,
    action:         `${best.action} — adds ${best.pts} pt${best.pts === 1 ? "" : "s"} toward ${next.label}`,
    isFree:         best.isFree,
  };
}

// ─── buildScoreTrend ──────────────────────────────────────────────────────────

/**
 * Shapes score history into the context payload for the voice agent.
 * Pass the result of loadHistory() from scoreService as `history`.
 */
export function buildScoreTrend(
  score:    number,
  jobs:     Job[],
  property: Property | null,
  history:  ScoreSnapshot[],
): ScoreTrendContext {
  const delta         = scoreDelta(history);
  const trend: ScoreTrendContext["trend"] = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const previousScore = history.length >= 2 ? history[history.length - 2].score : null;

  return {
    delta,
    trend,
    previousScore,
    history: history.slice(-4),
    milestoneCoaching: computeMilestoneCoaching(score, jobs, property),
  };
}
