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

/**
 * Determines whether a property qualifies for the HomeFax Certified™ designation.
 * Criteria (front-end heuristic; canister enforcement is a Tier 3 item):
 *   - HomeFax Score ≥ 88
 *   - At least 3 verified jobs on record
 *   - At least 2 of the 4 key systems have a verified job: HVAC, Roofing, Plumbing, Electrical
 */
export function isCertified(score: number, jobs: Job[]): boolean {
  if (score < 88) return false;
  const verified = jobs.filter((j) => j.verified || j.status === "verified");
  if (verified.length < 3) return false;
  const KEY_SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical"];
  return KEY_SYSTEMS.filter((sys) => verified.some((j) => j.serviceType === sys)).length >= 2;
}

/**
 * Lender certificate — encodes a summary as a base64 URL token so the lender
 * can view score + certified status without accessing any job details.
 * NOTE: This is a frontend-only placeholder until canister cert issuance (4.2.1).
 */
export interface CertPayload {
  address:     string;
  score:       number;
  grade:       string;
  certified:   boolean;
  generatedAt: number; // ms
}

export function generateCertToken(payload: CertPayload): string {
  return btoa(JSON.stringify(payload)).replace(/=/g, "");
}

export function parseCertToken(token: string): CertPayload | null {
  try {
    const padded = token + "=".repeat((4 - token.length % 4) % 4);
    return JSON.parse(atob(padded)) as CertPayload;
  } catch {
    return null;
  }
}

/**
 * Estimates the buyer-premium dollar range associated with a HomeFax score.
 * Based on industry research: verified maintenance history lifts sale price
 * 1–10% in typical US markets. Returns null below score 40 (not enough signal).
 *
 * NOTE: These are heuristic ranges pending real market-data integration (5.3.2).
 */
export function premiumEstimate(score: number): { low: number; high: number } | null {
  if (score < 40) return null;
  if (score < 55) return { low: 3_000,  high: 8_000  };
  if (score < 70) return { low: 8_000,  high: 15_000 };
  if (score < 85) return { low: 15_000, high: 25_000 };
  return               { low: 20_000, high: 35_000 };
}
