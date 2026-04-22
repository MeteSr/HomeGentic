import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { IDL }              from "@icp-sdk/core/candid";
import { getIcpAgent }      from "./icpAgent";

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

const JOB_CANISTER_ID   = process.env.EXPO_PUBLIC_JOB_CANISTER_ID   ?? "";
const PHOTO_CANISTER_ID = process.env.EXPO_PUBLIC_PHOTO_CANISTER_ID ?? "";

const jobIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ServiceType = I.Variant({
    Roofing:     I.Null,
    HVAC:        I.Null,
    Plumbing:    I.Null,
    Electrical:  I.Null,
    Painting:    I.Null,
    Flooring:    I.Null,
    Windows:     I.Null,
    Landscaping: I.Null,
  } as Record<string, IDL.Type>);

  const JobStatus = I.Variant({
    Pending:                  I.Null,
    InProgress:               I.Null,
    Completed:                I.Null,
    Verified:                 I.Null,
    PendingHomeownerApproval: I.Null,
    RejectedByHomeowner:      I.Null,
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
    getPendingProposals:       I.Func([], [I.Vec(Job)], ["query"]),
    getJobsForProperty:        I.Func([I.Text], [I.Variant({ ok: I.Vec(Job), err: Error })], ["query"]),
    getJobsPendingMySignature: I.Func([], [I.Vec(Job)], ["query"]),
    createJob: I.Func(
      [
        I.Text,           // propertyId
        I.Text,           // title
        ServiceType,      // serviceType
        I.Text,           // description
        I.Opt(I.Text),    // contractorName
        I.Nat,            // amount (cents)
        I.Int,            // completedDate (nanoseconds)
        I.Opt(I.Text),    // permitNumber
        I.Opt(I.Nat),     // warrantyMonths
        I.Bool,           // isDiy
        I.Opt(I.Text),    // sourceQuoteId
      ],
      [I.Variant({ ok: Job, err: Error })],
      []
    ),
    verifyJob: I.Func([I.Text], [I.Variant({ ok: Job, err: Error })], []),
  });
};

const photoIdlFactory = ({ IDL: I }: { IDL: typeof IDL }) => {
  const ConstructionPhase = I.Variant({
    PostConstruction: I.Null,
    Listing:          I.Null,
  } as Record<string, IDL.Type>);

  const Error = I.Variant({
    NotFound:      I.Null,
    Unauthorized:  I.Null,
    QuotaExceeded: I.Text,
    Duplicate:     I.Text,
    InvalidInput:  I.Text,
  } as Record<string, IDL.Type>);

  const Photo = I.Record({
    id:          I.Text,
    jobId:       I.Text,
    propertyId:  I.Text,
    phase:       ConstructionPhase,
    description: I.Text,
    hash:        I.Text,
    size:        I.Nat,
    verified:    I.Bool,
    createdAt:   I.Int,
  });

  return I.Service({
    uploadPhoto: I.Func(
      [I.Text, I.Text, ConstructionPhase, I.Text, I.Text, I.Vec(I.Nat8)],
      [I.Variant({ ok: Photo, err: Error })],
      []
    ),
  });
};

function getJobActor(agent: HttpAgent) {
  return Actor.createActor(jobIdlFactory as any, { agent, canisterId: JOB_CANISTER_ID });
}

function getPhotoActor(agent: HttpAgent) {
  return Actor.createActor(photoIdlFactory as any, { agent, canisterId: PHOTO_CANISTER_ID });
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
  // completedDate on canister is stored as nanosecond timestamp; convert to YYYY-MM-DD
  const completedMs = Number(raw.completedDate) / 1_000_000;
  const completedDate = completedMs > 0
    ? new Date(completedMs).toISOString().slice(0, 10)
    : raw.completedDate ?? "";
  return {
    id:             raw.id,
    propertyId:     raw.propertyId,
    serviceType:    Object.keys(raw.serviceType)[0],
    description:    raw.description,
    amountCents:    Number(raw.amount),
    completedDate,
    status:         STATUS_MAP[statusKey] ?? "pending",
    isDiy:          raw.isDiy,
    contractorName: raw.contractorName?.[0] ?? undefined,
  };
}

function unwrap<T>(result: any): T {
  if ("ok" in result) return result.ok as T;
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

// ── Date helper ───────────────────────────────────────────────────────────────

/** Convert YYYY-MM-DD string to nanoseconds (BigInt) for the canister. */
function dateToNs(dateStr: string): bigint {
  return BigInt(new Date(dateStr).getTime()) * 1_000_000n;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getJobs(propertyId: string, agent?: HttpAgent): Promise<Job[]> {
  const a = getJobActor(agent ?? getIcpAgent());
  const result = await (a as any).getJobsForProperty(propertyId);
  const raw: any[] = unwrap(result);
  return raw.map(fromRaw);
}

export async function createJob(input: CreateJobInput, agent?: HttpAgent): Promise<Job> {
  const a = getJobActor(agent ?? getIcpAgent());
  const result = await (a as any).createJob(
    input.propertyId,
    input.description,           // title — use description as title on mobile
    { [input.serviceType]: null },
    input.description,
    input.contractorName ? [input.contractorName] : [],
    BigInt(input.amountCents),
    dateToNs(input.completedDate),
    input.permitNumber ? [input.permitNumber] : [],
    [],                           // warrantyMonths — not captured on mobile
    input.isDiy,
    [],                           // sourceQuoteId
  );
  return fromRaw(unwrap(result));
}

/**
 * Returns jobs submitted by contractors that are awaiting the homeowner's approval.
 */
export async function getPendingProposals(agent?: HttpAgent): Promise<Job[]> {
  const a = getJobActor(agent ?? getIcpAgent());
  const raw: any[] = await (a as any).getPendingProposals();
  return raw.map(fromRaw);
}

/**
 * Returns jobs where the current user's signature is still needed (homeowner or contractor).
 */
export async function getJobsPendingMySignature(agent?: HttpAgent): Promise<Job[]> {
  const a = getJobActor(agent ?? getIcpAgent());
  const raw: any[] = await (a as any).getJobsPendingMySignature();
  return raw.map(fromRaw);
}

/**
 * Signs (verifies) a job as the calling principal.
 */
export async function verifyJob(jobId: string, agent?: HttpAgent): Promise<Job> {
  const a = getJobActor(agent ?? getIcpAgent());
  const result = await (a as any).verifyJob(jobId);
  return fromRaw(unwrap(result));
}

/**
 * Uploads a base64-encoded photo to the photo canister for a given job.
 * Generates a random 64-char hex hash for canister-side deduplication.
 */
export async function uploadJobPhoto(
  jobId: string,
  propertyId: string,
  base64: string,
  agent?: HttpAgent,
): Promise<void> {
  // Convert base64 to Uint8Array
  const binaryStr = atob(base64.replace(/^data:[^;]+;base64,/, ""));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Generate a unique hash using crypto.getRandomValues (available in Expo via
  // react-native-get-random-values which is already a project dependency)
  const hashBytes = new Uint8Array(32);
  crypto.getRandomValues(hashBytes);
  const hash = Array.from(hashBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  const a = getPhotoActor(agent ?? getIcpAgent());
  const result = await (a as any).uploadPhoto(
    jobId,
    propertyId,
    { PostConstruction: null },
    "Job photo",
    hash,
    Array.from(bytes),
  );
  unwrap(result);
}
