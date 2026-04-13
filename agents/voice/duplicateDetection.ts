/**
 * Duplicate job detection for contractor-initiated proposals.
 *
 * A job is considered a potential duplicate when all three match:
 *   1. Same propertyId
 *   2. Same serviceType
 *   3. Proposed date is within 14 days of the existing job's date (in either direction)
 *
 * Rejected proposals (status: "rejected") are excluded — they should not
 * block re-submission.
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
  date:        string;   // YYYY-MM-DD
  status:      string;
}

export interface DuplicateCheckResult {
  isDuplicate:    boolean;
  matchedJobId?:  string;
  reason?:        string;
}

const DUPLICATE_WINDOW_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(dateStr: string): number {
  return new Date(dateStr).getTime();
}

/**
 * Check whether a proposed job is a likely duplicate of any existing job.
 *
 * Returns { isDuplicate: false } when no match is found, or
 * { isDuplicate: true, matchedJobId, reason } when a duplicate is detected.
 */
export function detectDuplicate(
  proposed: ProposedJobFields,
  existingJobs: ExistingJobSummary[],
): DuplicateCheckResult {
  const proposedMs = parseDate(proposed.date);

  for (const job of existingJobs) {
    // Rejected proposals do not block re-submission
    if (job.status === "rejected") continue;

    // Must match property and service type
    if (job.propertyId !== proposed.propertyId) continue;
    if (job.serviceType !== proposed.serviceType) continue;

    const existingMs = parseDate(job.date);
    const diffDays   = Math.abs(proposedMs - existingMs) / MS_PER_DAY;

    if (diffDays <= DUPLICATE_WINDOW_DAYS) {
      return {
        isDuplicate: true,
        matchedJobId: job.id,
        reason: `A ${proposed.serviceType} job (${job.id}) already exists for this property within the ${DUPLICATE_WINDOW_DAYS}-day window. Dates are ${Math.round(diffDays)} day(s) apart.`,
      };
    }
  }

  return { isDuplicate: false };
}
