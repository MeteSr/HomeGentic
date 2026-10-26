// Candid interface for the contractor canister — keep in sync with backend/contractor/main.mo
import { serviceTypeIdl } from "../serviceTypes";
export const idlFactory = ({ IDL }: any) => {
  const ServiceType = serviceTypeIdl(IDL);
  const ContractorOrigin = IDL.Variant({
    SelfRegistered: IDL.Null,
    GuestSigned:    IDL.Text,
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
    origin:        ContractorOrigin,
  });
  const ProfilePrivacy = IDL.Record({
    listed:            IDL.Bool,
    showTrustScore:    IDL.Bool,
    showJobsCompleted: IDL.Bool,
  });
  const LeadAlertTarget = IDL.Record({
    id:            IDL.Principal,
    specialties:   IDL.Vec(ServiceType),
    serviceZips:   IDL.Vec(IDL.Text),
    alertZips:     IDL.Vec(IDL.Text),
    notifyPush:    IDL.Opt(IDL.Bool),
    trustScore:    IDL.Nat,
    jobsCompleted: IDL.Nat,
    isVerified:    IDL.Bool,
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
  const LicenseCheckFields = {
    licenseNumber: IDL.Text,
    found:         IDL.Bool,
    licenseeName:  IDL.Text,
    dbaName:       IDL.Text,
    licenseType:   IDL.Text,
    status:        IDL.Text,
    active:        IDL.Bool,
    expiresOn:     IDL.Text,
    nameMatches:   IDL.Bool,
    sourceDate:    IDL.Text,
  };
  const LicenseCheckInput = IDL.Record(LicenseCheckFields);
  const LicenseCheck = IDL.Record({ ...LicenseCheckFields, checkedAt: IDL.Int });
  const PortfolioInput = IDL.Record({ credentialId: IDL.Nat, title: IDL.Text, description: IDL.Text });
  const PortfolioItem = IDL.Record({
    credentialId: IDL.Nat,
    title:        IDL.Text,
    description:  IDL.Text,
    serviceType:  IDL.Text,
    verifiedAt:   IDL.Int,
    featuredAt:   IDL.Int,
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
    deleteMyData: IDL.Func([], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
    relayRecordLicenseCheck: IDL.Func(
      [IDL.Principal, LicenseCheckInput],
      [IDL.Variant({ ok: LicenseCheck, err: Error })],
      []
    ),
    getLicenseCheck: IDL.Func([IDL.Principal], [IDL.Opt(LicenseCheck)], ["query"]),
    setPortfolio: IDL.Func([IDL.Vec(PortfolioInput)], [IDL.Variant({ ok: IDL.Vec(PortfolioItem), err: Error })], []),
    getPortfolio: IDL.Func([IDL.Principal], [IDL.Vec(PortfolioItem)], ["query"]),
    setPaymentCanisterId: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    addLicenseRelay: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    removeLicenseRelay: IDL.Func([IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
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
    getLeadAlertTargets: IDL.Func([], [IDL.Vec(LeadAlertTarget)], ["query"]),
    setProfilePrivacy: IDL.Func(
      [ProfilePrivacy],
      [IDL.Variant({ ok: ProfilePrivacy, err: Error })],
      []
    ),
    getMyProfilePrivacy: IDL.Func([], [ProfilePrivacy], ["query"]),
    getProfilePrivacies: IDL.Func([IDL.Vec(IDL.Principal)], [IDL.Vec(ProfilePrivacy)], ["query"]),
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
    // Job-canister-only cross-call (see backend/job/main.mo redeemInviteToken).
    // Declared here for candid-contract-test parity; the frontend never calls it directly.
    createOrLinkGuestProfile: IDL.Func(
      [IDL.Principal, IDL.Text, IDL.Text, IDL.Text, IDL.Opt(IDL.Text), IDL.Text, IDL.Text],
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
