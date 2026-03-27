/**
 * HomeFax Score Service
 *
 * Computes a 0–100 score from local job + property data and persists
 * weekly snapshots to localStorage so the Dashboard can render a sparkline.
 *
 * Scoring rubric (sum ≤ 100):
 *   • Verified jobs    – 4 pts each, max 40 pts
 *   • Total value      – 1 pt per $2,500, max 20 pts
 *   • Verification     – 10 pts per Premium property, 5 pts per Basic, max 20 pts
 *   • Job diversity    – 4 pts per unique service type, max 20 pts
 */

import type { Job } from "@/services/job";
import type { Property } from "@/services/property";

export interface ScoreSnapshot {
  score: number;
  timestamp: number; // ms epoch
}

const STORAGE_KEY = "homefax_score_history";
const MAX_SNAPSHOTS = 12; // keep ~3 months of weekly snapshots

export function computeScore(jobs: Job[], properties: Property[]): number {
  let score = 0;

  const verifiedJobs = jobs.filter((j) => j.verified);
  score += Math.min(verifiedJobs.length * 4, 40);

  const totalValueDollars = jobs.reduce((sum, j) => sum + j.amount, 0) / 100;
  score += Math.min(Math.floor(totalValueDollars / 2500), 20);

  let verificationPts = 0;
  for (const p of properties) {
    if (p.verificationLevel === "Premium") verificationPts += 10;
    else if (p.verificationLevel === "Basic") verificationPts += 5;
  }
  score += Math.min(verificationPts, 20);

  const uniqueTypes = new Set(jobs.map((j) => j.serviceType)).size;
  score += Math.min(uniqueTypes * 4, 20);

  return Math.min(Math.round(score), 100);
}

export function getScoreGrade(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function loadHistory(): ScoreSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScoreSnapshot[]) : [];
  } catch {
    return [];
  }
}

/**
 * Record a new score snapshot if at least 6 days have passed since the last
 * one (prevents duplicate daily snapshots while still capturing weekly drift).
 */
export function recordSnapshot(score: number): ScoreSnapshot[] {
  const history = loadHistory();
  const now = Date.now();
  const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

  const last = history[history.length - 1];
  if (last && now - last.timestamp < SIX_DAYS_MS) {
    // Update the most recent snapshot in-place instead of appending
    const updated = [...history.slice(0, -1), { score, timestamp: last.timestamp }];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  }

  const next = [...history, { score, timestamp: now }].slice(-MAX_SNAPSHOTS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * Returns the point change vs. the previous snapshot (or 0 if none).
 */
export function scoreDelta(history: ScoreSnapshot[]): number {
  if (history.length < 2) return 0;
  return history[history.length - 1].score - history[history.length - 2].score;
}
