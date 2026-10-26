import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { HttpAgent, Actor } from "@icp-sdk/core/agent";
import { idlFactory as jobIdlFactory }   from "@homegentic/shared/declarations/job";
import { idlFactory as photoIdlFactory } from "@homegentic/shared/declarations/photo";
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
  warrantyMonths?: number | null;
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
  verified:         boolean;
  homeownerSigned:  boolean;
  contractorSigned: boolean;
  /** Set when the job came from a HomeGentic quote request (referral fee applies). */
  sourceQuoteId?:   string;
  warrantyMonths?:  number;
}

// ── Canister wiring ───────────────────────────────────────────────────────────

const JOB_CANISTER_ID   = process.env.EXPO_PUBLIC_JOB_CANISTER_ID   ?? "";
const PHOTO_CANISTER_ID = process.env.EXPO_PUBLIC_PHOTO_CANISTER_ID ?? "";



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
    verified:         !!raw.verified,
    homeownerSigned:  !!raw.homeownerSigned,
    contractorSigned: !!raw.contractorSigned,
    sourceQuoteId:    raw.sourceQuoteId?.[0] ?? undefined,
    warrantyMonths:   raw.warrantyMonths?.length ? Number(raw.warrantyMonths[0]) : undefined,
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
    input.warrantyMonths ? [BigInt(input.warrantyMonths)] : [],
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
 * Verified jobs this contractor won through a HomeGentic quote request —
 * the ones a referral fee applies to.
 */
export async function getMyReferralJobs(agent?: HttpAgent): Promise<Job[]> {
  const a = getJobActor(agent ?? getIcpAgent());
  const raw: any[] = await (a as any).getMyReferralJobs();
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
 * Sends the bytes' SHA-256 (hex) as the photo hash.
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

  // SHA-256 of the bytes, as the web app sends: the photo canister de-duplicates
  // on it, and signed records rely on it naming the content.
  const hash = bytesToHex(sha256(bytes));

  const a = getPhotoActor(agent ?? getIcpAgent());
  const result = await (a as any).uploadPhoto(
    jobId,
    propertyId,
    { PostConstruction: null },
    "Job photo",
    hash,
    bytes,
  );
  unwrap(result);
}
