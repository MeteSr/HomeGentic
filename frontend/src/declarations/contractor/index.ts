// Candid interface for the contractor canister — keep in sync with backend/contractor/main.mo
export const idlFactory = ({ IDL }: any) => {
  const ServiceType = IDL.Variant({
    Roofing: IDL.Null, HVAC: IDL.Null, Plumbing: IDL.Null, Electrical: IDL.Null,
    Painting: IDL.Null, Flooring: IDL.Null, Windows: IDL.Null, Landscaping: IDL.Null,
    Gutters: IDL.Null, GeneralHandyman: IDL.Null, Pest: IDL.Null, Concrete: IDL.Null,
    Fencing: IDL.Null, Insulation: IDL.Null, Solar: IDL.Null, Pool: IDL.Null,
  });
  const ContractorProfile = IDL.Record({
    id:            IDL.Principal,
    name:          IDL.Text,
    specialties:   IDL.Vec(ServiceType),
    email:         IDL.Text,
    phone:         IDL.Text,
    bio:           IDL.Opt(IDL.Text),
    licenseNumber: IDL.Opt(IDL.Text),
    serviceArea:   IDL.Opt(IDL.Text),
    serviceZips:   IDL.Vec(IDL.Text),
    trustScore:    IDL.Nat,
    jobsCompleted: IDL.Nat,
    isVerified:    IDL.Bool,
    createdAt:     IDL.Int,
    notifyEmail:   IDL.Opt(IDL.Text),
    notifyPush:    IDL.Opt(IDL.Bool),
    alertZips:     IDL.Vec(IDL.Text),
  });
  const NotificationPrefsArgs = IDL.Record({
    notifyEmail: IDL.Opt(IDL.Text),
    notifyPush:  IDL.Opt(IDL.Bool),
    alertZips:   IDL.Vec(IDL.Text),
  });
  const RegisterArgs = IDL.Record({
    name:        IDL.Text,
    specialties: IDL.Vec(ServiceType),
    email:       IDL.Text,
    phone:       IDL.Text,
  });
  const UpdateArgs = IDL.Record({
    name:          IDL.Text,
    specialties:   IDL.Vec(ServiceType),
    email:         IDL.Text,
    phone:         IDL.Text,
    bio:           IDL.Opt(IDL.Text),
    licenseNumber: IDL.Opt(IDL.Text),
    serviceArea:   IDL.Opt(IDL.Text),
    serviceZips:   IDL.Vec(IDL.Text),
  });
  const Review = IDL.Record({
    id:         IDL.Text,
    contractor: IDL.Principal,
    reviewer:   IDL.Principal,
    rating:     IDL.Nat,
    comment:    IDL.Text,
    jobId:      IDL.Text,
    createdAt:  IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound:          IDL.Null,
    AlreadyExists:     IDL.Null,
    NotAuthorized:     IDL.Null,
    Paused:            IDL.Null,
    RateLimitExceeded: IDL.Null,
    InvalidInput:      IDL.Text,
  });
  return IDL.Service({
    register: IDL.Func(
      [RegisterArgs],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      []
    ),
    updateProfile: IDL.Func(
      [UpdateArgs],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      []
    ),
    getMyProfile: IDL.Func(
      [],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      ["query"]
    ),
    getContractor: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      ["query"]
    ),
    getAll: IDL.Func([], [IDL.Vec(ContractorProfile)], ["query"]),
    getPage: IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(ContractorProfile)], ["query"]),
    getBySpecialty: IDL.Func([ServiceType], [IDL.Vec(ContractorProfile)], ["query"]),
    submitReview: IDL.Func(
      [IDL.Principal, IDL.Nat, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: Review, err: Error })],
      []
    ),
    getReviewsForContractor: IDL.Func(
      [IDL.Principal],
      [IDL.Vec(Review)],
      ["query"]
    ),
    recordJobVerified: IDL.Func(
      [IDL.Principal, IDL.Text, IDL.Text, IDL.Principal],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getCredentials: IDL.Func(
      [IDL.Principal],
      [IDL.Vec(IDL.Record({
        id:                 IDL.Nat,
        jobId:              IDL.Text,
        contractorId:       IDL.Principal,
        serviceType:        IDL.Text,
        verifiedAt:         IDL.Int,
        homeownerPrincipal: IDL.Principal,
      }))],
      ["query"]
    ),
    setJobCanisterId: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    verifyContractor: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      []
    ),
    updateNotificationPrefs: IDL.Func(
      [NotificationPrefsArgs],
      [IDL.Variant({ ok: ContractorProfile, err: Error })],
      []
    ),
  });
};
