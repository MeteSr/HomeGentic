import { HttpAgent } from "@dfinity/agent";

export type SignRole = "homeowner" | "contractor";

export interface SignableJob {
  id:              string;
  serviceType:     string;
  propertyAddress: string;
  amountCents:     number;
  completedDate:   string;
  awaitingRole:    SignRole;
}

/** Pure — true when the current user's role is the one the job is waiting on */
export function canSign(job: SignableJob, currentRole: SignRole): boolean {
  return job.awaitingRole === currentRole;
}

/** Pure — CTA label for the sign button */
export function signButtonLabel(awaitingRole: SignRole): string {
  return awaitingRole === "contractor" ? "SIGN AS CONTRACTOR" : "SIGN AS HOMEOWNER";
}

/** Pure — builds the confirmation message shown before signing */
export function signConfirmationText(job: SignableJob): string {
  const amount = (job.amountCents / 100).toLocaleString("en-US", {
    style:                 "currency",
    currency:              "USD",
    maximumFractionDigits: 0,
  });
  return (
    `I confirm that the ${job.serviceType} work completed on ${job.completedDate} ` +
    `at ${job.propertyAddress} for ${amount} has been reviewed and is accurate to the best of my knowledge.`
  );
}

export async function signJob(jobId: string, _agent?: HttpAgent): Promise<void> {
  // TODO: replace with real canister call — job.verifyJob(jobId)
  // The canister records which party signed; when both have signed, status → Verified.
  console.log(`[signJob] signed job=${jobId}`);
}
