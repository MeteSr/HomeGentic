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
  // OQL (backend/shared/Oql.mo): rows of named cells.
  const OqlCellValue = IDL.Variant({
    text:  IDL.Text,
    int:   IDL.Int,
    float: IDL.Float64,
    bool:  IDL.Bool,
    null:  IDL.Null,
  });
  const OqlCell = IDL.Record({ name: IDL.Text, value: OqlCellValue });
  const OqlResult = IDL.Record({ hasMore: IDL.Bool, rows: IDL.Vec(IDL.Vec(OqlCell)) });
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
  const CostCategory = IDL.Variant({ Improvement: IDL.Null, Repair: IDL.Null });
  // #716: permit close-out and lien waivers.
  const PermitStatus = IDL.Variant({ Open: IDL.Null, Closed: IDL.Null, Expired: IDL.Null });
  const PaperKind = IDL.Variant({ FinalLienWaiver: IDL.Null, NoticeOfCommencement: IDL.Null });
  const JobPaper = IDL.Record({
    kind:    PaperKind,
    photoId: IDL.Text,
    addedBy: IDL.Principal,
    addedAt: IDL.Int,
  });
  const JobCloseout = IDL.Record({
    jobId:        IDL.Text,
    permitStatus: IDL.Opt(PermitStatus),
    papers:       IDL.Vec(JobPaper),
  });
  const Error = IDL.Variant({
    NotFound:        IDL.Null,
    NotAuthorized:   IDL.Null,
    InvalidInput:    IDL.Text,
    AlreadyVerified: IDL.Null,
    TierLimitReached: IDL.Text,
    Paused: IDL.Null,
    RateLimited: IDL.Null,
    Unavailable: IDL.Text,
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
  // #717: private calendar subscribe link.
  const CalendarEvent = IDL.Record({
    uid:         IDL.Text,
    date:        IDL.Text,
    title:       IDL.Text,
    description: IDL.Text,
    rrule:       IDL.Text,
  });
  const CalendarFeedStatus = IDL.Record({
    token:      IDL.Text,
    version:    IDL.Text,
    eventCount: IDL.Nat,
    updatedAt:  IDL.Int,
  });
  const CalendarFeedView = IDL.Record({ events: IDL.Vec(CalendarEvent), updatedAt: IDL.Int });
  return IDL.Service({
    getApiDoc: IDL.Func([], [IDL.Text], ["query"]),
    // OQL for AI assistants: a JSON catalogue, and one JSON query -> paged rows.
    schema:  IDL.Func([], [IDL.Text], ["query"]),
    execute: IDL.Func([IDL.Text], [OqlResult], ["composite_query"]),
    getMyInboxToken:    IDL.Func([], [TextResult], []),
    resetMyInboxToken:  IDL.Func([], [TextResult], []),
    relayAddEmailDraft: IDL.Func([IDL.Text, EmailDraftInput], [TextResult], []),
    relayCheckInboxToken: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ accepting: IDL.Null, unknown: IDL.Null, full: IDL.Null })],
      ["query"],
    ),
    getMyEmailDrafts:   IDL.Func([], [IDL.Vec(EmailDraft)], ["query"]),
    dismissEmailDraft:  IDL.Func([IDL.Text], [UnitResult], []),
    addInboxRelay:      IDL.Func([IDL.Principal], [UnitResult], []),
    removeInboxRelay:   IDL.Func([IDL.Principal], [UnitResult], []),
    getMyCalendarFeed:       IDL.Func([], [IDL.Opt(CalendarFeedStatus)], ["query"]),
    enableMyCalendarFeed:    IDL.Func([], [TextResult], []),
    resetMyCalendarFeed:     IDL.Func([], [TextResult], []),
    disableMyCalendarFeed:   IDL.Func([], [UnitResult], []),
    publishMyCalendarEvents: IDL.Func([IDL.Text, IDL.Vec(CalendarEvent)], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
    getCalendarFeed:         IDL.Func([IDL.Text], [IDL.Opt(CalendarFeedView)], ["query"]),
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
    updateJob: IDL.Func(
      [
        IDL.Text,         // jobId
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
    getJobsForProperties: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(Job)], ["composite_query"]),
    // #716: permit status and close-out papers per job.
    getJobCloseouts: IDL.Func([IDL.Vec(IDL.Text)], [IDL.Vec(JobCloseout)], ["composite_query"]),
    setPermitStatus: IDL.Func(
      [IDL.Text, IDL.Opt(PermitStatus)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    addJobPaper: IDL.Func(
      [IDL.Text, PaperKind, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    removeJobPaper: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // #713: the owner's improvement/repair marks, as (jobId, category) pairs.
    getJobCostCategories: IDL.Func(
      [IDL.Vec(IDL.Text)],
      [IDL.Vec(IDL.Tuple(IDL.Text, CostCategory))],
      ["composite_query"]
    ),
    setJobCostCategory: IDL.Func(
      [IDL.Text, IDL.Opt(CostCategory)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // Verified local costs: the owner's per-home sharing switch and the
    // anonymous range anyone can read (cents; homes rounded down to 5s).
    setCostSharing: IDL.Func(
      [IDL.Text, IDL.Bool],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getMyCostSharing: IDL.Func([], [IDL.Vec(IDL.Text)], ["query"]),
    getVerifiedLocalCosts: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Opt(IDL.Record({
        low: IDL.Nat, median: IDL.Nat, high: IDL.Nat, homes: IDL.Nat, area: IDL.Text,
      }))],
      ["query"]
    ),
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
      [IDL.Text, IDL.Text],   // jobId, typed address (local-dev fallback; the canister reads the property's)
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
