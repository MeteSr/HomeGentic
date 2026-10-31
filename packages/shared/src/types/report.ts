// Generated from ../declarations/report.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  | { UnverifiedProperty: null }
  | { InvalidInput: string }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { Revoked: null }
  | { Expired: null };

export type PropertyInput = {
  propertyType: string;
  city: string;
  squareFeet: bigint;
  zipCode: string;
  state: string;
  address: string;
  verificationLevel: string;
  yearBuilt: bigint;
};

export type JobInput = {
  status: string;
  serviceType: string;
  permitNumber: [] | [string];
  date: string;
  description: string;
  amountCents: bigint;
  isVerified: boolean;
  warrantyMonths: [] | [bigint];
  isDiy: boolean;
  contractorName: [] | [string];
};

export type RecurringServiceInput = {
  status: string;
  serviceType: string;
  lastVisitDate: [] | [string];
  providerName: string;
  totalVisits: bigint;
  frequency: string;
  startDate: string;
};

export type VisibilityLevel = { BuyerOnly: null } | { Public: null };

export type RoomInput = {
  paintBrand: string;
  name: string;
  floorType: string;
  paintColor: string;
  fixtureCount: bigint;
  paintCode: string;
};

export type BillsSummary = {
  asOf: string;
  lines: BillsSummaryLine[];
};

export type BillsSummaryLine = {
  avgMonthlyCents: bigint;
  category: BillsCategory;
  basis: BillsBasis;
};

export type BillsCategory =
  | { Gas: null }
  | { HOA: null }
  | { Internet: null }
  | { Water: null }
  | { OtherUtility: null }
  | { Telecom: null }
  | { PropertyTax: null }
  | { Electric: null }
  | { HomeInsurance: null };

export type BillsBasis = { Scheduled: null } | { Statements: bigint };

export type ShareLink = {
  snapshotId: string;
  token: string;
  expiresAt: [] | [bigint];
  createdAt: bigint;
  createdBy: Principal;
  propertyId: string;
  isActive: boolean;
  viewCount: bigint;
  visibility: VisibilityLevel;
};

export type RiskProfile = {
  sensorCoverage: SensorSummary[];
  token: string;
  expiresAt: [] | [bigint];
  generatedAt: bigint;
  maintenanceScore: bigint;
  propertyId: string;
  recentAlerts: AlertSummary[];
  verificationLevel: string;
  schemaVersion: string;
  verifiedJobCount: bigint;
  permitCount: bigint;
  openJobs: bigint;
};

export type SensorSummary = {
  source: string;
  name: string;
  isActive: boolean;
  deviceId: string;
  lastEventAt: [] | [bigint];
  eventCount: bigint;
};

export type AlertSummary = {
  alertId: string;
  resolvedByJobId: [] | [string];
  timestamp: bigint;
  severity: string;
  eventType: string;
};

export type RiskProfileError =
  { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null } | { Expired: null };

export type Attestation = {
  signature: Uint8Array | number[];
  publicKey: Uint8Array | number[];
  signedAt: bigint;
  message: string;
  keyName: string;
};

export type ReportSnapshot = {
  snapshotId: string;
  propertyType: string;
  city: string;
  generatedAt: bigint;
  generatedBy: Principal;
  jobs: JobInput[];
  squareFeet: bigint;
  propertyId: string;
  zipCode: string;
  state: string;
  totalAmountCents: bigint;
  diyJobCount: bigint;
  address: string;
  verificationLevel: string;
  verifiedJobCount: bigint;
  permitCount: bigint;
  yearBuilt: bigint;
  rooms: [] | [RoomInput[]];
  recurringServices: RecurringServiceInput[];
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  findPublicReport: ActorMethod<
    [string],
    | []
    | [
        {
          token: string;
          propertyType: string;
          city: string;
          zipCode: string;
          state: string;
          address: string;
          verificationLevel: string;
          yearBuilt: bigint;
        },
      ]
  >;
  generateReport: ActorMethod<
    [
      string,
      PropertyInput,
      JobInput[],
      RecurringServiceInput[],
      [] | [bigint],
      VisibilityLevel,
      [] | [RoomInput[]],
      [] | [boolean],
      [] | [boolean],
      [] | [boolean],
      [] | [boolean],
      [] | [BillsSummary],
    ],
    { ok: ShareLink } | { err: Error }
  >;
  generateRiskProfile: ActorMethod<[string, [] | [bigint], string], { ok: RiskProfile } | { err: RiskProfileError }>;
  getAllowPublicReports: ActorMethod<[], boolean>;
  getAttestationKey: ActorMethod<
    [],
    | []
    | [
        {
          publicKey: Uint8Array | number[];
          keyName: string;
        },
      ]
  >;
  getBillsSummary: ActorMethod<[string], [] | [BillsSummary]>;
  getCertAttestation: ActorMethod<[string], [] | [Attestation]>;
  getReport: ActorMethod<[string], { ok: [ShareLink, ReportSnapshot] } | { err: Error }>;
  getReportAttestation: ActorMethod<[string], [] | [Attestation]>;
  getReportScore: ActorMethod<[string], [] | [bigint]>;
  getRiskProfile: ActorMethod<[string], { ok: RiskProfile } | { err: RiskProfileError }>;
  hasActivePublicShareLink: ActorMethod<[string], boolean>;
  listShareLinks: ActorMethod<[string], ShareLink[]>;
  refreshAttestationKey: ActorMethod<[], { ok: Uint8Array | number[] } | { err: Error }>;
  revokeShareLink: ActorMethod<[string], { ok: null } | { err: Error }>;
  setAllowPublicReports: ActorMethod<[boolean], { ok: null } | { err: Error }>;
  setAttestationKeyName: ActorMethod<[string], { ok: null } | { err: Error }>;
}
