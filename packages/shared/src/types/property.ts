// Generated from ../declarations/property.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error =
  | { Paused: null }
  | { InvalidInput: string }
  | { AddressConflict: bigint }
  | { NotFound: null }
  | { NotAuthorized: null }
  | { LimitReached: null }
  | { DuplicateAddress: null };

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

export type ManagedProperty = {
  role: ManagerRole;
  property: Property;
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

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  cancelManagerInvite: ActorMethod<[string, string], { ok: null } | { err: Error }>;
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
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  dismissNotifications: ActorMethod<[string], { ok: null } | { err: Error }>;
  getAccessRole: ActorMethod<
    [string, Principal],
    [] | [{ CoOwner: null } | { Viewer: null } | { NoAccess: null } | { Owner: null } | { Manager: null }]
  >;
  getAccessRoles: ActorMethod<
    [string[], Principal],
    Array<[] | [{ CoOwner: null } | { Viewer: null } | { NoAccess: null } | { Owner: null } | { Manager: null }]>
  >;
  getApprovals: ActorMethod<[string], { ok: PendingApprovalRequest[] } | { err: Error }>;
  getJobPropertyAddresses: ActorMethod<
    [string[]],
    Array<{
      jobId: string;
      propertyId: string;
      address: string;
    }>
  >;
  getManagerInviteByToken: ActorMethod<[string], [] | [ManagerInvite]>;
  getMyManagedProperties: ActorMethod<[], ManagedProperty[]>;
  getMyProperties: ActorMethod<[], Property[]>;
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
  getPropertyYearBuilt: ActorMethod<[string], [] | [bigint]>;
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
  getRoomsByProperty: ActorMethod<[string], RoomRecord[]>;
  getVerificationLevel: ActorMethod<[string], [] | [string]>;
  getVerifyStatus: ActorMethod<[string], { ok: VerifyStatus } | { err: Error }>;
  initiateTransfer: ActorMethod<[string], { ok: PendingTransfer } | { err: Error }>;
  inviteManager: ActorMethod<[string, ManagerRole, string, [] | [bigint]], { ok: ManagerInvite } | { err: Error }>;
  isAdminPrincipal: ActorMethod<[Principal], boolean>;
  isAuthorized: ActorMethod<[string, Principal, boolean], boolean>;
  markIdentityCleared: ActorMethod<[string, string, string], { ok: Property } | { err: Error }>;
  recordManagerActivity: ActorMethod<[string, string], { ok: null } | { err: Error }>;
  registerProperty: ActorMethod<[RegisterArgs], { ok: Property } | { err: Error }>;
  relayMarkIdentityCleared: ActorMethod<[string, Principal, string, string], { ok: null } | { err: Error }>;
  removeManager: ActorMethod<[string, Principal], { ok: null } | { err: Error }>;
  requestApproval: ActorMethod<[string, string, bigint], { ok: bigint } | { err: Error }>;
  resignAsManager: ActorMethod<[string], { ok: null } | { err: Error }>;
  respondToApproval: ActorMethod<[string, bigint, boolean], { ok: null } | { err: Error }>;
  submitVerification: ActorMethod<[string, string, string, [] | [string]], { ok: Property } | { err: Error }>;
  updateManagerRole: ActorMethod<[string, Principal, ManagerRole, [] | [bigint]], { ok: null } | { err: Error }>;
  verifyProperty: ActorMethod<
    [string, { Premium: null } | { Basic: null } | { PendingReview: null } | { Unverified: null }, [] | [string]],
    { ok: Property } | { err: Error }
  >;
}
