// Generated from ../declarations/job.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type UnitResult = { ok: null } | { err: Error };

export type Error =
  | { InvalidInput: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { AlreadyVerified: null }
  | { TierLimitReached: string };

export type Job = {
  id: string;
  completedDate: bigint;
  status: JobStatus;
  title: string;
  serviceType: ServiceType;
  verified: boolean;
  contractorSigned: boolean;
  permitNumber: [] | [string];
  createdAt: bigint;
  description: string;
  propertyId: string;
  homeownerSigned: boolean;
  warrantyMonths: [] | [bigint];
  sourceQuoteId: [] | [string];
  isDiy: boolean;
  homeowner: Principal;
  amount: bigint;
  contractorName: [] | [string];
  contractor: [] | [Principal];
};

export type JobStatus =
  | { RejectedByHomeowner: null }
  | { PendingHomeownerApproval: null }
  | { InProgress: null }
  | { Verified: null }
  | { Completed: null }
  | { Pending: null };

export type ServiceType =
  | { Solar: null }
  | { HVAC: null }
  | { Foundation: null }
  | { Pest: null }
  | { Pool: null }
  | { Plumbing: null }
  | { Painting: null }
  | { Concrete: null }
  | { Fencing: null }
  | { Gutters: null }
  | { Insulation: null }
  | { Landscaping: null }
  | { Drywall: null }
  | { Windows: null }
  | { Electrical: null }
  | { Flooring: null }
  | { Other: null }
  | { BathroomRemodel: null }
  | { Roofing: null }
  | { KitchenRemodel: null }
  | { GeneralHandyman: null };

export type EmailDraft = {
  id: string;
  completedDate: string;
  title: string;
  serviceType: string;
  subject: string;
  fromAddress: string;
  owner: Principal;
  description: string;
  amountCents: bigint;
  receivedAt: bigint;
  warrantyMonths: bigint;
  contractorName: string;
};

export type TextResult = { ok: string } | { err: Error };

export type EmailDraftInput = {
  completedDate: string;
  title: string;
  serviceType: string;
  subject: string;
  fromAddress: string;
  description: string;
  amountCents: bigint;
  warrantyMonths: bigint;
  contractorName: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addInboxRelay: ActorMethod<[Principal], UnitResult>;
  approveJobProposal: ActorMethod<[string], { ok: Job } | { err: Error }>;
  createInviteToken: ActorMethod<[string, string], { ok: string } | { err: Error }>;
  createJob: ActorMethod<
    [
      string,
      string,
      ServiceType,
      string,
      [] | [string],
      bigint,
      bigint,
      [] | [string],
      [] | [bigint],
      boolean,
      [] | [string],
    ],
    { ok: Job } | { err: Error }
  >;
  createJobProposal: ActorMethod<
    [string, string, ServiceType, string, [] | [string], bigint, bigint, [] | [string], [] | [bigint]],
    { ok: Job } | { err: Error }
  >;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  dismissEmailDraft: ActorMethod<[string], UnitResult>;
  getCertificationData: ActorMethod<
    [string],
    {
      verifiedKeySystems: string[];
      meetsStructural: boolean;
      verifiedJobCount: bigint;
    }
  >;
  getJob: ActorMethod<[string], { ok: Job } | { err: Error }>;
  getJobByInviteToken: ActorMethod<
    [string],
    | {
        ok: {
          completedDate: bigint;
          title: string;
          serviceType: ServiceType;
          expiresAt: bigint;
          alreadySigned: boolean;
          jobId: string;
          description: string;
          propertyAddress: string;
          amount: bigint;
          contractorName: [] | [string];
        };
      }
    | { err: Error }
  >;
  getJobSnapshotsForProperty: ActorMethod<
    [string],
    Array<{
      serviceType: string;
      completedYear: bigint;
      amountCents: bigint;
      isVerified: boolean;
      isDiy: boolean;
    }>
  >;
  getJobsByOwner: ActorMethod<[Principal], Job[]>;
  getJobsForProperties: ActorMethod<[string[]], Job[]>;
  getJobsForProperty: ActorMethod<[string], { ok: Job[] } | { err: Error }>;
  getJobsPendingMySignature: ActorMethod<[], Job[]>;
  getMetrics: ActorMethod<
    [],
    {
      completedJobs: bigint;
      diyJobs: bigint;
      isPaused: boolean;
      verifiedJobs: bigint;
      totalJobs: bigint;
      pendingJobs: bigint;
    }
  >;
  getMyEmailDrafts: ActorMethod<[], EmailDraft[]>;
  getMyInboxToken: ActorMethod<[], TextResult>;
  getMyReferralJobs: ActorMethod<[], Job[]>;
  getPendingProposals: ActorMethod<[], Job[]>;
  getReferralJobs: ActorMethod<[], { ok: Job[] } | { err: Error }>;
  getUnattestedJobIds: ActorMethod<[string], string[]>;
  linkContractor: ActorMethod<[string, Principal], { ok: Job } | { err: Error }>;
  redeemInviteToken: ActorMethod<[string, string, string, string, [] | [string]], { ok: Job } | { err: Error }>;
  rejectJobProposal: ActorMethod<[string], { ok: null } | { err: Error }>;
  relayAddEmailDraft: ActorMethod<[string, EmailDraftInput], TextResult>;
  relayCheckInboxToken: ActorMethod<[string], { full: null } | { accepting: null } | { unknown: null }>;
  removeInboxRelay: ActorMethod<[Principal], UnitResult>;
  resetMyInboxToken: ActorMethod<[], TextResult>;
  setFeeCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setPropertyCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  updateJob: ActorMethod<
    [string, string, ServiceType, string, [] | [string], bigint, bigint, [] | [string], [] | [bigint], boolean],
    { ok: Job } | { err: Error }
  >;
  updateJobStatus: ActorMethod<[string, JobStatus], { ok: Job } | { err: Error }>;
  verifyJob: ActorMethod<[string], { ok: Job } | { err: Error }>;
}
