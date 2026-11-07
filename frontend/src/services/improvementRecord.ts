/**
 * Improvements and tax basis record (#713).
 *
 * Each job is marked as an improvement or a repair. The owner's own mark
 * (job canister, setJobCostCategory) wins; until they set one, the app
 * suggests one from the kind of work and its cost. The suggestion is a
 * starting point for the owner and their tax preparer, never a tax
 * determination, and the page says so.
 */
import { serviceTypeKey, type ServiceTypeKey } from "@homegentic/shared/serviceTypes";
import type { CostCategory, Job } from "@/services/job";
import { csvCell } from "@/utils/csv";

/** At or above this cost, work in a cost-dependent trade is suggested as an improvement ($5,000). */
export const IMPROVEMENT_SUGGEST_CENTS = 500_000;

/** New rooms, systems or envelope work: suggested as improvements at any cost. */
const ALWAYS_IMPROVEMENT = new Set<ServiceTypeKey>(["KitchenRemodel", "BathroomRemodel", "Solar", "Insulation"]);
/** Upkeep trades: suggested as repairs at any cost. */
const ALWAYS_REPAIR = new Set<ServiceTypeKey>(["Pest", "GeneralHandyman", "Painting", "Drywall"]);

export function suggestCategory(job: Pick<Job, "serviceType" | "amount">): CostCategory {
  const key = serviceTypeKey(job.serviceType);
  if (key && ALWAYS_IMPROVEMENT.has(key)) return "improvement";
  if (key && ALWAYS_REPAIR.has(key)) return "repair";
  return job.amount >= IMPROVEMENT_SUGGEST_CENTS ? "improvement" : "repair";
}

export interface RecordRow {
  job: Job;
  category: CostCategory;
  /** "owner" when the owner set the mark, "suggested" when it is the app's suggestion. */
  source: "owner" | "suggested";
}

export interface ImprovementRecord {
  rows: RecordRow[];
  improvementTotalCents: number;
  improvementCount: number;
  repairTotalCents: number;
}

/** Contractor proposals the owner hasn't accepted aren't part of the record. */
const NOT_ON_RECORD = new Set<Job["status"]>(["pending_homeowner_approval", "rejected_by_homeowner"]);

/**
 * The record for a set of jobs: one row per job on record, oldest first, with
 * the owner's mark or a suggestion. `since` (YYYY-MM-DD) keeps work on or
 * after that date, e.g. the day the owner bought the home.
 */
export function buildImprovementRecord(
  jobs: Job[],
  marks: Record<string, CostCategory>,
  since?: string,
): ImprovementRecord {
  const rows: RecordRow[] = jobs
    .filter((j) => !NOT_ON_RECORD.has(j.status) && (!since || j.date >= since))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((job) => {
      const mark = marks[job.id];
      return mark
        ? { job, category: mark, source: "owner" as const }
        : { job, category: suggestCategory(job), source: "suggested" as const };
    });
  let improvementTotalCents = 0;
  let improvementCount = 0;
  let repairTotalCents = 0;
  for (const r of rows) {
    if (r.category === "improvement") {
      improvementTotalCents += r.job.amount;
      improvementCount += 1;
    } else {
      repairTotalCents += r.job.amount;
    }
  }
  return { rows, improvementTotalCents, improvementCount, repairTotalCents };
}

export function doneBy(job: Job): string {
  return job.isDiy ? "DIY (homeowner)" : (job.contractorName ?? "");
}

export function recordStatus(job: Job): string {
  if (!job.verified) return "Not yet signed";
  return job.isDiy ? "Verified: homeowner signed (DIY)" : "Verified: homeowner and contractor signed";
}

export const CATEGORY_LABELS: Record<CostCategory, string> = { improvement: "Improvement", repair: "Repair" };

const CSV_HEADER = [
  "Date",
  "Work",
  "Service type",
  "Done by",
  "Amount (USD)",
  "Category",
  "Category set by",
  "Record status",
  "Permit number",
];

/** The record as CSV (RFC 4180 line endings) for the owner's tax preparer. */
export function improvementRecordCsv(rows: RecordRow[]): string {
  const lines = [CSV_HEADER.join(",")];
  for (const { job, category, source } of rows) {
    lines.push(
      [
        job.date,
        job.description,
        job.serviceType,
        doneBy(job),
        (job.amount / 100).toFixed(2),
        CATEGORY_LABELS[category],
        source === "owner" ? "Owner" : "Suggested",
        recordStatus(job),
        job.permitNumber ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
