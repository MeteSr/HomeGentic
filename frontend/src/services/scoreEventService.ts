/**
 * Score event tracking (8.2.1–8.2.2).
 *
 * Events are derived from current job/property state — no separate store needed.
 * Shows users exactly which actions moved their score.
 */

import type { Job } from "./job";
import type { Property } from "./property";
import { computeScore } from "./scoreService";

export type EventCategory = "Job" | "Property" | "Diversity" | "Value";

export interface ScoreEvent {
  id:        string;
  label:     string;
  detail:    string;
  pts:       number;
  timestamp: number;        // ms since epoch
  category:  EventCategory;
}

/**
 * Returns the jobs that moved the score, newest first, capped at 12. Each
 * event's points are what that job changed when it was added: the record is
 * replayed in date order through the real formula (computeScore), so the
 * points always add up to the score. A job that changed nothing is left out.
 */
export function getRecentScoreEvents(
  jobs: Job[],
  properties: Property[]
): ScoreEvent[] {
  const ordered = [...jobs].sort((a, b) => a.date.localeCompare(b.date));
  const events: ScoreEvent[] = [];
  let before = computeScore([], properties);
  ordered.forEach((job, i) => {
    const after = computeScore(ordered.slice(0, i + 1), properties);
    const pts = after - before;
    before = after;
    if (pts === 0) return;
    const verified = job.verified && !job.contractorUnverified;
    events.push({
      id:        `job-${job.id}`,
      label:     verified ? `${job.serviceType} Verified` : `${job.serviceType} Logged`,
      detail:    verified
        ? (job.isDiy ? "DIY record" : (job.contractorName ?? "Contractor") + " sign-off")
        : (job.isDiy ? "Self-reported" : "Awaiting contractor sign-off"),
      pts,
      timestamp: new Date(job.date).getTime(),
      category:  "Job",
    });
  });

  return events
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 12);
}

export function categoryColor(cat: EventCategory): string {
  switch (cat) {
    case "Job":       return "#3D6B57";
    case "Property":  return "#1e40af";
    case "Diversity": return "#7c3aed";
    case "Value":     return "#AA3820";   // darker rust — 5.8:1 on #fef2f2, 6.4:1 on white
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
