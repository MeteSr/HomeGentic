import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { IDL }              from "@icp-sdk/core/candid";
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

const jobIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing: I.Null, HVAC: I.Null, Plumbing: I.Null, Electrical: I.Null,
    Painting: I.Null, Flooring: I.Null, Windows: I.Null, Landscaping: I.Null,
  } as Record<string, IDL.Type>);
  const JobStatus = I.Variant({
    Pending: I.Null, InProgress: I.Null, Completed: I.Null, Verified: I.Null,
    PendingHomeownerApproval: I.Null, RejectedByHomeowner: I.Null,
  } as Record<string, IDL.Type>);
  const Job = I.Record({
    id:               I.Text,
    propertyId:       I.Text,
    serviceType:      ServiceType,
    description:      I.Text,
    amount:           I.Nat,
    completedDate:    I.Int,
    status:           JobStatus,
    isDiy:            I.Bool,
    contractorName:   I.Opt(I.Text),
  });
  const Error = I.Variant({
    NotFound:        I.Null,
    Unauthorized:    I.Null,
    InvalidInput:    I.Text,
    AlreadyVerified: I.Null,
  } as Record<string, IDL.Type>);
  return I.Service({
    verifyJob: I.Func([I.Text], [I.Variant({ ok: Job, err: Error })], []),
  });
};

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
