// Candid interface for the job canister — keep in sync with backend/job/main.mo
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
    NotAuthorized:   IDL.Null,
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
    setPropertyCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
  });
};
