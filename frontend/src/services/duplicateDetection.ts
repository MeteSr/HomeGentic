/**
 * Duplicate job detection for contractor-initiated proposals.
 * (Frontend mirror of agents/voice/duplicateDetection.ts — kept in sync)
 *
 * A job is considered a potential duplicate when all three match:
 *   1. Same propertyId
 *   2. Same serviceType
 *   3. Proposed date is within 14 days of the existing job's date
 *
 * Rejected proposals (status: "rejected" or "rejected_by_homeowner") are excluded.
 */

export interface ProposedJobFields {
  propertyId:  string;
  serviceType: string;
  date:        string;   // YYYY-MM-DD
}

export interface ExistingJobSummary {
  id:          string;
  propertyId:  string;
  serviceType: string;
  date:        string;
  status:      string;
}

export interface DuplicateCheckResult {
  isDuplicate:   boolean;
  matchedJobId?: string;
  reason?:       string;
}

const DUPLICATE_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function detectDuplicate(
  proposed: ProposedJobFields,
  existingJobs: ExistingJobSummary[],
): DuplicateCheckResult {
  const proposedMs = new Date(proposed.date).getTime();

  for (const job of existingJobs) {
    if (job.status === "rejected" || job.status === "rejected_by_homeowner") continue;
    if (job.propertyId  !== proposed.propertyId)  continue;
    if (job.serviceType !== proposed.serviceType) continue;

    const existingMs = new Date(job.date).getTime();
    const diffDays   = Math.abs(proposedMs - existingMs) / MS_PER_DAY;

    if (diffDays <= DUPLICATE_WINDOW_DAYS) {
      return {
        isDuplicate:  true,
        matchedJobId: job.id,
        reason: `A ${proposed.serviceType} job (${job.id}) already exists for this property within the ${DUPLICATE_WINDOW_DAYS}-day window. Dates are ${Math.round(diffDays)} day(s) apart.`,
      };
    }
  }

  return { isDuplicate: false };
}
