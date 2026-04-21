import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { IDL }              from "@icp-sdk/core/candid";

export type JobStatus = "pending" | "awaiting_contractor" | "verified" | "pending_homeowner_approval";

export interface CreateJobInput {
  propertyId:     string;
  serviceType:    string;
  description:    string;
  amountCents:    number;
  completedDate:  string;  // YYYY-MM-DD
  isDiy:          boolean;
  contractorName: string | null;
  permitNumber:   string | null;
}

export interface Job {
  id:           string;
  propertyId:   string;
  serviceType:  string;
  description:  string;
  amountCents:  number;
  completedDate: string;
  status:       JobStatus;
  isDiy:        boolean;
  contractorName?: string;
}

// ── Canister wiring ───────────────────────────────────────────────────────────

const JOB_CANISTER_ID = process.env.EXPO_PUBLIC_JOB_CANISTER_ID ?? "";

/** Minimal IDL — only the methods the mobile app currently calls. */
const jobIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const JobStatus = I.Variant({
    Pending:                  I.Null,
    InProgress:               I.Null,
    Completed:                I.Null,
    Verified:                 I.Null,
    PendingHomeownerApproval: I.Null,
    RejectedByHomeowner:      I.Null,
  } as Record<string, IDL.Type>);

  const Job = I.Record({
    id:             I.Text,
    propertyId:     I.Text,
    serviceType:    I.Text,
    description:    I.Text,
    amountCents:    I.Nat,
    completedDate:  I.Text,
    status:         JobStatus,
    isDiy:          I.Bool,
    contractorName: I.Opt(I.Text),
  });

  return I.Service({
    getPendingProposals: I.Func([], [I.Vec(Job)], ["query"]),
  });
};

function getActor(agent: HttpAgent) {
  return Actor.createActor(jobIdlFactory as any, {
    agent,
    canisterId: JOB_CANISTER_ID,
  });
}

const STATUS_MAP: Record<string, JobStatus> = {
  Pending:                  "pending",
  InProgress:               "awaiting_contractor",
  Completed:                "awaiting_contractor",
  Verified:                 "verified",
  PendingHomeownerApproval: "pending_homeowner_approval",
  RejectedByHomeowner:      "awaiting_contractor",
};

function fromRaw(raw: any): Job {
  const statusKey = Object.keys(raw.status)[0] as string;
  return {
    id:             raw.id,
    propertyId:     raw.propertyId,
    serviceType:    raw.serviceType,
    description:    raw.description,
    amountCents:    Number(raw.amountCents),
    completedDate:  raw.completedDate,
    status:         STATUS_MAP[statusKey] ?? "pending",
    isDiy:          raw.isDiy,
    contractorName: raw.contractorName?.[0] ?? undefined,
  };
}

export async function getJobs(_propertyId: string, _agent?: HttpAgent): Promise<Job[]> {
  throw new Error("Not implemented: getJobs — wire to job canister getJobsForProperty");
}

export async function createJob(_input: CreateJobInput, _agent?: HttpAgent): Promise<Job> {
  throw new Error("Not implemented: createJob — wire to job canister createJob");
}

/**
 * Returns jobs submitted by contractors that are awaiting the homeowner's approval.
 */
export async function getPendingProposals(agent?: HttpAgent): Promise<Job[]> {
  if (!JOB_CANISTER_ID || !agent) {
    throw new Error("Not implemented: getPendingProposals — JOB_CANISTER_ID not configured");
  }
  const a = getActor(agent);
  const raw: any[] = await (a as any).getPendingProposals();
  return raw.map(fromRaw);
}

export async function uploadJobPhoto(
  _jobId: string,
  _base64: string,
  _agent?: HttpAgent,
): Promise<void> {
  throw new Error("Not implemented: uploadJobPhoto — wire to photo canister addPhoto");
}
