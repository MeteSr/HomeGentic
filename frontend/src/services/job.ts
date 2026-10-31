import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/job";
import { serviceTypeVariant, serviceTypeFromVariant } from "@homegentic/shared/serviceTypes";
import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";
import { candidErrorMessage } from "./candid";
import type * as JobTypes from "@homegentic/shared/types/job";
export { idlFactory };

const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type JobStatus = "pending" | "in_progress" | "completed" | "verified" | "pending_homeowner_approval" | "rejected_by_homeowner";

export interface JobSnapshot {
  serviceType:   string;
  completedYear: number;
  amountCents:   number;
  isDiy:         boolean;
  isVerified:    boolean;
}

export interface Job {
  id: string;
  propertyId: string;
  homeowner: string;         // principal text
  contractor?: string;       // principal text, undefined = no linked contractor yet
  serviceType: string;
  contractorName?: string;   // undefined = DIY
  amount: number;            // cents
  date: string;              // YYYY-MM-DD
  description: string;
  isDiy: boolean;
  permitNumber?: string;
  warrantyMonths?: number;
  status: JobStatus;
  verified: boolean;
  homeownerSigned: boolean;
  contractorSigned: boolean;
  photos: string[];
  createdAt: number;         // ms
  sourceQuoteId?: string;    // set when job was sourced via a HomeGentic quote request
  /** R2: dual-signed, but the contractor's profile was not verified when they
   *  signed. On-chain scores, certificates and reports don't count it as a
   *  verified job; the frontend score excludes it too. */
  contractorUnverified?: boolean;
}

export interface InvitePreview {
  jobId:           string;
  title:           string;
  serviceType:     string;
  description:     string;
  amount:          number;   // cents
  completedDate:   number;   // ms
  propertyAddress: string;
  contractorName?: string;
  expiresAt:       number;   // ms
  alreadySigned:   boolean;
}

/** Input shape accepted by jobService.create (mirrors the Candid createJob call). */
export type JobCreateInput = Omit<Job,
  "id" | "createdAt" | "status" | "photos" | "verified" |
  "homeownerSigned" | "contractorSigned" | "homeowner" | "contractor"
>;

// ─── Converters ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, JobStatus> = {
  Pending:                  "pending",
  InProgress:               "in_progress",
  Completed:                "completed",
  Verified:                 "verified",
  PendingHomeownerApproval: "pending_homeowner_approval",
  RejectedByHomeowner:      "rejected_by_homeowner",
};

function fromJob(raw: JobTypes.Job): Job {
  const statusKey      = Object.keys(raw.status)[0];
  // completedDate is Time.Time (nanoseconds as bigint)
  const date = new Date(Number(raw.completedDate) / 1_000_000).toISOString().split("T")[0];

  return {
    id:               raw.id,
    propertyId:       raw.propertyId,
    homeowner:        raw.homeowner.toText(),
    contractor:       raw.contractor[0]?.toText() ?? undefined,
    serviceType:      serviceTypeFromVariant(raw.serviceType),
    contractorName:   raw.contractorName[0] ?? undefined,
    amount:           Number(raw.amount),
    date,
    description:      raw.description,
    isDiy:            raw.isDiy,
    permitNumber:     raw.permitNumber[0] ?? undefined,
    warrantyMonths:   raw.warrantyMonths[0] !== undefined ? Number(raw.warrantyMonths[0]) : undefined,
    status:           STATUS_MAP[statusKey] ?? "pending",
    verified:         raw.verified,
    homeownerSigned:  raw.homeownerSigned,
    contractorSigned: raw.contractorSigned,
    photos:           [],  // photos live in the photo canister
    createdAt:        Number(raw.createdAt) / 1_000_000,
    sourceQuoteId:    raw.sourceQuoteId?.[0] ?? undefined,
  };
}

/** Whether the job canister's updateJob accepts this record: nobody has signed it and it isn't verified. */
export function isEditableRecord(job: Pick<Job, "verified" | "homeownerSigned" | "contractorSigned" | "isDiy" | "contractor">): boolean {
  return !job.verified && !job.homeownerSigned && !(job.contractorSigned && !job.isDiy) && !job.contractor;
}

function unwrapJob(result: any): Job {
  if ("ok" in result) return fromJob(result.ok);
  throw new Error(candidErrorMessage(result.err));
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createJobService() {

  const getActor = lazyActor<JobCanister>(idlFactory, JOB_CANISTER_ID);

  /** R2: flag jobs whose contractor signature came from an unverified
   *  contractor profile (job.getUnattestedJobIds). Best effort: on failure
   *  the jobs are returned unflagged. */
  async function markUnattested(a: any, propertyId: string, jobs: Job[]): Promise<Job[]> {
    if (!jobs.some((j) => j.verified && !j.isDiy)) return jobs;
    try {
      const ids = new Set<string>((await a.getUnattestedJobIds(propertyId)) as string[]);
      if (ids.size === 0) return jobs;
      return jobs.map((j) => (ids.has(j.id) ? { ...j, contractorUnverified: true } : j));
    } catch {
      return jobs;
    }
  }

  async function jobsForProperty(a: any, propertyId: string): Promise<Job[]> {
    const result = await a.getJobsForProperty(propertyId);
    if ("ok" in result) return markUnattested(a, propertyId, (result.ok as any[]).map(fromJob));
    throw new Error(Object.keys(result.err)[0]);
  }

  async function jobsForProperties(propertyIds: string[]): Promise<Job[]> {
    if (propertyIds.length === 0) return [];
    if (typeof window !== "undefined" && (window as any).__e2e_jobs) {
      const ids = new Set(propertyIds.map(String));
      return ((window as any).__e2e_jobs as any[]).filter((j: any) => ids.has(String(j.propertyId)));
    }
    const a = await getActor();
    let raw: any[];
    try {
      raw = await a.getJobsForProperties(propertyIds);
    } catch {
      return (await Promise.all(propertyIds.map((id) => jobsForProperty(a, id).catch(() => [] as Job[])))).flat();
    }
    const byProperty = new Map<string, Job[]>();
    for (const j of raw.map(fromJob)) byProperty.set(j.propertyId, [...(byProperty.get(j.propertyId) ?? []), j]);
    return (await Promise.all([...byProperty].map(([id, list]) => markUnattested(a, id, list)))).flat();
  }

  return {
  async getByProperty(propertyId: string): Promise<Job[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_jobs) {
      return ((window as any).__e2e_jobs as any[])
        .filter((j: any) => String(j.propertyId) === String(propertyId));
    }
    return jobsForProperty(await getActor(), propertyId);
  },

  /**
   * Jobs for several properties in one query call. Falls back to one
   * getByProperty per property when the job canister predates the batch call.
   */
  getByProperties: (propertyIds: string[]): Promise<Job[]> => jobsForProperties(propertyIds),

  async getJobSnapshotsForProperty(propertyId: string): Promise<JobSnapshot[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_jobs) {
      const year = new Date().getFullYear();
      return ((window as any).__e2e_jobs as any[])
        .filter((j: any) => String(j.propertyId) === String(propertyId))
        .map((j: any) => ({
          serviceType:   j.serviceType as string,
          completedYear: j.date ? parseInt(j.date.split("-")[0], 10) : year,
          amountCents:   j.amount as number,
          isDiy:         j.isDiy as boolean,
          isVerified:    j.status === "verified",
        }));
    }
    const a = await getActor();
    const snapshots = await a.getJobSnapshotsForProperty(propertyId);
    return (snapshots as any[]).map((s: any) => ({
      serviceType:   s.serviceType as string,
      completedYear: Number(s.completedYear),
      amountCents:   Number(s.amountCents),
      isDiy:         s.isDiy as boolean,
      isVerified:    s.isVerified as boolean,
    }));
  },

  async getAll(): Promise<Job[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_jobs) {
      return (window as any).__e2e_jobs as Job[];
    }
    // Aggregate across all properties the authenticated user owns.
    // Dynamic import avoids a circular dependency (property.ts ← job.ts).
    try {
      const { propertyService } = await import("./property");
      const properties = await propertyService.getMyProperties();
      if (properties.length === 0) return [];
      return await jobsForProperties(properties.map((p) => String(p.id)));
    } catch {
      return [];
    }
  },

  async create(job: Omit<Job, "id" | "createdAt" | "status" | "photos" | "verified" | "homeownerSigned" | "contractorSigned" | "homeowner" | "contractor">): Promise<Job> {
    const a = await getActor();
    const completedDateNs = BigInt(new Date(job.date).getTime()) * 1_000_000n;
    const result = await a.createJob(
      job.propertyId,
      job.serviceType,                                    // title = serviceType
      serviceTypeVariant(job.serviceType),                // ServiceType variant
      job.description,
      job.contractorName ? [job.contractorName] : [],     // ?Text
      BigInt(job.amount),
      completedDateNs,
      job.permitNumber   ? [job.permitNumber]   : [],     // ?Text
      job.warrantyMonths ? [BigInt(job.warrantyMonths)] : [],  // ?Nat
      job.isDiy,
      job.sourceQuoteId ? [job.sourceQuoteId] : [],            // ?Text
    );
    return unwrapJob(result);
  },

  /** Correct an unsigned record (the canister refuses once anyone has signed it or it's verified). */
  async updateJob(jobId: string, updates: Pick<Job, "serviceType" | "amount" | "date" | "description" | "isDiy"> & Partial<Pick<Job, "contractorName" | "permitNumber" | "warrantyMonths">>): Promise<Job> {
    const a = await getActor();
    const completedDateNs = BigInt(new Date(updates.date).getTime()) * 1_000_000n;
    const result = await a.updateJob(
      jobId,
      updates.serviceType,                                    // title = serviceType, as in create
      serviceTypeVariant(updates.serviceType),
      updates.description,
      !updates.isDiy && updates.contractorName ? [updates.contractorName] : [],
      BigInt(updates.amount),
      completedDateNs,
      updates.permitNumber   ? [updates.permitNumber]   : [],
      updates.warrantyMonths ? [BigInt(updates.warrantyMonths)] : [],
      updates.isDiy,
    );
    return unwrapJob(result);
  },

  async updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
    const STATUS_CANISTER_MAP: Record<JobStatus, JobTypes.JobStatus> = {
      pending:                    { Pending: null },
      in_progress:                { InProgress: null },
      completed:                  { Completed: null },
      verified:                   { Verified: null },
      pending_homeowner_approval: { PendingHomeownerApproval: null },
      rejected_by_homeowner:      { RejectedByHomeowner: null },
    };
    const a = await getActor();
    const result = await a.updateJobStatus(jobId, STATUS_CANISTER_MAP[status]);
    return unwrapJob(result);
  },

  async verifyJob(jobId: string): Promise<Job> {
    const a = await getActor();
    const result = await a.verifyJob(jobId);
    return unwrapJob(result);
  },

  async linkContractor(jobId: string, contractorPrincipal: string): Promise<Job> {
    const a = await getActor();
    const { Principal: P } = await import("@icp-sdk/core/principal");
    const result = await a.linkContractor(jobId, P.fromText(contractorPrincipal));
    return unwrapJob(result);
  },

  async getJobsPendingMySignature(): Promise<Job[]> {
    if (!JOB_CANISTER_ID) return [];
    const a = await getActor();
    const result = await a.getJobsPendingMySignature();
    return (result as any[]).map(fromJob);
  },

  async getCertificationData(propertyId: string): Promise<{ verifiedJobCount: number; verifiedKeySystems: string[]; meetsStructural: boolean }> {
    const a = await getActor();
    const raw = await a.getCertificationData(propertyId);
    return {
      verifiedJobCount:   Number(raw.verifiedJobCount),
      verifiedKeySystems: raw.verifiedKeySystems as string[],
      meetsStructural:    raw.meetsStructural as boolean,
    };
  },

  isDiy(job: Job): boolean {
    return job.isDiy === true;
  },

  getTotalValue(jobs: Job[]): number {
    return jobs.reduce((sum, j) => sum + j.amount, 0);
  },

  getVerifiedCount(jobs: Job[]): number {
    return jobs.filter((j) => j.status === "verified").length;
  },

  /** The canister puts the property's own address on the invite; `propertyAddress` is only its local-dev fallback. */
  async createInviteToken(jobId: string, propertyAddress: string): Promise<string> {
    const a = await getActor();
    const result = await a.createInviteToken(jobId, propertyAddress);
    if ("ok" in result) return result.ok as string;
    const key = Object.keys(result.err)[0];
    const val = (result.err as any)[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getJobByInviteToken(token: string): Promise<InvitePreview> {
    const a = await getActor();
    const result = await a.getJobByInviteToken(token);
    if ("ok" in result) {
      const r = result.ok as any;
      return {
        jobId:           r.jobId,
        title:           r.title,
        serviceType:     serviceTypeFromVariant(r.serviceType),
        description:     r.description,
        amount:          Number(r.amount),
        completedDate:   Number(r.completedDate) / 1_000_000,
        propertyAddress: r.propertyAddress,
        contractorName:  r.contractorName[0] ?? undefined,
        expiresAt:       Number(r.expiresAt) / 1_000_000,
        alreadySigned:   r.alreadySigned,
      };
    }
    const key = Object.keys(result.err)[0];
    const val = (result.err as any)[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async redeemInviteToken(
    token: string,
    identity: { contractorName: string; phone: string; email: string; licenseNumber?: string }
  ): Promise<Job> {
    const a = await getActor();
    const result = await a.redeemInviteToken(
      token,
      identity.contractorName,
      identity.phone,
      identity.email,
      identity.licenseNumber ? [identity.licenseNumber] : []
    );
    return unwrapJob(result);
  },

  /** Admin: return all jobs sourced via a HomeGentic quote request (referral fee pipeline). */
  async getReferralJobs(): Promise<Job[]> {
    const a = await getActor();
    const result: any = await a.getReferralJobs();
    if ("err" in result) {
      throw new Error(candidErrorMessage(result.err));
    }
    return (result.ok as any[]).map(fromJob);
  },

  /** The caller's own jobs sourced via a HomeGentic quote request — bids this contractor won. */
  async getMyReferralJobs(): Promise<Job[]> {
    const a = await getActor();
    const raw: any[] = await a.getMyReferralJobs();
    return raw.map(fromJob);
  },

  // ── Contractor-initiated job proposals ──────────────────────────────────────

  async createJobProposal(input: {
    propertyId:     string;
    serviceType:    string;
    description:    string;
    contractorName: string;
    amountCents:    number;
    completedDate:  string;  // YYYY-MM-DD
    permitNumber?:  string;
    warrantyMonths?: number;
  }): Promise<Job> {
    const a = await getActor();
    const completedDateNs = BigInt(new Date(input.completedDate).getTime()) * 1_000_000n;
    const result = await a.createJobProposal(
      input.propertyId,
      input.serviceType,                               // title = serviceType label
      serviceTypeVariant(input.serviceType),           // ServiceType variant
      input.description,
      [input.contractorName],                          // ?Text
      BigInt(input.amountCents),
      completedDateNs,
      input.permitNumber   ? [input.permitNumber]   : [],
      input.warrantyMonths ? [BigInt(input.warrantyMonths)] : [],
    );
    return unwrapJob(result);
  },

  async getPendingProposals(): Promise<Job[]> {
    const a = await getActor();
    const raw: any[] = await a.getPendingProposals();
    return raw.map(fromJob);
  },

  async approveJobProposal(jobId: string): Promise<Job> {
    const a = await getActor();
    const result = await a.approveJobProposal(jobId);
    return unwrapJob(result);
  },

  async rejectJobProposal(jobId: string): Promise<void> {
    const a = await getActor();
    const result = await a.rejectJobProposal(jobId);
    if ("err" in result) {
      const key = Object.keys(result.err)[0];
      const val = (result.err as any)[key];
      throw new Error(typeof val === "string" ? val : key);
    }
  },

  reset() {
    getActor.reset();
  },
  };
}

export const jobService = createJobService();

// ─── Insurance relevance ──────────────────────────────────────────────────────

/** Service types that insurers commonly require documentation for. */
export const INSURANCE_SERVICE_TYPES = new Set([
  "Roofing", "HVAC", "Electrical", "Plumbing", "Foundation",
]);

export function isInsuranceRelevant(serviceType: string): boolean {
  return INSURANCE_SERVICE_TYPES.has(serviceType);
}
