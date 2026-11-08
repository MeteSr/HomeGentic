// Generated from ../declarations/property.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type ReviewInput = {
  submittedDate: string;
  status: ReviewStatus;
  decisionDate: string;
  jobId: [] | [string];
  approvalDocId: [] | [string];
  details: string;
  conditions: string;
  project: string;
};

export type ReviewStatus =
  | { Planned: null }
  | { Approved: null }
  | { Withdrawn: null }
  | { Denied: null }
  | { Submitted: null }
  | { ApprovedWithConditions: null };

export type ArchitecturalReview = {
  id: string;
  submittedDate: string;
  status: ReviewStatus;
  decisionDate: string;
  createdAt: bigint;
  jobId: [] | [string];
  propertyId: string;
  approvalDocId: [] | [string];
  updatedAt: bigint;
  details: string;
  conditions: string;
  project: string;
};

export type Error =
  | { Paused: null }
  | { InvalidInput: string }
  | { AddressConflict: bigint }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { LimitReached: null }
  | { RateLimited: null }
  | { DuplicateAddress: null }
  | { Unavailable: string };

export type HomeWarrantyClaimInput = {
  outcomeNotes: string;
  jobId: [] | [string];
  serviceFeePaidCents: [] | [bigint];
  issue: string;
  outcome: WarrantyClaimOutcome;
  dateFiled: string;
  claimNumber: string;
};

export type WarrantyClaimOutcome =
  { PartlyApproved: null } | { Open: null } | { Approved: null } | { Withdrawn: null } | { Denied: null };

export type HomeWarrantyClaim = {
  id: string;
  outcomeNotes: string;
  createdAt: bigint;
  jobId: [] | [string];
  propertyId: string;
  updatedAt: bigint;
  serviceFeePaidCents: [] | [bigint];
  issue: string;
  outcome: WarrantyClaimOutcome;
  dateFiled: string;
  claimNumber: string;
};

export type InsuranceClaim = {
  id: string;
  log: ClaimLogEntry[];
  status: ClaimStatus;
  adjusterName: string;
  adjusterContact: string;
  title: string;
  cause: string;
  createdAt: bigint;
  description: string;
  propertyId: string;
  updatedAt: bigint;
  dateOfLoss: string;
  claimNumber: string;
};

export type ClaimLogEntry = {
  date: string;
  note: string;
  addedAt: bigint;
};

export type ClaimStatus = { Open: null } | { Closed: null };

export type InventoryItemInput = {
  purchaseDate: string;
  name: string;
  serialNumber: string;
  notes: string;
  quantity: bigint;
  category: string;
  roomId: [] | [string];
  valueCents: [] | [bigint];
};

export type InventoryItem = {
  id: string;
  purchaseDate: string;
  name: string;
  createdAt: bigint;
  propertyId: string;
  updatedAt: bigint;
  serialNumber: string;
  notes: string;
  quantity: bigint;
  category: string;
  roomId: [] | [string];
  valueCents: [] | [bigint];
};

export type MoveInTaskInput = {
  title: string;
  urgency: MoveInTaskUrgency;
  area: string;
  detail: string;
};

export type MoveInTaskUrgency = { Repair: null } | { Safety: null } | { Monitor: null };

export type MoveInPlan = {
  tasks: MoveInTask[];
  startedAt: bigint;
  updatedAt: bigint;
  doneSteps: string[];
};

export type MoveInTask = {
  id: string;
  title: string;
  urgency: MoveInTaskUrgency;
  area: string;
  createdAt: bigint;
  detail: string;
};

export type AssessmentInput = {
  title: string;
  dueDate: string;
  amountCents: bigint;
  paidDate: string;
  notes: string;
  documentId: [] | [string];
};

export type SpecialAssessment = {
  id: string;
  title: string;
  createdAt: bigint;
  dueDate: string;
  propertyId: string;
  amountCents: bigint;
  updatedAt: bigint;
  paidDate: string;
  notes: string;
  documentId: [] | [string];
};

export type SuccessionClaim = {
  id: string;
  status: SuccessionClaimStatus;
  proofKind: SuccessionProofKind;
  proofSize: bigint;
  claimant: Principal;
  claimantName: string;
  note: string;
  mimeType: string;
  propertyId: string;
  fileName: string;
  waitEndsAt: bigint;
  openedAt: bigint;
};

export type SuccessionClaimStatus =
  | {
      Approved: {
        at: bigint;
      };
    }
  | {
      Rejected: {
        at: bigint;
        reason: string;
      };
    }
  | {
      Cancelled: {
        at: bigint;
        by: Principal;
      };
    }
  | { AwaitingReview: null }
  | {
      Completed: {
        at: bigint;
      };
    };

export type SuccessionProofKind =
  | { TrustDocument: null }
  | { LettersOfAdministration: null }
  | { DeathCertificate: null }
  | { LettersTestamentary: null };

export type ManagerRole = { CoOwner: null } | { Viewer: null } | { Manager: null };

export type Property = {
  id: string;
  identityVerified: [] | [boolean];
  identitySessionId: [] | [string];
  propertyType: PropertyType;
  owner: Principal;
  city: string;
  nameOnId: [] | [string];
  createdAt: bigint;
  tier: SubscriptionTier;
  squareFeet: bigint;
  nameOnDocument: [] | [string];
  isActive: boolean;
  conflictWindowEndsAt: [] | [bigint];
  zipCode: string;
  updatedAt: bigint;
  state: string;
  address: string;
  verificationLevel: VerificationLevel;
  identityVerifiedAt: [] | [bigint];
  yearBuilt: bigint;
  verificationMethod: [] | [string];
  contestedWithId: [] | [string];
};

export type PropertyType = { SingleFamily: null } | { Townhouse: null } | { MultiFamily: null } | { Condo: null };

export type SubscriptionTier = { Pro: null } | { Free: null } | { ContractorPro: null } | { ContractorFree: null };

export type VerificationLevel = { Premium: null } | { Basic: null } | { PendingReview: null } | { Unverified: null };

export type HouseGuideLink = {
  token: string;
  expiresAt: bigint;
  revoked: boolean;
  name: string;
  createdAt: bigint;
  createdBy: Principal;
  propertyId: string;
};

export type ClaimInput = {
  status: ClaimStatus;
  adjusterName: string;
  adjusterContact: string;
  title: string;
  cause: string;
  description: string;
  dateOfLoss: string;
  claimNumber: string;
};

export type AddressMatch = {
  id: string;
  owner: Principal;
  address: string;
};

export type PendingApprovalRequest = {
  id: bigint;
  status: ApprovalStatus;
  createdAt: bigint;
  description: string;
  propertyId: string;
  amountCents: bigint;
  requesterName: string;
  requestedBy: Principal;
};

export type ApprovalStatus = { Approved: null } | { Declined: null } | { Pending: null };

export type CondoRecord = {
  associationName: string;
  reserveStudyLastDate: string;
  updatedAt: bigint;
  milestoneNextDue: string;
  milestoneDocId: [] | [string];
  notes: string;
  milestoneLastDate: string;
  reserveStudyDocId: [] | [string];
  reserveStudyNextDue: string;
};

export type FloodZoneRecord = {
  status: FloodZoneStatus;
  latitude: string;
  matchedAddress: string;
  specialFloodHazardArea: boolean;
  zone: string;
  firmEffectiveDate: string;
  longitude: string;
  checkedAt: bigint;
  baseFloodElevation: string;
  firmPanel: string;
  zoneSubtype: string;
};

export type FloodZoneStatus = { NotMapped: null } | { Mapped: null };

export type HomeWarrantyPlan = {
  provider: string;
  claimContact: string;
  contractDocId: [] | [string];
  updatedAt: bigint;
  contractNumber: string;
  exclusionNotes: string;
  coverageNotes: string;
  serviceFeeCents: [] | [bigint];
  planName: string;
  renewalDate: string;
  startDate: string;
};

export type HouseGuideRecord = {
  wifiName: string;
  alarm: string;
  contacts: GuideContact[];
  photoIds: string[];
  recyclingDay: string;
  electricPanel: string;
  updatedAt: bigint;
  notes: string;
  wifiPassword: string;
  trashDay: string;
  gasShutoff: string;
  waterShutoff: string;
};

export type GuideContact = {
  name: string;
  role: string;
  phone: string;
};

export type InsurancePolicy = {
  coverageACents: [] | [bigint];
  updatedAt: bigint;
  hurricaneDeductible: [] | [HurricaneDeductible];
  carrier: string;
  policyNumber: string;
  renewalDate: string;
};

export type HurricaneDeductible = { Amount: bigint } | { PercentOfCoverageA: bigint };

export type ManagerInvite = {
  token: string;
  expiresAt: bigint;
  displayName: string;
  createdAt: bigint;
  role: ManagerRole;
  invitedBy: Principal;
  propertyId: string;
  spendLimitCents: [] | [bigint];
};

export type MortgageLoan = {
  statementDate: string;
  rateThousandthsPct: bigint;
  statementBalanceCents: [] | [bigint];
  monthlyPmiCents: [] | [bigint];
  originalAmountCents: bigint;
  updatedAt: bigint;
  termMonths: bigint;
  lender: string;
  currentValueCents: [] | [bigint];
  firstPaymentDate: string;
  monthlyEscrowCents: [] | [bigint];
  originalValueCents: [] | [bigint];
};

export type ManagedProperty = {
  role: ManagerRole;
  property: Property;
};

export type NotifyEvent = {
  seq: bigint;
  kind: string;
  createdAt: bigint;
  recipient: [] | [Principal];
  summary: string;
  refId: string;
};

export type OwnerNotification = {
  id: bigint;
  seen: boolean;
  description: string;
  timestamp: bigint;
  managerPrincipal: Principal;
  managerName: string;
};

export type TransferRecord = {
  to: Principal;
  from: Principal;
  propertyId: string;
  timestamp: bigint;
  txHash: string;
};

export type PendingTransfer = {
  token: string;
  expiresAt: bigint;
  from: Principal;
  propertyId: string;
  initiatedAt: bigint;
};

export type PropertyManager = {
  principal: Principal;
  displayName: string;
  role: ManagerRole;
  spendLimitCents: [] | [bigint];
  addedAt: bigint;
};

export type PropertyTaxYear = {
  assessedValueCents: [] | [bigint];
  year: bigint;
  marketValueCents: [] | [bigint];
  updatedAt: bigint;
  taxableValueCents: [] | [bigint];
  notes: string;
  petitionDeadline: string;
  exemption: TaxExemption;
};

export type TaxExemption =
  { Applied: null } | { NotApplying: null } | { Granted: null } | { Denied: null } | { Unknown: null };

export type PulseHomeFinance = {
  loan:
    | []
    | [
        {
          rateThousandthsPct: bigint;
          monthlyPmiCents: [] | [bigint];
          originalAmountCents: bigint;
          termMonths: bigint;
          firstPaymentDate: string;
          originalValueCents: [] | [bigint];
        },
      ];
  propertyId: string;
  warranty:
    | []
    | [
        {
          provider: string;
          renewalDate: string;
        },
      ];
};

export type PulsePropertyTax = {
  propertyId: string;
  years: Array<{
    year: bigint;
    petitionDeadline: string;
    exemption: TaxExemption;
  }>;
};

export type RoomRecord = {
  id: string;
  paintBrand: string;
  owner: Principal;
  name: string;
  createdAt: bigint;
  propertyId: string;
  floorName: string;
  floorType: string;
  updatedAt: bigint;
  notes: string;
  paintColor: string;
  fixtures: Fixture[];
  paintCode: string;
};

export type Fixture = {
  id: string;
  model: string;
  serialNumber: string;
  installedDate: string;
  notes: string;
  warrantyExpiry: string;
  brand: string;
};

export type SharedHouseGuide = {
  expiresAt: bigint;
  city: string;
  zipCode: string;
  state: string;
  guide: HouseGuideRecord;
  address: string;
};

export type SuccessionInvite = {
  waitDays: bigint;
  successorName: string;
  property: Property;
};

export type SuccessionNotice = {
  claim: SuccessionClaim;
  address: string;
  household: Principal[];
};

export type SuccessionProof = {
  data: Uint8Array | number[];
  mimeType: string;
  fileName: string;
};

export type Successor = {
  token: string;
  relationship: string;
  name: string;
  email: string;
  namedAt: bigint;
};

export type VerifyStatus = {
  claimStartedAt: bigint;
  identityVerified: boolean;
  identitySessionId: [] | [string];
  claimWindowEndsAt: bigint;
  city: string;
  nameOnId: [] | [string];
  nameOnDocument: [] | [string];
  propertyId: string;
  conflictWindowEndsAt: [] | [bigint];
  state: string;
  verificationDocHash: [] | [string];
  address: string;
  verificationLevel: VerificationLevel;
  identityVerifiedAt: [] | [bigint];
  verificationMethod: [] | [string];
  contestedWithId: [] | [string];
};

export type SuccessionReview = {
  successor: [] | [Successor];
  claim: SuccessionClaim;
  property: Property;
};

export type SuccessionClaimInput = {
  proofKind: SuccessionProofKind;
  claimantName: string;
  note: string;
  mimeType: string;
  fileName: string;
};

export type RegisterArgs = {
  propertyType: PropertyType;
  city: string;
  tier: SubscriptionTier;
  squareFeet: bigint;
  zipCode: string;
  state: string;
  address: string;
  yearBuilt: bigint;
};

export type FloodTarget = {
  city: string;
  floodZone: [] | [FloodZoneRecord];
  zipCode: string;
  state: string;
  address: string;
};

export type FloodZoneInput = {
  status: FloodZoneStatus;
  latitude: string;
  matchedAddress: string;
  specialFloodHazardArea: boolean;
  zone: string;
  firmEffectiveDate: string;
  longitude: string;
  baseFloodElevation: string;
  firmPanel: string;
  zoneSubtype: string;
};

export type CondoRecordInput = {
  associationName: string;
  reserveStudyLastDate: string;
  milestoneNextDue: string;
  milestoneDocId: [] | [string];
  notes: string;
  milestoneLastDate: string;
  reserveStudyDocId: [] | [string];
  reserveStudyNextDue: string;
};

export type HomeWarrantyPlanInput = {
  provider: string;
  claimContact: string;
  contractDocId: [] | [string];
  contractNumber: string;
  exclusionNotes: string;
  coverageNotes: string;
  serviceFeeCents: [] | [bigint];
  planName: string;
  renewalDate: string;
  startDate: string;
};

export type HouseGuideInput = {
  wifiName: string;
  alarm: string;
  contacts: GuideContact[];
  photoIds: string[];
  recyclingDay: string;
  electricPanel: string;
  notes: string;
  wifiPassword: string;
  trashDay: string;
  gasShutoff: string;
  waterShutoff: string;
};

export type InsurancePolicyInput = {
  coverageACents: [] | [bigint];
  hurricaneDeductible: [] | [HurricaneDeductible];
  carrier: string;
  policyNumber: string;
  renewalDate: string;
};

export type MortgageLoanInput = {
  statementDate: string;
  rateThousandthsPct: bigint;
  statementBalanceCents: [] | [bigint];
  monthlyPmiCents: [] | [bigint];
  originalAmountCents: bigint;
  termMonths: bigint;
  lender: string;
  currentValueCents: [] | [bigint];
  firstPaymentDate: string;
  monthlyEscrowCents: [] | [bigint];
  originalValueCents: [] | [bigint];
};

export type PropertyTaxYearInput = {
  assessedValueCents: [] | [bigint];
  year: bigint;
  marketValueCents: [] | [bigint];
  taxableValueCents: [] | [bigint];
  notes: string;
  petitionDeadline: string;
  exemption: TaxExemption;
};

export type SuccessorInput = {
  relationship: string;
  name: string;
  email: string;
};

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  addArchitecturalReview: ActorMethod<[string, ReviewInput], { ok: ArchitecturalReview } | { err: Error }>;
  addHomeWarrantyClaim: ActorMethod<[string, HomeWarrantyClaimInput], { ok: HomeWarrantyClaim } | { err: Error }>;
  addInsuranceClaimLog: ActorMethod<[string, string, string], { ok: InsuranceClaim } | { err: Error }>;
  addInventoryItem: ActorMethod<[string, InventoryItemInput], { ok: InventoryItem } | { err: Error }>;
  addMoveInTasks: ActorMethod<[string, MoveInTaskInput[]], { ok: MoveInPlan } | { err: Error }>;
  addSpecialAssessment: ActorMethod<[string, AssessmentInput], { ok: SpecialAssessment } | { err: Error }>;
  cancelManagerInvite: ActorMethod<[string, string], { ok: null } | { err: Error }>;
  cancelSuccessionClaim: ActorMethod<[string], { ok: SuccessionClaim } | { err: Error }>;
  cancelTransfer: ActorMethod<[string], { ok: null } | { err: Error }>;
  claimManagerRole: ActorMethod<
    [string],
    | {
        ok: {
          role: ManagerRole;
          propertyId: string;
        };
      }
    | { err: Error }
  >;
  claimTransfer: ActorMethod<[string], { ok: Property } | { err: Error }>;
  completeSuccessionClaim: ActorMethod<[string], { ok: Property } | { err: Error }>;
  createHouseGuideLink: ActorMethod<[string, string, bigint], { ok: HouseGuideLink } | { err: Error }>;
  createInsuranceClaim: ActorMethod<[string, ClaimInput], { ok: InsuranceClaim } | { err: Error }>;
  deleteArchitecturalReview: ActorMethod<[string], { ok: null } | { err: Error }>;
  deleteHomeWarrantyClaim: ActorMethod<[string], { ok: null } | { err: Error }>;
  deleteInsuranceClaim: ActorMethod<[string], { ok: null } | { err: Error }>;
  deleteInventoryItem: ActorMethod<[string], { ok: null } | { err: Error }>;
  deleteMoveInTask: ActorMethod<[string, string], { ok: MoveInPlan } | { err: Error }>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  deletePropertyTaxYear: ActorMethod<[string, bigint], { ok: null } | { err: Error }>;
  deleteSpecialAssessment: ActorMethod<[string], { ok: null } | { err: Error }>;
  dismissNotifications: ActorMethod<[string], { ok: null } | { err: Error }>;
  endMoveInPlan: ActorMethod<[string], { ok: null } | { err: Error }>;
  findPropertiesByAddress: ActorMethod<[string], AddressMatch[]>;
  getAccessRole: ActorMethod<
    [string, Principal],
    [] | [{ CoOwner: null } | { Viewer: null } | { NoAccess: null } | { Owner: null } | { Manager: null }]
  >;
  getAccessRoles: ActorMethod<
    [string[], Principal],
    Array<[] | [{ CoOwner: null } | { Viewer: null } | { NoAccess: null } | { Owner: null } | { Manager: null }]>
  >;
  getApiDoc: ActorMethod<[], string>;
  getApprovals: ActorMethod<[string], { ok: PendingApprovalRequest[] } | { err: Error }>;
  getArchitecturalReviews: ActorMethod<[string], { ok: ArchitecturalReview[] } | { err: Error }>;
  getCondoAssociationRecord: ActorMethod<[string], { ok: [] | [CondoRecord] } | { err: Error }>;
  getFloodZone: ActorMethod<[string], { ok: [] | [FloodZoneRecord] } | { err: Error }>;
  getHomeWarrantyClaims: ActorMethod<[string], { ok: HomeWarrantyClaim[] } | { err: Error }>;
  getHomeWarrantyPlan: ActorMethod<[string], { ok: [] | [HomeWarrantyPlan] } | { err: Error }>;
  getHouseGuide: ActorMethod<[string], { ok: [] | [HouseGuideRecord] } | { err: Error }>;
  getInsuranceClaims: ActorMethod<[string], { ok: InsuranceClaim[] } | { err: Error }>;
  getInsurancePolicy: ActorMethod<[string], { ok: [] | [InsurancePolicy] } | { err: Error }>;
  getInventory: ActorMethod<[string], { ok: InventoryItem[] } | { err: Error }>;
  getJobPropertyAddresses: ActorMethod<
    [string[]],
    Array<{
      jobId: string;
      propertyId: string;
      address: string;
    }>
  >;
  getManagerInviteByToken: ActorMethod<[string], [] | [ManagerInvite]>;
  getMortgageLoan: ActorMethod<[string], { ok: [] | [MortgageLoan] } | { err: Error }>;
  getMoveInPlan: ActorMethod<[string], { ok: [] | [MoveInPlan] } | { err: Error }>;
  getMyManagedProperties: ActorMethod<[], ManagedProperty[]>;
  getMyProperties: ActorMethod<[], Property[]>;
  getMySuccessionClaims: ActorMethod<[], SuccessionClaim[]>;
  getNotificationEvents: ActorMethod<
    [bigint, bigint],
    | {
        ok: {
          latestSeq: bigint;
          events: NotifyEvent[];
        };
      }
    | { err: Error }
  >;
  getOpenSuccessionClaim: ActorMethod<[string], { ok: [] | [SuccessionClaim] } | { err: Error }>;
  getOwnerNotifications: ActorMethod<[string], { ok: OwnerNotification[] } | { err: Error }>;
  getOwnershipHistory: ActorMethod<[string], TransferRecord[]>;
  getPendingInvitesForProperty: ActorMethod<[string], { ok: ManagerInvite[] } | { err: Error }>;
  getPendingTransfer: ActorMethod<[string], [] | [PendingTransfer]>;
  getPendingTransferByToken: ActorMethod<[string], [] | [PendingTransfer]>;
  getPendingVerifications: ActorMethod<[], { ok: Property[] } | { err: Error }>;
  getProperty: ActorMethod<[string], { ok: Property } | { err: Error }>;
  getPropertyAddress: ActorMethod<[string], [] | [string]>;
  getPropertyByManagerInviteToken: ActorMethod<[string], [] | [Property]>;
  getPropertyByTransferToken: ActorMethod<[string], [] | [Property]>;
  getPropertyLimitForTier: ActorMethod<[SubscriptionTier], bigint>;
  getPropertyManagers: ActorMethod<[string], { ok: PropertyManager[] } | { err: Error }>;
  getPropertyOwner: ActorMethod<[string], [] | [Principal]>;
  getPropertyTaxYears: ActorMethod<[string], { ok: PropertyTaxYear[] } | { err: Error }>;
  getPropertyYearBuilt: ActorMethod<[string], [] | [bigint]>;
  getPulseHomeFinance: ActorMethod<[Principal], { ok: PulseHomeFinance[] } | { err: Error }>;
  getPulseInsurance: ActorMethod<
    [Principal],
    | {
        ok: Array<{
          propertyId: string;
          carrier: string;
          renewalDate: string;
        }>;
      }
    | { err: Error }
  >;
  getPulseProperties: ActorMethod<
    [Principal],
    | {
        ok: Array<{
          id: string;
          city: string;
          zipCode: string;
          state: string;
          address: string;
          yearBuilt: bigint;
        }>;
      }
    | { err: Error }
  >;
  getPulsePropertyTax: ActorMethod<[Principal], { ok: PulsePropertyTax[] } | { err: Error }>;
  getRoomsByProperty: ActorMethod<[string], RoomRecord[]>;
  getSharedHouseGuide: ActorMethod<[string], { ok: SharedHouseGuide } | { err: Error }>;
  getSpecialAssessments: ActorMethod<[string], { ok: SpecialAssessment[] } | { err: Error }>;
  getSuccessionInvite: ActorMethod<[string], [] | [SuccessionInvite]>;
  getSuccessionNotice: ActorMethod<[string], { ok: [] | [SuccessionNotice] } | { err: Error }>;
  getSuccessionProof: ActorMethod<[string], { ok: SuccessionProof } | { err: Error }>;
  getSuccessor: ActorMethod<[string], { ok: [] | [Successor] } | { err: Error }>;
  getVerificationLevel: ActorMethod<[string], [] | [string]>;
  getVerifyStatus: ActorMethod<[string], { ok: VerifyStatus } | { err: Error }>;
  initiateTransfer: ActorMethod<[string], { ok: PendingTransfer } | { err: Error }>;
  inviteManager: ActorMethod<[string, ManagerRole, string, [] | [bigint]], { ok: ManagerInvite } | { err: Error }>;
  isAdminPrincipal: ActorMethod<[Principal], boolean>;
  isAuthorized: ActorMethod<[string, Principal, boolean], boolean>;
  listHouseGuideLinks: ActorMethod<[string], { ok: HouseGuideLink[] } | { err: Error }>;
  listSuccessionClaimsForReview: ActorMethod<[], { ok: SuccessionReview[] } | { err: Error }>;
  markIdentityCleared: ActorMethod<[string, string, string], { ok: Property } | { err: Error }>;
  openSuccessionClaim: ActorMethod<
    [string, SuccessionClaimInput, Uint8Array | number[]],
    { ok: SuccessionClaim } | { err: Error }
  >;
  recordManagerActivity: ActorMethod<[string, string], { ok: null } | { err: Error }>;
  registerProperty: ActorMethod<[RegisterArgs], { ok: Property } | { err: Error }>;
  relayFloodTarget: ActorMethod<[string, Principal], { ok: FloodTarget } | { err: Error }>;
  relayMarkIdentityCleared: ActorMethod<[string, Principal, string, string], { ok: null } | { err: Error }>;
  relaySetFloodZone: ActorMethod<[string, Principal, FloodZoneInput], { ok: FloodZoneRecord } | { err: Error }>;
  removeManager: ActorMethod<[string, Principal], { ok: null } | { err: Error }>;
  removeSuccessor: ActorMethod<[string], { ok: null } | { err: Error }>;
  requestApproval: ActorMethod<[string, string, bigint], { ok: bigint } | { err: Error }>;
  resignAsManager: ActorMethod<[string], { ok: null } | { err: Error }>;
  respondToApproval: ActorMethod<[string, bigint, boolean], { ok: null } | { err: Error }>;
  reviewSuccessionClaim: ActorMethod<[string, boolean, string], { ok: SuccessionClaim } | { err: Error }>;
  revokeHouseGuideLink: ActorMethod<[string], { ok: null } | { err: Error }>;
  setCondoAssociationRecord: ActorMethod<[string, [] | [CondoRecordInput]], { ok: null } | { err: Error }>;
  setHomeWarrantyPlan: ActorMethod<[string, [] | [HomeWarrantyPlanInput]], { ok: null } | { err: Error }>;
  setHouseGuide: ActorMethod<[string, [] | [HouseGuideInput]], { ok: null } | { err: Error }>;
  setInsurancePolicy: ActorMethod<[string, [] | [InsurancePolicyInput]], { ok: null } | { err: Error }>;
  setMortgageLoan: ActorMethod<[string, [] | [MortgageLoanInput]], { ok: null } | { err: Error }>;
  setMoveInStep: ActorMethod<[string, string, boolean], { ok: MoveInPlan } | { err: Error }>;
  setPropertyTaxYear: ActorMethod<[string, PropertyTaxYearInput], { ok: PropertyTaxYear } | { err: Error }>;
  setSuccessor: ActorMethod<[string, SuccessorInput], { ok: Successor } | { err: Error }>;
  startMoveInPlan: ActorMethod<[string], { ok: MoveInPlan } | { err: Error }>;
  submitVerification: ActorMethod<[string, string, string, [] | [string]], { ok: Property } | { err: Error }>;
  updateArchitecturalReview: ActorMethod<[string, ReviewInput], { ok: ArchitecturalReview } | { err: Error }>;
  updateHomeWarrantyClaim: ActorMethod<[string, HomeWarrantyClaimInput], { ok: HomeWarrantyClaim } | { err: Error }>;
  updateInsuranceClaim: ActorMethod<[string, ClaimInput], { ok: InsuranceClaim } | { err: Error }>;
  updateInventoryItem: ActorMethod<[string, InventoryItemInput], { ok: InventoryItem } | { err: Error }>;
  updateManagerRole: ActorMethod<[string, Principal, ManagerRole, [] | [bigint]], { ok: null } | { err: Error }>;
  updateSpecialAssessment: ActorMethod<[string, AssessmentInput], { ok: SpecialAssessment } | { err: Error }>;
  verifyProperty: ActorMethod<
    [string, { Premium: null } | { Basic: null } | { PendingReview: null } | { Unverified: null }, [] | [string]],
    { ok: Property } | { err: Error }
  >;
}
