import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/job";
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

function fromJob(raw: any): Job {
  const statusKey      = Object.keys(raw.status)[0];
  const serviceTypeKey = Object.keys(raw.serviceType)[0];
  // completedDate is Time.Time (nanoseconds as bigint)
  const date = new Date(Number(raw.completedDate) / 1_000_000).toISOString().split("T")[0];

  return {
    id:               raw.id,
    propertyId:       raw.propertyId,
    homeowner:        raw.homeowner.toText(),
    contractor:       raw.contractor[0]?.toText() ?? undefined,
    serviceType:      serviceTypeKey,
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

function unwrapJob(result: any): Job {
  if ("ok" in result) return fromJob(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createJobService() {
  let _actor: any = null;

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: JOB_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async getByProperty(propertyId: string): Promise<Job[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_jobs) {
      return ((window as any).__e2e_jobs as any[])
        .filter((j: any) => String(j.propertyId) === String(propertyId));
    }
    const a = await getActor();
    const result = await a.getJobsForProperty(propertyId);
    if ("ok" in result) return (result.ok as any[]).map(fromJob);
    throw new Error(Object.keys(result.err)[0]);
  },

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
      const results = await Promise.all(
        properties.map(async (p) => {
          const a = await getActor();
          const result = await a.getJobsForProperty(String(p.id));
          if ("ok" in result) return (result.ok as any[]).map(fromJob);
          return [] as Job[];
        })
      );
      return results.flat();
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
      { [job.serviceType]: null },                        // ServiceType variant
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

  async updateJob(jobId: string, updates: Partial<Pick<Job, "serviceType" | "contractorName" | "amount" | "date" | "description" | "permitNumber" | "warrantyMonths" | "isDiy">>): Promise<Job> {
    // Canister updateJob not yet implemented — throw to signal unsupported
    throw new Error("Job editing is not yet available on-chain. Please contact support.");
  },

  async updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
    const STATUS_CANISTER_MAP: Record<JobStatus, object> = {
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
        serviceType:     Object.keys(r.serviceType)[0],
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

  async redeemInviteToken(token: string): Promise<Job> {
    const a = await getActor();
    const result = await a.redeemInviteToken(token);
    return unwrapJob(result);
  },

  /** Admin: return all jobs sourced via a HomeGentic quote request (referral fee pipeline). */
  async getReferralJobs(): Promise<Job[]> {
    const a = await getActor();
    const raw: any[] = await a.getReferralJobs();
    return raw.map(fromJob);
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
      { [input.serviceType]: null },                   // ServiceType variant
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
    _actor = null;
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
