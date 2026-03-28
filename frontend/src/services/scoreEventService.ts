/**
 * Score event tracking (8.2.1–8.2.2).
 *
 * Events are derived from current job/property state — no separate store needed.
 * Shows users exactly which actions moved their score.
 */

import type { Job } from "./job";
import type { Property } from "./property";

export type EventCategory = "Job" | "Property" | "Diversity" | "Value";

export interface ScoreEvent {
  id:        string;
  label:     string;
  detail:    string;
  pts:       number;
  timestamp: number;        // ms since epoch
  category:  EventCategory;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Returns the most recent score-earning events derived from jobs + properties.
 * Events from the last 90 days are returned, newest first, capped at 12.
 */
export function getRecentScoreEvents(
  jobs: Job[],
  properties: Property[]
): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  const now = Date.now();

  // ── Verified jobs: 4 pts each ────────────────────────────────────────────
  for (const job of jobs.filter((j) => j.status === "verified")) {
    const ts = new Date(job.date).getTime();
    events.push({
      id:        `verified-${job.id}`,
      label:     `${job.serviceType} Verified`,
      detail:    job.isDiy ? "DIY record" : (job.contractorName ?? "Contractor") + " sign-off",
      pts:       4,
      timestamp: ts,
      category:  "Job",
    });
  }

  // ── DIY-only (pending) jobs: 1 pt each ───────────────────────────────────
  for (const job of jobs.filter((j) => j.isDiy && j.status !== "verified")) {
    const ts = new Date(job.date).getTime();
    if (now - ts <= NINETY_DAYS_MS) {
      events.push({
        id:        `diy-${job.id}`,
        label:     `${job.serviceType} — DIY Logged`,
        detail:    "Self-reported; get contractor signature to earn full 4 pts",
        pts:       1,
        timestamp: ts,
        category:  "Job",
      });
    }
  }

  // ── Property verification: 5 pts (Basic) or 10 pts (Premium) ─────────────
  for (const prop of properties) {
    if (prop.verificationLevel === "Basic" || prop.verificationLevel === "Premium") {
      const pts = prop.verificationLevel === "Premium" ? 10 : 5;
      const ts  = prop.createdAt ? Number(prop.createdAt) / 1_000_000 : now;
      events.push({
        id:        `prop-${prop.id}`,
        label:     `${prop.address.split(",")[0]} — ${prop.verificationLevel} Verified`,
        detail:    `Property verification level: +${pts} score points`,
        pts,
        timestamp: ts,
        category:  "Property",
      });
    }
  }

  // ── Job diversity milestone: noted when 3+ unique types ──────────────────
  const verifiedJobs    = jobs.filter((j) => j.status === "verified");
  const uniqueTypes     = new Set(verifiedJobs.map((j) => j.serviceType));
  if (uniqueTypes.size >= 3) {
    const ts = Math.max(...verifiedJobs.map((j) => new Date(j.date).getTime()));
    events.push({
      id:        `diversity-${uniqueTypes.size}`,
      label:     `Job Diversity — ${uniqueTypes.size} Categories`,
      detail:    `Documenting multiple systems adds up to 20 diversity pts`,
      pts:       Math.min(uniqueTypes.size * 4, 20),
      timestamp: ts,
      category:  "Diversity",
    });
  }

  // ── Value milestone: noted when documented value crosses thresholds ───────
  const totalCents = jobs.reduce((s, j) => s + j.amount, 0);
  const thresholds = [10_000_000, 5_000_000, 2_500_000, 1_000_000, 500_000];
  for (const t of thresholds) {
    if (totalCents >= t) {
      const ts = Math.max(...jobs.map((j) => new Date(j.date).getTime()));
      events.push({
        id:        `value-${t}`,
        label:     `$${(t / 100).toLocaleString()} Documented`,
        detail:    "Total documented value contributes up to 20 score points",
        pts:       Math.round(Math.min((totalCents / 100) / 2500, 20)),
        timestamp: ts,
        category:  "Value",
      });
      break; // only show the highest crossed threshold
    }
  }

  return events
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
}

export function categoryColor(cat: EventCategory): string {
  switch (cat) {
    case "Job":       return "#3D6B57";
    case "Property":  return "#1e40af";
    case "Diversity": return "#7c3aed";
    case "Value":     return "#C94C2E";
  }
}

export function categoryBg(cat: EventCategory): string {
  switch (cat) {
    case "Job":       return "#F0F6F3";
    case "Property":  return "#dbeafe";
    case "Diversity": return "#ede9fe";
    case "Value":     return "#fef2f2";
  }
}
