/**
 * #716 permit close-out and lien waivers. The household records where each
 * job's permit stands and files the papers that hold up a sale (a final lien
 * waiver from the contractor, a Florida Notice of Commencement). Everything
 * here reads that record: it never checks with a permit office or a county
 * recorder, so copy built on it must say "on file" or "recorded", never that a
 * home is lien-free or its permits are closed.
 */
import type { Job } from "@/services/job";

export type PermitStatus = "open" | "closed" | "expired";
export type PaperKind = "lienWaiver" | "noticeOfCommencement";

export interface JobPaper {
  kind: PaperKind;
  photoId: string; // the document in the home's vault
  addedBy: string; // principal text
  addedAt: number; // ms
}

export interface JobCloseout {
  jobId: string;
  permitStatus?: PermitStatus;
  papers: JobPaper[];
}

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  open: "Open",
  closed: "Closed",
  expired: "Expired",
};

/** Contractor jobs above this get a final lien waiver prompt ($2,500). */
export const LARGE_JOB_CENTS = 250_000;
/**
 * Florida generally requires a recorded Notice of Commencement before work on
 * a direct contract over $2,500 starts, and over $15,000 for repairing or
 * replacing a heating or air-conditioning system (Fla. Stat. ch. 713, as
 * amended in 2022). Copy says "generally" and points to the permit office.
 */
export const FL_NOC_CENTS = 250_000;
export const FL_HVAC_NOC_CENTS = 1_500_000;

const isProposal = (j: Job) => j.status === "pending_homeowner_approval" || j.status === "rejected_by_homeowner";

/** Larger contractor jobs, the ones a final lien waiver matters for. */
export function needsLienWaiver(job: Job): boolean {
  return !isProposal(job) && !job.isDiy && job.amount > LARGE_JOB_CENTS;
}

/** Whether Florida generally expects a Notice of Commencement for this job. */
export function nocExpected(job: Job, state: string | undefined): boolean {
  if (isProposal(job) || job.isDiy || (state ?? "").trim().toUpperCase() !== "FL") return false;
  const line = job.serviceType === "HVAC" ? FL_HVAC_NOC_CENTS : FL_NOC_CENTS;
  return job.amount > line;
}

export function permitStatusOf(jobId: string, byId: Map<string, JobCloseout>): PermitStatus | undefined {
  return byId.get(jobId)?.permitStatus;
}

export function hasPaper(jobId: string, kind: PaperKind, byId: Map<string, JobCloseout>): boolean {
  return (byId.get(jobId)?.papers ?? []).some((p) => p.kind === kind);
}

export interface CloseoutReview {
  openPermits: Job[];
  expiredPermits: Job[];
  closedPermits: Job[];
  /** A permit number on the job but no status recorded yet. */
  unrecordedPermits: Job[];
  withWaiver: Job[];
  missingWaiver: Job[];
}

/** Sorts a home's jobs (proposals left out) by permit status and waiver. */
export function closeoutReview(jobs: Job[], closeouts: JobCloseout[]): CloseoutReview {
  const byId = new Map(closeouts.map((c) => [c.jobId, c]));
  const review: CloseoutReview = {
    openPermits: [],
    expiredPermits: [],
    closedPermits: [],
    unrecordedPermits: [],
    withWaiver: [],
    missingWaiver: [],
  };
  for (const job of jobs) {
    if (isProposal(job)) continue;
    const status = permitStatusOf(job.id, byId);
    if (status === "open") review.openPermits.push(job);
    else if (status === "expired") review.expiredPermits.push(job);
    else if (status === "closed") review.closedPermits.push(job);
    else if (job.permitNumber) review.unrecordedPermits.push(job);
    if (needsLienWaiver(job)) {
      (hasPaper(job.id, "lienWaiver", byId) ? review.withWaiver : review.missingWaiver).push(job);
    }
  }
  return review;
}
