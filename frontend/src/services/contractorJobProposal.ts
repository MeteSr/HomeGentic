/**
 * Contractor-initiated job proposal service.
 *
 * Orchestrates the three-step flow:
 *   1. Resolve the property address → { propertyId, homeownerPrincipal }
 *   2. Check for duplicate jobs in the 14-day window
 *   3. Submit the proposal via the job canister (awaiting homeowner approval)
 *
 * Confirmations are handled by confirmJobProposal which approves the staged proposal.
 */

import { propertyService } from "./property";
import { jobService }      from "./job";
import { detectDuplicate } from "./duplicateDetection";

export interface JobProposalArgs {
  propertyAddress: string;
  serviceType:     string;
  description:     string;
  amountCents:     number;
  completedDate:   string;  // YYYY-MM-DD
  contractorName?: string;
  permitNumber?:   string;
  warrantyMonths?: number;
}

export interface JobProposalResult {
  success:              boolean;
  proposalId?:          string;
  propertyId?:          string;
  homeownerPrincipal?:  string;
  error?:               string;
  duplicate?:           { jobId: string; reason: string };
  candidateProperties?: Array<{ id: string; owner: string; address: string }>;
}

export interface ConfirmProposalResult {
  success:  boolean;
  jobId?:   string;
  error?:   string;
}

/**
 * Propose a completed job at the given address for homeowner approval.
 *
 * Returns { success: false } with a descriptive error when:
 *   - The address matches zero or multiple properties
 *   - A duplicate job is detected within the 14-day window
 *   - The canister call fails
 */
export async function proposeJob(args: JobProposalArgs): Promise<JobProposalResult> {
  // ── Step 1: resolve address → property ───────────────────────────────────
  let candidates: Array<{ id: string; owner: string; address: string }>;
  try {
    candidates = await propertyService.searchByAddress(args.propertyAddress);
  } catch (err) {
    return {
      success: false,
      error:   `Address lookup failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (candidates.length === 0) {
    return {
      success: false,
      error:   `No property found matching address "${args.propertyAddress}". Ask the homeowner to verify their address in HomeGentic.`,
    };
  }

  if (candidates.length > 1) {
    return {
      success:              false,
      error:                `Multiple properties match "${args.propertyAddress}". Please clarify which property you mean.`,
      candidateProperties:  candidates,
    };
  }

  const property           = candidates[0];
  const propertyId         = property.id;
  const homeownerPrincipal = property.owner;

  // ── Step 2: duplicate check ───────────────────────────────────────────────
  let existingJobs: any[] = [];
  try {
    existingJobs = await jobService.getByProperty(propertyId);
  } catch {
    // Non-fatal — if we can't load existing jobs, skip duplicate check rather
    // than blocking the contractor.
  }

  const dupResult = detectDuplicate(
    { propertyId, serviceType: args.serviceType, date: args.completedDate },
    existingJobs.map((j) => ({
      id:          j.id,
      propertyId:  j.propertyId,
      serviceType: j.serviceType,
      date:        j.date,
      status:      j.status,
    })),
  );

  if (dupResult.isDuplicate) {
    return {
      success:   false,
      duplicate: { jobId: dupResult.matchedJobId!, reason: dupResult.reason! },
      propertyId,
      homeownerPrincipal,
    };
  }

  // ── Step 3: submit proposal ───────────────────────────────────────────────
  try {
    const proposal = await jobService.createJobProposal({
      propertyId,
      serviceType:    args.serviceType,
      description:    args.description,
      contractorName: args.contractorName ?? "",
      amountCents:    args.amountCents,
      completedDate:  args.completedDate,
      permitNumber:   args.permitNumber,
      warrantyMonths: args.warrantyMonths,
    });

    return {
      success:            true,
      proposalId:         proposal.id,
      propertyId,
      homeownerPrincipal,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: `Failed to create proposal: ${msg}` };
  }
}

/**
 * Approve (confirm) a staged job proposal on behalf of the homeowner.
 * In the contractor chat flow this is called when the homeowner clicks "Approve"
 * on the pending proposal card in their dashboard.
 */
export async function confirmJobProposal(proposalId: string): Promise<ConfirmProposalResult> {
  try {
    const job = await jobService.approveJobProposal(proposalId);
    return { success: true, jobId: job.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
