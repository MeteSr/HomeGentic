/**
 * Warranty wallet service (1.4.4).
 *
 * Pure calculation helpers — no canister calls, no state.
 * Used by WarrantyWalletPage, DashboardPage, and any HomeGentic Report integration.
 */

import type { Job } from "./job";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Average milliseconds per calendar month (30.44 days). */
export const MS_PER_MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** Days before expiry at which a warranty is considered "expiring soon". */
export const EXPIRY_ALERT_DAYS = 90;

const ALERT_MS = EXPIRY_ALERT_DAYS * 24 * 60 * 60 * 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

export type WarrantyStatus = "active" | "expiring" | "expired";

export interface WarrantyJob {
  job:     Job;
  status:  WarrantyStatus;
  expiry:  Date;
  daysLeft: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/** Timestamp (ms) when the job's warranty expires. */
export function warrantyExpiry(job: Job): number {
  return new Date(job.date).getTime() + (job.warrantyMonths ?? 0) * MS_PER_MONTH;
}

/** Classification of the warranty relative to now. */
export function warrantyStatus(job: Job): WarrantyStatus {
  const expiry = warrantyExpiry(job);
  const now    = Date.now();
  if (expiry <= now)          return "expired";
  if (expiry - now <= ALERT_MS) return "expiring";
  return "active";
}

/** Whole days remaining until expiry (negative means already expired). */
export function daysRemaining(job: Job): number {
  return Math.round((warrantyExpiry(job) - Date.now()) / (24 * 60 * 60 * 1000));
}

/**
 * Filter a job list to only those with an active warranty (warrantyMonths > 0)
 * and enrich each with status, expiry Date, and daysLeft.
 */
export function getWarrantyJobs(jobs: Job[]): WarrantyJob[] {
  return jobs
    .filter((j) => j.warrantyMonths != null && j.warrantyMonths > 0)
    .map((job): WarrantyJob => ({
      job,
      status:   warrantyStatus(job),
      expiry:   new Date(warrantyExpiry(job)),
      daysLeft: daysRemaining(job),
    }));
}
