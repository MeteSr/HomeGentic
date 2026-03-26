import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
  const ServiceType = IDL.Variant({
    Roofing:     IDL.Null,
    HVAC:        IDL.Null,
    Plumbing:    IDL.Null,
    Electrical:  IDL.Null,
    Painting:    IDL.Null,
    Flooring:    IDL.Null,
    Windows:     IDL.Null,
    Landscaping: IDL.Null,
  });
  const JobStatus = IDL.Variant({
    Pending:    IDL.Null,
    InProgress: IDL.Null,
    Completed:  IDL.Null,
    Verified:   IDL.Null,
  });
  const Job = IDL.Record({
    id:               IDL.Text,
    propertyId:       IDL.Text,
    homeowner:        IDL.Principal,
    contractor:       IDL.Opt(IDL.Principal),
    title:            IDL.Text,
    serviceType:      ServiceType,
    description:      IDL.Text,
    contractorName:   IDL.Opt(IDL.Text),
    amount:           IDL.Nat,
    completedDate:    IDL.Int,
    permitNumber:     IDL.Opt(IDL.Text),
    warrantyMonths:   IDL.Opt(IDL.Nat),
    isDiy:            IDL.Bool,
    status:           JobStatus,
    verified:         IDL.Bool,
    homeownerSigned:  IDL.Bool,
    contractorSigned: IDL.Bool,
    createdAt:        IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:        IDL.Null,
    Unauthorized:    IDL.Null,
    InvalidInput:    IDL.Text,
    AlreadyVerified: IDL.Null,
  });
  return IDL.Service({
    linkContractor: IDL.Func(
      [IDL.Text, IDL.Principal],
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    getJobsPendingMySignature: IDL.Func(
      [],
      [IDL.Vec(Job)],
      ["query"]
    ),
    createJob: IDL.Func(
      [
        IDL.Text,         // propertyId
        IDL.Text,         // title
        ServiceType,      // serviceType
        IDL.Text,         // description
        IDL.Opt(IDL.Text),// contractorName
        IDL.Nat,          // amount (cents)
        IDL.Int,          // completedDate (nanoseconds)
        IDL.Opt(IDL.Text),// permitNumber
        IDL.Opt(IDL.Nat), // warrantyMonths
        IDL.Bool,         // isDiy
      ],
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    getJob: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Job, err: Error })],
      ["query"]
    ),
    getJobsForProperty: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(Job), err: Error })],
      ["query"]
    ),
    updateJobStatus: IDL.Func(
      [IDL.Text, JobStatus],
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    verifyJob: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    getMetrics: IDL.Func([], [IDL.Record({
      totalJobs:     IDL.Nat,
      pendingJobs:   IDL.Nat,
      completedJobs: IDL.Nat,
      verifiedJobs:  IDL.Nat,
      diyJobs:       IDL.Nat,
      isPaused:      IDL.Bool,
    })], ["query"]),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type JobStatus = "pending" | "in_progress" | "completed" | "verified";

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
}

// ─── Mock store ───────────────────────────────────────────────────────────────
// Used when JOB_CANISTER_ID is not configured (local dev without dfx, E2E tests).

const MOCK_JOBS: Job[] = [];

// ─── Actor ────────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: JOB_CANISTER_ID });
  }
  return _actor;
}

// ─── Converters ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, JobStatus> = {
  Pending:    "pending",
  InProgress: "in_progress",
  Completed:  "completed",
  Verified:   "verified",
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
  };
}

function unwrapJob(result: any): Job {
  if ("ok" in result) return fromJob(result.ok);
  const key = Object.keys(result.err)[0];
  const val = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const jobService = {
  async getByProperty(propertyId: string): Promise<Job[]> {
    if (!JOB_CANISTER_ID) {
      return MOCK_JOBS.filter((j) => j.propertyId === propertyId);
    }
    const a = await getActor();
    const result = await a.getJobsForProperty(propertyId);
    if ("ok" in result) return (result.ok as any[]).map(fromJob);
    throw new Error(Object.keys(result.err)[0]);
  },

  async getAll(): Promise<Job[]> {
    if (!JOB_CANISTER_ID) return [...MOCK_JOBS];
    // No canister equivalent for getAll — callers should use getByProperty
    return [];
  },

  async create(job: Omit<Job, "id" | "createdAt" | "status" | "photos" | "verified" | "homeownerSigned" | "contractorSigned" | "homeowner" | "contractor">): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const newJob: Job = {
        ...job,
        id: String(Date.now()),
        homeowner: "mock-principal",
        contractor: undefined,
        status: "pending",
        verified: false,
        homeownerSigned: false,
        contractorSigned: job.isDiy,
        photos: [],
        createdAt: Date.now(),
      };
      MOCK_JOBS.push(newJob);
      return newJob;
    }
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
    );
    return unwrapJob(result);
  },

  async updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const idx = MOCK_JOBS.findIndex((j) => j.id === jobId);
      if (idx === -1) throw new Error("Job not found");
      MOCK_JOBS[idx] = { ...MOCK_JOBS[idx], status };
      return MOCK_JOBS[idx];
    }
    const STATUS_CANISTER_MAP: Record<JobStatus, object> = {
      pending:     { Pending: null },
      in_progress: { InProgress: null },
      completed:   { Completed: null },
      verified:    { Verified: null },
    };
    const a = await getActor();
    const result = await a.updateJobStatus(jobId, STATUS_CANISTER_MAP[status]);
    return unwrapJob(result);
  },

  async verifyJob(jobId: string): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const idx = MOCK_JOBS.findIndex((j) => j.id === jobId);
      if (idx === -1) throw new Error("Job not found");
      const job = MOCK_JOBS[idx];
      const newHomeownerSigned  = true;
      const newContractorSigned = job.contractorSigned || job.isDiy;
      const fullyVerified       = newHomeownerSigned && newContractorSigned;
      MOCK_JOBS[idx] = {
        ...job,
        homeownerSigned:  newHomeownerSigned,
        contractorSigned: newContractorSigned,
        verified:         fullyVerified,
        status:           fullyVerified ? "verified" : job.status,
      };
      return MOCK_JOBS[idx];
    }
    const a = await getActor();
    const result = await a.verifyJob(jobId);
    return unwrapJob(result);
  },

  async linkContractor(jobId: string, contractorPrincipal: string): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const idx = MOCK_JOBS.findIndex((j) => j.id === jobId);
      if (idx === -1) throw new Error("Job not found");
      MOCK_JOBS[idx] = { ...MOCK_JOBS[idx], contractor: contractorPrincipal };
      return MOCK_JOBS[idx];
    }
    const a = await getActor();
    const { Principal: P } = await import("@dfinity/principal");
    const result = await a.linkContractor(jobId, P.fromText(contractorPrincipal));
    return unwrapJob(result);
  },

  async getJobsPendingMySignature(): Promise<Job[]> {
    if (!JOB_CANISTER_ID) return [];
    const a = await getActor();
    const result = await a.getJobsPendingMySignature();
    return (result as any[]).map(fromJob);
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

  reset() {
    _actor = null;
  },
};
