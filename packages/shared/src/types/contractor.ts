// Generated from ../declarations/contractor.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  | { Paused: null }
  | { InvalidInput: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { AlreadyExists: null }
  | { RateLimitExceeded: null };

export type ContractorProfile = {
  id: Principal;
  bio: [] | [string];
  serviceArea: [] | [string];
  jobsCompleted: bigint;
  alertZips: string[];
  serviceZips: string[];
  name: string;
  createdAt: bigint;
  origin: ContractorOrigin;
  trustScore: bigint;
  email: string;
  isVerified: boolean;
  licenseNumber: [] | [string];
  specialties: ServiceType[];
  notifyPush: [] | [boolean];
  notifyEmail: [] | [string];
  phone: string;
};

export type ContractorOrigin = { GuestSigned: string } | { SelfRegistered: null };

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

export type LeadAlertTarget = {
  id: Principal;
  jobsCompleted: bigint;
  alertZips: string[];
  serviceZips: string[];
  trustScore: bigint;
  isVerified: boolean;
  specialties: ServiceType[];
  notifyPush: [] | [boolean];
};

export type LicenseCheck = {
  found: boolean;
  status: string;
  active: boolean;
  expiresOn: string;
  licenseeName: string;
  sourceDate: string;
  dbaName: string;
  licenseType: string;
  licenseNumber: string;
  checkedAt: bigint;
  nameMatches: boolean;
};

export type ProfilePrivacy = {
  showJobsCompleted: boolean;
  showTrustScore: boolean;
  listed: boolean;
};

export type PortfolioItem = {
  featuredAt: bigint;
  title: string;
  serviceType: string;
  description: string;
  credentialId: bigint;
  verifiedAt: bigint;
};

export type Review = {
  id: string;
  createdAt: bigint;
  jobId: string;
  comment: string;
  rating: bigint;
  reviewer: Principal;
  contractor: Principal;
};

export type RegisterArgs = {
  name: string;
  email: string;
  specialties: ServiceType[];
  phone: string;
};

export type LicenseCheckInput = {
  found: boolean;
  status: string;
  active: boolean;
  expiresOn: string;
  licenseeName: string;
  sourceDate: string;
  dbaName: string;
  licenseType: string;
  licenseNumber: string;
  nameMatches: boolean;
};

export type PortfolioInput = {
  title: string;
  description: string;
  credentialId: bigint;
};

export type NotificationPrefsArgs = {
  alertZips: string[];
  notifyPush: [] | [boolean];
  notifyEmail: [] | [string];
};

export type UpdateArgs = {
  bio: [] | [string];
  serviceArea: [] | [string];
  serviceZips: string[];
  name: string;
  email: string;
  licenseNumber: [] | [string];
  specialties: ServiceType[];
  phone: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addLicenseRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  addNotifier: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  createOrLinkGuestProfile: ActorMethod<
    [Principal, string, string, string, [] | [string], string, string],
    { ok: null } | { err: Error }
  >;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  getAll: ActorMethod<[], ContractorProfile[]>;
  getBySpecialty: ActorMethod<[ServiceType], ContractorProfile[]>;
  getContractor: ActorMethod<[Principal], { ok: ContractorProfile } | { err: Error }>;
  getContractorEmail: ActorMethod<[Principal], { ok: string } | { err: Error }>;
  getCredentials: ActorMethod<
    [Principal],
    Array<{
      id: bigint;
      serviceType: string;
      homeownerPrincipal: Principal;
      jobId: string;
      contractorId: Principal;
      verifiedAt: bigint;
    }>
  >;
  getLeadAlertTargets: ActorMethod<[], LeadAlertTarget[]>;
  getLicenseCheck: ActorMethod<[Principal], [] | [LicenseCheck]>;
  getMyProfile: ActorMethod<[], { ok: ContractorProfile } | { err: Error }>;
  getMyProfilePrivacy: ActorMethod<[], ProfilePrivacy>;
  getPage: ActorMethod<[bigint, bigint], ContractorProfile[]>;
  getPortfolio: ActorMethod<[Principal], PortfolioItem[]>;
  getProfilePrivacies: ActorMethod<[Principal[]], ProfilePrivacy[]>;
  getReviewsForContractor: ActorMethod<[Principal], Review[]>;
  recordJobVerified: ActorMethod<[Principal, string, string, Principal], { ok: null } | { err: Error }>;
  register: ActorMethod<[RegisterArgs], { ok: ContractorProfile } | { err: Error }>;
  relayRecordLicenseCheck: ActorMethod<[Principal, LicenseCheckInput], { ok: LicenseCheck } | { err: Error }>;
  removeLicenseRelay: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  removeNotifier: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setJobCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  setPaymentCanisterId: ActorMethod<[Principal], { ok: null } | { err: Error }>;
  setPortfolio: ActorMethod<[PortfolioInput[]], { ok: PortfolioItem[] } | { err: Error }>;
  setProfilePrivacy: ActorMethod<[ProfilePrivacy], { ok: ProfilePrivacy } | { err: Error }>;
  setQuoteCanisterId: ActorMethod<[string], { ok: null } | { err: Error }>;
  submitReview: ActorMethod<[Principal, bigint, string, string], { ok: Review } | { err: Error }>;
  updateNotificationPrefs: ActorMethod<[NotificationPrefsArgs], { ok: ContractorProfile } | { err: Error }>;
  updateProfile: ActorMethod<[UpdateArgs], { ok: ContractorProfile } | { err: Error }>;
  verifyContractor: ActorMethod<[Principal], { ok: ContractorProfile } | { err: Error }>;
}
