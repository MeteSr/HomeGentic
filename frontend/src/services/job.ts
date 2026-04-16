import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
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
    Pending:                   IDL.Null,
    InProgress:                IDL.Null,
    Completed:                 IDL.Null,
    Verified:                  IDL.Null,
    PendingHomeownerApproval:  IDL.Null,
    RejectedByHomeowner:       IDL.Null,
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
    sourceQuoteId:    IDL.Opt(IDL.Text),
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
        IDL.Opt(IDL.Text),// sourceQuoteId
      ],
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    getReferralJobs: IDL.Func(
      [],
      [IDL.Vec(Job)],
      ["query"]
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
    getCertificationData: IDL.Func(
      [IDL.Text],
      [IDL.Record({
        verifiedJobCount:   IDL.Nat,
        verifiedKeySystems: IDL.Vec(IDL.Text),
        meetsStructural:    IDL.Bool,
      })],
      ["query"]
    ),
    createInviteToken: IDL.Func(
      [IDL.Text, IDL.Text],   // jobId, propertyAddress
      [IDL.Variant({ ok: IDL.Text, err: Error })],
      []
    ),
    getJobByInviteToken: IDL.Func(
      [IDL.Text],             // token
      [IDL.Variant({
        ok: IDL.Record({
          jobId:           IDL.Text,
          title:           IDL.Text,
          serviceType:     ServiceType,
          description:     IDL.Text,
          amount:          IDL.Nat,
          completedDate:   IDL.Int,
          propertyAddress: IDL.Text,
          contractorName:  IDL.Opt(IDL.Text),
          expiresAt:       IDL.Int,
          alreadySigned:   IDL.Bool,
        }),
        err: Error,
      })],
      ["query"]
    ),
    redeemInviteToken: IDL.Func(
      [IDL.Text],             // token
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    createJobProposal: IDL.Func(
      [
        IDL.Text,          // propertyId
        IDL.Text,          // title
        ServiceType,       // serviceType
        IDL.Text,          // description
        IDL.Opt(IDL.Text), // contractorName
        IDL.Nat,           // amount (cents)
        IDL.Int,           // completedDate (nanoseconds)
        IDL.Opt(IDL.Text), // permitNumber
        IDL.Opt(IDL.Nat),  // warrantyMonths
      ],
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    getPendingProposals: IDL.Func(
      [],
      [IDL.Vec(Job)],
      ["query"]
    ),
    approveJobProposal: IDL.Func(
      [IDL.Text],   // jobId
      [IDL.Variant({ ok: Job, err: Error })],
      []
    ),
    rejectJobProposal: IDL.Func(
      [IDL.Text],   // jobId
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setPropertyCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type JobStatus = "pending" | "in_progress" | "completed" | "verified" | "pending_homeowner_approval" | "rejected_by_homeowner";

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
  // Seed from Playwright test globals if present (window.__e2e_jobs set by addInitScript)
  const mockJobs: Job[] =
    import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_jobs
      ? [...(window as any).__e2e_jobs]
      : [];

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
    if (!JOB_CANISTER_ID) {
      return mockJobs.filter((j) => j.propertyId === propertyId);
    }
    const a = await getActor();
    const result = await a.getJobsForProperty(propertyId);
    if ("ok" in result) return (result.ok as any[]).map(fromJob);
    throw new Error(Object.keys(result.err)[0]);
  },

  async getAll(): Promise<Job[]> {
    if (!JOB_CANISTER_ID) return [...mockJobs];
    // No canister equivalent for getAll — callers should use getByProperty
    return [];
  },

  async create(job: Omit<Job, "id" | "createdAt" | "status" | "photos" | "verified" | "homeownerSigned" | "contractorSigned" | "homeowner" | "contractor">): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const newJob: Job = {
        ...job,
        id: String(Date.now()),
        homeowner: (import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_principal) || "mock-principal",
        contractor: undefined,
        status: "pending",
        verified: false,
        homeownerSigned: false,
        contractorSigned: job.isDiy,
        photos: [],
        createdAt: Date.now(),
      };
      mockJobs.push(newJob);
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
      job.sourceQuoteId ? [job.sourceQuoteId] : [],            // ?Text
    );
    return unwrapJob(result);
  },

  async updateJob(jobId: string, updates: Partial<Pick<Job, "serviceType" | "contractorName" | "amount" | "date" | "description" | "permitNumber" | "warrantyMonths" | "isDiy">>): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const idx = mockJobs.findIndex((j) => j.id === jobId);
      if (idx === -1) throw new Error(`Job not found in mock store (id: ${jobId})`);
      mockJobs[idx] = { ...mockJobs[idx], ...updates };
      return mockJobs[idx];
    }
    // Canister updateJob not yet implemented — throw to signal unsupported
    throw new Error("Job editing is not yet available on-chain. Please contact support.");
  },

  async updateJobStatus(jobId: string, status: JobStatus): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const idx = mockJobs.findIndex((j) => j.id === jobId);
      if (idx === -1) throw new Error(`Job not found in mock store (id: ${jobId})`);
      mockJobs[idx] = { ...mockJobs[idx], status };
      return mockJobs[idx];
    }
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
    if (!JOB_CANISTER_ID) {
      const idx = mockJobs.findIndex((j) => j.id === jobId);
      if (idx === -1) throw new Error(`Job not found in mock store (id: ${jobId})`);
      const job = mockJobs[idx];
      const newHomeownerSigned  = true;
      const newContractorSigned = job.contractorSigned || job.isDiy;
      const fullyVerified       = newHomeownerSigned && newContractorSigned;
      mockJobs[idx] = {
        ...job,
        homeownerSigned:  newHomeownerSigned,
        contractorSigned: newContractorSigned,
        verified:         fullyVerified,
        status:           fullyVerified ? "verified" : job.status,
      };
      return mockJobs[idx];
    }
    const a = await getActor();
    const result = await a.verifyJob(jobId);
    return unwrapJob(result);
  },

  async linkContractor(jobId: string, contractorPrincipal: string): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const idx = mockJobs.findIndex((j) => j.id === jobId);
      if (idx === -1) throw new Error(`Job not found in mock store (id: ${jobId})`);
      mockJobs[idx] = { ...mockJobs[idx], contractor: contractorPrincipal };
      return mockJobs[idx];
    }
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
    if (!JOB_CANISTER_ID) {
      const KEY_SYSTEMS = ["HVAC", "Roofing", "Plumbing", "Electrical"];
      const propertyJobs = mockJobs.filter((j) => j.propertyId === propertyId && j.verified);
      const systems = [...new Set(propertyJobs.map((j) => j.serviceType).filter((s) => KEY_SYSTEMS.includes(s)))];
      return {
        verifiedJobCount:   propertyJobs.length,
        verifiedKeySystems: systems,
        meetsStructural:    propertyJobs.length >= 3 && systems.length >= 2,
      };
    }
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
    if (!JOB_CANISTER_ID) return `MOCK_INV_${jobId}`;
    const a = await getActor();
    const result = await a.createInviteToken(jobId, propertyAddress);
    if ("ok" in result) return result.ok as string;
    const key = Object.keys(result.err)[0];
    const val = (result.err as any)[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async getJobByInviteToken(token: string): Promise<InvitePreview> {
    if (!JOB_CANISTER_ID) {
      // Mock preview for development
      return {
        jobId:           "MOCK_JOB",
        title:           "HVAC Service",
        serviceType:     "HVAC",
        description:     "Annual HVAC tune-up and filter replacement",
        amount:          25000,
        completedDate:   Date.now(),
        propertyAddress: "123 Main St, Austin TX 78701",
        contractorName:  "Cool Air Services",
        expiresAt:       Date.now() + 48 * 60 * 60 * 1000,
        alreadySigned:   false,
      };
    }
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
    if (!JOB_CANISTER_ID) {
      return {
        id: "MOCK_JOB", propertyId: "1", homeowner: "mock",
        serviceType: "HVAC", amount: 25000,
        date: new Date().toISOString().split("T")[0],
        description: "Mock job", isDiy: false,
        status: "verified", verified: true,
        homeownerSigned: true, contractorSigned: true,
        photos: [], createdAt: Date.now(),
      };
    }
    const a = await getActor();
    const result = await a.redeemInviteToken(token);
    return unwrapJob(result);
  },

  /** Admin: return all jobs sourced via a HomeGentic quote request (referral fee pipeline). */
  async getReferralJobs(): Promise<Job[]> {
    if (!JOB_CANISTER_ID) return [];
    const a = await getActor();
    const raw: any[] = await a.getReferralJobs();
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
    if (!JOB_CANISTER_ID) {
      const proposal: Job = {
        id:               `PROPOSAL_${Date.now()}`,
        propertyId:       input.propertyId,
        homeowner:        "mock-homeowner",
        contractor:       (import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_principal) || "mock-contractor",
        serviceType:      input.serviceType,
        contractorName:   input.contractorName,
        amount:           input.amountCents,
        date:             input.completedDate,
        description:      input.description,
        isDiy:            false,
        permitNumber:     input.permitNumber,
        warrantyMonths:   input.warrantyMonths,
        status:           "pending_homeowner_approval",
        verified:         false,
        homeownerSigned:  false,
        contractorSigned: true,
        photos:           [],
        createdAt:        Date.now(),
      };
      mockJobs.push(proposal);
      return proposal;
    }
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
    if (!JOB_CANISTER_ID) {
      const pending = import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_pending_proposals;
      if (pending) return pending as Job[];
      return mockJobs.filter((j) => j.status === "pending_homeowner_approval");
    }
    const a = await getActor();
    const raw: any[] = await a.getPendingProposals();
    return raw.map(fromJob);
  },

  async approveJobProposal(jobId: string): Promise<Job> {
    if (!JOB_CANISTER_ID) {
      const idx = mockJobs.findIndex((j) => j.id === jobId);
      if (idx !== -1) {
        mockJobs[idx] = { ...mockJobs[idx], homeownerSigned: true, status: "pending" };
        return mockJobs[idx];
      }
      // Also check __e2e_pending_proposals mock
      const pending: Job[] = (import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_pending_proposals) || [];
      const pidx = pending.findIndex((j) => j.id === jobId);
      if (pidx !== -1) {
        const approved = { ...pending[pidx], homeownerSigned: true, status: "pending" as JobStatus };
        pending.splice(pidx, 1);
        mockJobs.push(approved);
        return approved;
      }
      throw new Error(`Job proposal not found in mock store or e2e pending list (id: ${jobId})`);
    }
    const a = await getActor();
    const result = await a.approveJobProposal(jobId);
    return unwrapJob(result);
  },

  async rejectJobProposal(jobId: string): Promise<void> {
    if (!JOB_CANISTER_ID) {
      const idx = mockJobs.findIndex((j) => j.id === jobId);
      if (idx !== -1) { mockJobs.splice(idx, 1); return; }
      const pending: Job[] = (import.meta.env.DEV && typeof window !== "undefined" && (window as any).__e2e_pending_proposals) || [];
      const pidx = pending.findIndex((j) => j.id === jobId);
      if (pidx !== -1) { pending.splice(pidx, 1); return; }
      throw new Error(`Job proposal not found in mock store or e2e pending list (id: ${jobId})`);
    }
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
    mockJobs.length = 0;
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
