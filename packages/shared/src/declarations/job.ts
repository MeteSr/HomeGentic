// Candid interface for the job canister — keep in sync with backend/job/main.mo
import { serviceTypeIdl } from "../serviceTypes";
export const idlFactory = ({ IDL }: any) => {
  const ServiceType = serviceTypeIdl(IDL);
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
    NotAuthorized:   IDL.Null,
    InvalidInput:    IDL.Text,
    AlreadyVerified: IDL.Null,
    TierLimitReached: IDL.Text,
  });
  const EmailDraftInput = IDL.Record({
    fromAddress:    IDL.Text,
    subject:        IDL.Text,
    title:          IDL.Text,
    serviceType:    IDL.Text,
    contractorName: IDL.Text,
    amountCents:    IDL.Nat,
    completedDate:  IDL.Text,
    warrantyMonths: IDL.Nat,
    description:    IDL.Text,
  });
  const EmailDraft = IDL.Record({
    id:             IDL.Text,
    owner:          IDL.Principal,
    receivedAt:     IDL.Int,
    fromAddress:    IDL.Text,
    subject:        IDL.Text,
    title:          IDL.Text,
    serviceType:    IDL.Text,
    contractorName: IDL.Text,
    amountCents:    IDL.Nat,
    completedDate:  IDL.Text,
    warrantyMonths: IDL.Nat,
    description:    IDL.Text,
  });
  const UnitResult = IDL.Variant({ ok: IDL.Null, err: Error });
  const TextResult = IDL.Variant({ ok: IDL.Text, err: Error });
  return IDL.Service({
    getMyInboxToken:    IDL.Func([], [TextResult], []),
    resetMyInboxToken:  IDL.Func([], [TextResult], []),
    relayAddEmailDraft: IDL.Func([IDL.Text, EmailDraftInput], [TextResult], []),
    getMyEmailDrafts:   IDL.Func([], [IDL.Vec(EmailDraft)], ["query"]),
    dismissEmailDraft:  IDL.Func([IDL.Text], [UnitResult], []),
    addInboxRelay:      IDL.Func([IDL.Principal], [UnitResult], []),
    removeInboxRelay:   IDL.Func([IDL.Principal], [UnitResult], []),
    deleteMyData: IDL.Func([], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
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
    getMyReferralJobs: IDL.Func(
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
      [IDL.Variant({ ok: IDL.Vec(Job), err: Error })],
      []  // admin only: update call, returns #err(#NotAuthorized) otherwise
    ),
    getJob: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: Job, err: Error })],
      ["query"]
    ),
    // The owner, admins, trusted canisters and the notification relay (weekly Home Pulse email).
    getJobsByOwner: IDL.Func([IDL.Principal], [IDL.Vec(Job)], ["query"]),
    getJobsForProperty: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(Job), err: Error })],
      [] // update call — has inter-canister await for ownership check
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
      [
        IDL.Text,            // token
        IDL.Text,            // contractorName
        IDL.Text,            // phone
        IDL.Text,            // email
        IDL.Opt(IDL.Text),   // licenseNumber
      ],
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
    getJobSnapshotsForProperty: IDL.Func(
      [IDL.Text],
      [IDL.Vec(IDL.Record({
        serviceType:   IDL.Text,
        completedYear: IDL.Nat,
        amountCents:   IDL.Nat,
        isDiy:         IDL.Bool,
        isVerified:    IDL.Bool,
      }))],
      ["query"]
    ),
    // R2: dual-signed jobs whose contractor signature came from an unverified
    // contractor profile (excluded from scores / certificates / reports).
    getUnattestedJobIds: IDL.Func([IDL.Text], [IDL.Vec(IDL.Text)], ["query"]),
    setPropertyCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    setFeeCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};
