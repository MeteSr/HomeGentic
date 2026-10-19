import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { idlFactory as jobIdlFactory } from "@homegentic/shared/declarations/job";
import { getIcpAgent }      from "./icpAgent";

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

// ── Canister wiring ───────────────────────────────────────────────────────────

const JOB_CANISTER_ID = process.env.EXPO_PUBLIC_JOB_CANISTER_ID ?? "";


// ── Public API ────────────────────────────────────────────────────────────────

export async function signJob(jobId: string, agent?: HttpAgent): Promise<void> {
  const ag = agent ?? getIcpAgent();
  const a = Actor.createActor(jobIdlFactory as any, {
    agent: ag,
    canisterId: JOB_CANISTER_ID,
  });
  const result = await (a as any).verifyJob(jobId);
  if ("err" in result) {
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  }
}
