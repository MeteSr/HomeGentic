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

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_JOBS: Job[] = [
  {
    id:            "job_1",
    propertyId:    "prop_1",
    serviceType:   "HVAC",
    description:   "Annual HVAC service and filter replacement",
    amountCents:   18000,
    completedDate: "2025-10-15",
    status:        "verified",
    isDiy:         false,
    contractorName: "Cool Air Services",
  },
  {
    id:            "job_2",
    propertyId:    "prop_1",
    serviceType:   "Plumbing",
    description:   "Fixed leaking kitchen faucet",
    amountCents:   32000,
    completedDate: "2025-08-03",
    status:        "verified",
    isDiy:         true,
  },
];

export async function getJobs(propertyId: string, _agent?: HttpAgent): Promise<Job[]> {
  // TODO: replace with real canister call
  return MOCK_JOBS.filter((j) => j.propertyId === propertyId);
}

export async function createJob(input: CreateJobInput, _agent?: HttpAgent): Promise<Job> {
  // TODO: replace with real canister call
  const newJob: Job = {
    id:             `job_${Date.now()}`,
    propertyId:     input.propertyId,
    serviceType:    input.serviceType,
    description:    input.description,
    amountCents:    input.amountCents,
    completedDate:  input.completedDate,
    status:         input.isDiy ? "verified" : "awaiting_contractor",
    isDiy:          input.isDiy,
    contractorName: input.contractorName ?? undefined,
  };
  MOCK_JOBS.push(newJob);
  return newJob;
}

/**
 * Returns jobs submitted by contractors that are awaiting the homeowner's
 * approval. Falls back to mock data when no canister ID is configured.
 */
export async function getPendingProposals(agent?: HttpAgent): Promise<Job[]> {
  if (!JOB_CANISTER_ID || !agent) {
    return MOCK_JOBS.filter((j) => j.status === "pending_homeowner_approval");
  }
  const a = getActor(agent);
  const raw: any[] = await (a as any).getPendingProposals();
  return raw.map(fromRaw);
}

export async function uploadJobPhoto(
  jobId: string,
  base64: string,
  _agent?: HttpAgent,
): Promise<void> {
  // TODO: replace with real photo canister call
  // Canister: photo.addPhoto(jobId, { data: base64, mimeType: "image/jpeg" })
  console.log(`[uploadJobPhoto] job=${jobId} size=${base64.length} chars`);
}
