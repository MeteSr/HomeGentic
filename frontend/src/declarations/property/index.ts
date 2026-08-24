// Candid interface for the property canister — keep in sync with backend/property/main.mo
export const idlFactory = ({ IDL }: any) => {
  const PropertyType = IDL.Variant({
    SingleFamily: IDL.Null,
    Condo: IDL.Null,
    Townhouse: IDL.Null,
    MultiFamily: IDL.Null,
  });
  const VerificationLevel = IDL.Variant({
    Unverified: IDL.Null,
    PendingReview: IDL.Null,
    Basic: IDL.Null,
    Premium: IDL.Null,
  });
  const SubscriptionTier = IDL.Variant({
    Free: IDL.Null,
    Basic: IDL.Null,
    Pro: IDL.Null,
    Premium: IDL.Null,
    ContractorFree: IDL.Null,
    ContractorPro: IDL.Null,
  });
  const Property = IDL.Record({
    id: IDL.Text,
    owner: IDL.Principal,
    address: IDL.Text,
    city: IDL.Text,
    state: IDL.Text,
    zipCode: IDL.Text,
    propertyType: PropertyType,
    yearBuilt: IDL.Nat,
    squareFeet: IDL.Nat,
    verificationLevel: VerificationLevel,
    tier: SubscriptionTier,
    createdAt: IDL.Int,
    updatedAt: IDL.Int,
    isActive: IDL.Bool,
    identityVerified     : IDL.Opt(IDL.Bool),
    identityVerifiedAt   : IDL.Opt(IDL.Int),
    identitySessionId    : IDL.Opt(IDL.Text),
    nameOnId             : IDL.Opt(IDL.Text),
    nameOnDocument       : IDL.Opt(IDL.Text),
    contestedWithId      : IDL.Opt(IDL.Text),
    conflictWindowEndsAt : IDL.Opt(IDL.Int),
  });
  const VerifyStatus = IDL.Record({
    propertyId           : IDL.Text,
    address              : IDL.Text,
    city                 : IDL.Text,
    state                : IDL.Text,
    verificationLevel    : VerificationLevel,
    claimStartedAt       : IDL.Int,
    claimWindowEndsAt    : IDL.Int,
    identityVerified     : IDL.Bool,
    identityVerifiedAt   : IDL.Opt(IDL.Int),
    identitySessionId    : IDL.Opt(IDL.Text),
    nameOnId             : IDL.Opt(IDL.Text),
    verificationDocHash  : IDL.Opt(IDL.Text),
    verificationMethod   : IDL.Opt(IDL.Text),
    nameOnDocument       : IDL.Opt(IDL.Text),
    contestedWithId      : IDL.Opt(IDL.Text),
    conflictWindowEndsAt : IDL.Opt(IDL.Int),
  });
  const RegisterArgs = IDL.Record({
    address: IDL.Text,
    city: IDL.Text,
    state: IDL.Text,
    zipCode: IDL.Text,
    propertyType: PropertyType,
    yearBuilt: IDL.Nat,
    squareFeet: IDL.Nat,
    tier: SubscriptionTier,
  });
  const Error = IDL.Variant({
    NotFound: IDL.Null,
    NotAuthorized: IDL.Null,
    Paused: IDL.Null,
    LimitReached: IDL.Null,
    InvalidInput: IDL.Text,
    DuplicateAddress: IDL.Null,
    AddressConflict: IDL.Int,
  });
  const TransferRecord = IDL.Record({
    propertyId : IDL.Text,
    from       : IDL.Principal,
    to         : IDL.Principal,
    timestamp  : IDL.Int,
    txHash     : IDL.Text,
  });
  const PendingTransfer = IDL.Record({
    propertyId  : IDL.Text,
    from        : IDL.Principal,
    token       : IDL.Text,
    initiatedAt : IDL.Int,
    expiresAt   : IDL.Int,
  });

  // Delegated management IDL types
  const ManagerRole = IDL.Variant({ Viewer: IDL.Null, Manager: IDL.Null });
  const PropertyManager = IDL.Record({
    principal   : IDL.Principal,
    role        : ManagerRole,
    displayName : IDL.Text,
    addedAt     : IDL.Int,
  });
  const ManagerInvite = IDL.Record({
    propertyId  : IDL.Text,
    token       : IDL.Text,
    role        : ManagerRole,
    displayName : IDL.Text,
    invitedBy   : IDL.Principal,
    createdAt   : IDL.Int,
    expiresAt   : IDL.Int,
  });
  const OwnerNotification = IDL.Record({
    id               : IDL.Nat,
    managerPrincipal : IDL.Principal,
    managerName      : IDL.Text,
    description      : IDL.Text,
    timestamp        : IDL.Int,
    seen             : IDL.Bool,
  });
  const ManagedProperty = IDL.Record({ property: Property, role: ManagerRole });

  return IDL.Service({
    registerProperty: IDL.Func([RegisterArgs], [IDL.Variant({ ok: Property, err: Error })], []),
    getMyProperties: IDL.Func([], [IDL.Vec(Property)], ["query"]),
    getProperty: IDL.Func([IDL.Text], [IDL.Variant({ ok: Property, err: Error })], ["query"]),
    getPropertyLimitForTier: IDL.Func([SubscriptionTier], [IDL.Nat], ["query"]),
    submitVerification: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text, IDL.Opt(IDL.Text)],
      [IDL.Variant({ ok: Property, err: Error })],
      []
    ),
    getVerifyStatus: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: VerifyStatus, err: Error })],
      ["query"]
    ),
    markIdentityCleared: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: Property, err: Error })],
      []
    ),
    getVerificationLevel: IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    getPendingVerifications: IDL.Func([], [IDL.Vec(Property)], ["query"]),
    isAdminPrincipal: IDL.Func([IDL.Principal], [IDL.Bool], ["query"]),
    verifyProperty: IDL.Func(
      [IDL.Text, IDL.Variant({ Unverified: IDL.Null, PendingReview: IDL.Null, Basic: IDL.Null, Premium: IDL.Null }), IDL.Opt(IDL.Text)],
      [IDL.Variant({ ok: Property, err: Error })],
      []
    ),
    setTier: IDL.Func(
      [IDL.Principal, IDL.Variant({ Free: IDL.Null, Pro: IDL.Null, Premium: IDL.Null, ContractorPro: IDL.Null })],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // Token-based ownership transfer
    initiateTransfer: IDL.Func([IDL.Text], [IDL.Variant({ ok: PendingTransfer, err: Error })], []),
    claimTransfer: IDL.Func([IDL.Text], [IDL.Variant({ ok: Property, err: Error })], []),
    cancelTransfer: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPendingTransfer: IDL.Func([IDL.Text], [IDL.Opt(PendingTransfer)], ["query"]),
    getPendingTransferByToken: IDL.Func([IDL.Text], [IDL.Opt(PendingTransfer)], ["query"]),
    getOwnershipHistory: IDL.Func([IDL.Text], [IDL.Vec(TransferRecord)], ["query"]),
    getPropertyOwner: IDL.Func([IDL.Text], [IDL.Opt(IDL.Principal)], ["query"]),
    // Delegated management
    inviteManager: IDL.Func(
      [IDL.Text, ManagerRole, IDL.Text],
      [IDL.Variant({ ok: ManagerInvite, err: Error })],
      []
    ),
    claimManagerRole: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Record({ propertyId: IDL.Text, role: ManagerRole }), err: Error })],
      []
    ),
    updateManagerRole: IDL.Func(
      [IDL.Text, IDL.Principal, ManagerRole],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    removeManager: IDL.Func([IDL.Text, IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    resignAsManager: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getMyManagedProperties: IDL.Func([], [IDL.Vec(ManagedProperty)], ["query"]),
    getPropertyManagers: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(PropertyManager), err: Error })], ["query"]),
    getManagerInviteByToken: IDL.Func([IDL.Text], [IDL.Opt(ManagerInvite)], ["query"]),
    recordManagerActivity: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getOwnerNotifications: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(OwnerNotification), err: Error })], ["query"]),
    dismissNotifications: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    isAuthorized: IDL.Func([IDL.Text, IDL.Principal, IDL.Bool], [IDL.Bool], ["query"]),
    getPropertyYearBuilt: IDL.Func([IDL.Text], [IDL.Opt(IDL.Nat)], ["query"]),
  });
};
