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
    Pro: IDL.Null,
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
    verificationMethod: IDL.Opt(IDL.Text),
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
  const HurricaneDeductible = IDL.Variant({ PercentOfCoverageA: IDL.Nat, Amount: IDL.Nat });
  const InsurancePolicyInput = IDL.Record({
    carrier:             IDL.Text,
    policyNumber:        IDL.Text,
    renewalDate:         IDL.Text,
    coverageACents:      IDL.Opt(IDL.Nat),
    hurricaneDeductible: IDL.Opt(HurricaneDeductible),
  });
  const InsurancePolicy = IDL.Record({
    carrier:             IDL.Text,
    policyNumber:        IDL.Text,
    renewalDate:         IDL.Text,
    coverageACents:      IDL.Opt(IDL.Nat),
    hurricaneDeductible: IDL.Opt(HurricaneDeductible),
    updatedAt:           IDL.Int,
  });
  const ClaimStatus = IDL.Variant({ Open: IDL.Null, Closed: IDL.Null });
  const ClaimInput = IDL.Record({
    title:           IDL.Text,
    dateOfLoss:      IDL.Text,
    cause:           IDL.Text,
    description:     IDL.Text,
    claimNumber:     IDL.Text,
    adjusterName:    IDL.Text,
    adjusterContact: IDL.Text,
    status:          ClaimStatus,
  });
  const ClaimLogEntry = IDL.Record({ date: IDL.Text, note: IDL.Text, addedAt: IDL.Int });
  const InsuranceClaim = IDL.Record({
    id:              IDL.Text,
    propertyId:      IDL.Text,
    title:           IDL.Text,
    dateOfLoss:      IDL.Text,
    cause:           IDL.Text,
    description:     IDL.Text,
    claimNumber:     IDL.Text,
    adjusterName:    IDL.Text,
    adjusterContact: IDL.Text,
    status:          ClaimStatus,
    log:             IDL.Vec(ClaimLogEntry),
    createdAt:       IDL.Int,
    updatedAt:       IDL.Int,
  });
  const InventoryItemInput = IDL.Record({
    roomId:       IDL.Opt(IDL.Text),
    name:         IDL.Text,
    category:     IDL.Text,
    quantity:     IDL.Nat,
    valueCents:   IDL.Opt(IDL.Nat),
    purchaseDate: IDL.Text,
    serialNumber: IDL.Text,
    notes:        IDL.Text,
  });
  const InventoryItem = IDL.Record({
    id:           IDL.Text,
    propertyId:   IDL.Text,
    roomId:       IDL.Opt(IDL.Text),
    name:         IDL.Text,
    category:     IDL.Text,
    quantity:     IDL.Nat,
    valueCents:   IDL.Opt(IDL.Nat),
    purchaseDate: IDL.Text,
    serialNumber: IDL.Text,
    notes:        IDL.Text,
    createdAt:    IDL.Int,
    updatedAt:    IDL.Int,
  });
  // #725 house guide for sitters and guests.
  const GuideContact = IDL.Record({ name: IDL.Text, role: IDL.Text, phone: IDL.Text });
  const guideFields = {
    wifiName:      IDL.Text,
    wifiPassword:  IDL.Text,
    alarm:         IDL.Text,
    trashDay:      IDL.Text,
    recyclingDay:  IDL.Text,
    waterShutoff:  IDL.Text,
    gasShutoff:    IDL.Text,
    electricPanel: IDL.Text,
    contacts:      IDL.Vec(GuideContact),
    notes:         IDL.Text,
    photoIds:      IDL.Vec(IDL.Text),
  };
  const HouseGuideInput = IDL.Record(guideFields);
  const HouseGuideRecord = IDL.Record({ ...guideFields, updatedAt: IDL.Int });
  const HouseGuideLink = IDL.Record({
    token:      IDL.Text,
    propertyId: IDL.Text,
    name:       IDL.Text,
    createdBy:  IDL.Principal,
    createdAt:  IDL.Int,
    expiresAt:  IDL.Int,
    revoked:    IDL.Bool,
  });
  const SharedHouseGuide = IDL.Record({
    address:   IDL.Text,
    city:      IDL.Text,
    state:     IDL.Text,
    zipCode:   IDL.Text,
    guide:     HouseGuideRecord,
    expiresAt: IDL.Int,
  });
  // #726 condo and HOA paperwork.
  const ReviewStatus = IDL.Variant({
    Planned: IDL.Null,
    Submitted: IDL.Null,
    Approved: IDL.Null,
    ApprovedWithConditions: IDL.Null,
    Denied: IDL.Null,
    Withdrawn: IDL.Null,
  });
  const reviewFields = {
    project:       IDL.Text,
    details:       IDL.Text,
    submittedDate: IDL.Text,
    status:        ReviewStatus,
    decisionDate:  IDL.Text,
    conditions:    IDL.Text,
    approvalDocId: IDL.Opt(IDL.Text),
    jobId:         IDL.Opt(IDL.Text),
  };
  const ReviewInput = IDL.Record(reviewFields);
  const ArchitecturalReview = IDL.Record({
    ...reviewFields,
    id:         IDL.Text,
    propertyId: IDL.Text,
    createdAt:  IDL.Int,
    updatedAt:  IDL.Int,
  });
  const assessmentFields = {
    title:       IDL.Text,
    amountCents: IDL.Nat,
    dueDate:     IDL.Text,
    paidDate:    IDL.Text,
    notes:       IDL.Text,
    documentId:  IDL.Opt(IDL.Text),
  };
  const AssessmentInput = IDL.Record(assessmentFields);
  const SpecialAssessment = IDL.Record({
    ...assessmentFields,
    id:         IDL.Text,
    propertyId: IDL.Text,
    createdAt:  IDL.Int,
    updatedAt:  IDL.Int,
  });
  const condoFields = {
    associationName:      IDL.Text,
    milestoneLastDate:    IDL.Text,
    milestoneNextDue:     IDL.Text,
    milestoneDocId:       IDL.Opt(IDL.Text),
    reserveStudyLastDate: IDL.Text,
    reserveStudyNextDue:  IDL.Text,
    reserveStudyDocId:    IDL.Opt(IDL.Text),
    notes:                IDL.Text,
  };
  const CondoRecordInput = IDL.Record(condoFields);
  const CondoRecord = IDL.Record({ ...condoFields, updatedAt: IDL.Int });
  // #719 home warranty plan and claims
  const planFields = {
    provider:        IDL.Text,
    planName:        IDL.Text,
    contractNumber:  IDL.Text,
    claimContact:    IDL.Text,
    serviceFeeCents: IDL.Opt(IDL.Nat),
    startDate:       IDL.Text,
    renewalDate:     IDL.Text,
    coverageNotes:   IDL.Text,
    exclusionNotes:  IDL.Text,
    contractDocId:   IDL.Opt(IDL.Text),
  };
  const HomeWarrantyPlanInput = IDL.Record(planFields);
  const HomeWarrantyPlan = IDL.Record({ ...planFields, updatedAt: IDL.Int });
  const WarrantyClaimOutcome = IDL.Variant({
    Open: IDL.Null, Approved: IDL.Null, PartlyApproved: IDL.Null, Denied: IDL.Null, Withdrawn: IDL.Null,
  });
  const hwClaimFields = {
    dateFiled:           IDL.Text,
    issue:               IDL.Text,
    claimNumber:         IDL.Text,
    jobId:               IDL.Opt(IDL.Text),
    serviceFeePaidCents: IDL.Opt(IDL.Nat),
    outcome:             WarrantyClaimOutcome,
    outcomeNotes:        IDL.Text,
  };
  const HomeWarrantyClaimInput = IDL.Record(hwClaimFields);
  const HomeWarrantyClaim = IDL.Record({
    ...hwClaimFields,
    id:         IDL.Text,
    propertyId: IDL.Text,
    createdAt:  IDL.Int,
    updatedAt:  IDL.Int,
  });
  // #722 mortgage details
  const loanFields = {
    lender:                IDL.Text,
    originalAmountCents:   IDL.Nat,
    rateThousandthsPct:    IDL.Nat,
    termMonths:            IDL.Nat,
    firstPaymentDate:      IDL.Text,
    originalValueCents:    IDL.Opt(IDL.Nat),
    currentValueCents:     IDL.Opt(IDL.Nat),
    monthlyPmiCents:       IDL.Opt(IDL.Nat),
    monthlyEscrowCents:    IDL.Opt(IDL.Nat),
    statementBalanceCents: IDL.Opt(IDL.Nat),
    statementDate:         IDL.Text,
  };
  const MortgageLoanInput = IDL.Record(loanFields);
  const MortgageLoan = IDL.Record({ ...loanFields, updatedAt: IDL.Int });
  const PulseHomeFinance = IDL.Record({
    propertyId: IDL.Text,
    warranty:   IDL.Opt(IDL.Record({ provider: IDL.Text, renewalDate: IDL.Text })),
    loan:       IDL.Opt(IDL.Record({
      originalAmountCents: IDL.Nat,
      rateThousandthsPct:  IDL.Nat,
      termMonths:          IDL.Nat,
      firstPaymentDate:    IDL.Text,
      originalValueCents:  IDL.Opt(IDL.Nat),
      monthlyPmiCents:     IDL.Opt(IDL.Nat),
    })),
  });
  // #714 property-tax years
  const TaxExemption = IDL.Variant({
    Unknown: IDL.Null, NotApplying: IDL.Null, Applied: IDL.Null, Granted: IDL.Null, Denied: IDL.Null,
  });
  const taxYearFields = {
    year:               IDL.Nat,
    marketValueCents:   IDL.Opt(IDL.Nat),
    assessedValueCents: IDL.Opt(IDL.Nat),
    taxableValueCents:  IDL.Opt(IDL.Nat),
    exemption:          TaxExemption,
    petitionDeadline:   IDL.Text,
    notes:              IDL.Text,
  };
  const PropertyTaxYearInput = IDL.Record(taxYearFields);
  const PropertyTaxYear = IDL.Record({ ...taxYearFields, updatedAt: IDL.Int });
  const PulsePropertyTax = IDL.Record({
    propertyId: IDL.Text,
    years: IDL.Vec(IDL.Record({ year: IDL.Nat, exemption: TaxExemption, petitionDeadline: IDL.Text })),
  });
  // #718 FEMA flood zone
  const FloodZoneStatus = IDL.Variant({ Mapped: IDL.Null, NotMapped: IDL.Null });
  const floodFields = {
    status:                 FloodZoneStatus,
    zone:                   IDL.Text,
    zoneSubtype:            IDL.Text,
    specialFloodHazardArea: IDL.Bool,
    baseFloodElevation:     IDL.Text,
    firmPanel:              IDL.Text,
    firmEffectiveDate:      IDL.Text,
    matchedAddress:         IDL.Text,
    latitude:               IDL.Text,
    longitude:              IDL.Text,
  };
  const FloodZoneInput = IDL.Record(floodFields);
  const FloodZoneRecord = IDL.Record({ ...floodFields, checkedAt: IDL.Int });
  const FloodTarget = IDL.Record({
    address:   IDL.Text,
    city:      IDL.Text,
    state:     IDL.Text,
    zipCode:   IDL.Text,
    floodZone: IDL.Opt(FloodZoneRecord),
  });
  // #712 move-in plan
  const MoveInTaskUrgency = IDL.Variant({ Safety: IDL.Null, Repair: IDL.Null, Monitor: IDL.Null });
  const moveInTaskFields = {
    title:   IDL.Text,
    detail:  IDL.Text,
    area:    IDL.Text,
    urgency: MoveInTaskUrgency,
  };
  const MoveInTaskInput = IDL.Record(moveInTaskFields);
  const MoveInTask = IDL.Record({ ...moveInTaskFields, id: IDL.Text, createdAt: IDL.Int });
  const MoveInPlan = IDL.Record({
    startedAt: IDL.Int,
    doneSteps: IDL.Vec(IDL.Text),
    tasks:     IDL.Vec(MoveInTask),
    updatedAt: IDL.Int,
  });
  // #724 successor / legacy contact
  const SuccessorInput = IDL.Record({ name: IDL.Text, email: IDL.Text, relationship: IDL.Text });
  const Successor = IDL.Record({
    name:         IDL.Text,
    email:        IDL.Text,
    relationship: IDL.Text,
    token:        IDL.Text,
    namedAt:      IDL.Int,
  });
  const SuccessionProofKind = IDL.Variant({
    DeathCertificate:        IDL.Null,
    LettersOfAdministration: IDL.Null,
    LettersTestamentary:     IDL.Null,
    TrustDocument:           IDL.Null,
  });
  const SuccessionClaimInput = IDL.Record({
    claimantName: IDL.Text,
    proofKind:    SuccessionProofKind,
    fileName:     IDL.Text,
    mimeType:     IDL.Text,
    note:         IDL.Text,
  });
  const SuccessionClaimStatus = IDL.Variant({
    AwaitingReview: IDL.Null,
    Approved:       IDL.Record({ at: IDL.Int }),
    Rejected:       IDL.Record({ at: IDL.Int, reason: IDL.Text }),
    Cancelled:      IDL.Record({ at: IDL.Int, by: IDL.Principal }),
    Completed:      IDL.Record({ at: IDL.Int }),
  });
  const SuccessionClaim = IDL.Record({
    id:           IDL.Text,
    propertyId:   IDL.Text,
    claimant:     IDL.Principal,
    claimantName: IDL.Text,
    proofKind:    SuccessionProofKind,
    fileName:     IDL.Text,
    mimeType:     IDL.Text,
    proofSize:    IDL.Nat,
    note:         IDL.Text,
    openedAt:     IDL.Int,
    waitEndsAt:   IDL.Int,
    status:       SuccessionClaimStatus,
  });
  const SuccessionProof = IDL.Record({ fileName: IDL.Text, mimeType: IDL.Text, data: IDL.Vec(IDL.Nat8) });
  const SuccessionInvite = IDL.Record({ property: Property, successorName: IDL.Text, waitDays: IDL.Nat });
  const SuccessionReview = IDL.Record({ claim: SuccessionClaim, property: Property, successor: IDL.Opt(Successor) });
  const SuccessionNotice = IDL.Record({ claim: SuccessionClaim, address: IDL.Text, household: IDL.Vec(IDL.Principal) });
  const NotifyEvent = IDL.Record({
    seq:       IDL.Nat,
    kind:      IDL.Text,
    recipient: IDL.Opt(IDL.Principal),
    refId:     IDL.Text,
    summary:   IDL.Text,
    createdAt: IDL.Int,
  });
  const Error = IDL.Variant({
    NotFound: IDL.Null,
    NotAuthorized: IDL.Null,
    Paused: IDL.Null,
    LimitReached: IDL.Null,
    InvalidInput: IDL.Text,
    DuplicateAddress: IDL.Null,
    AddressConflict: IDL.Int,
    RateLimited: IDL.Null,
    Unavailable: IDL.Text,
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
  const ManagerRole = IDL.Variant({ Viewer: IDL.Null, Manager: IDL.Null, CoOwner: IDL.Null });
  const PropertyManager = IDL.Record({
    principal       : IDL.Principal,
    role            : ManagerRole,
    displayName     : IDL.Text,
    addedAt         : IDL.Int,
    spendLimitCents : IDL.Opt(IDL.Nat),
  });
  const ManagerInvite = IDL.Record({
    propertyId      : IDL.Text,
    token           : IDL.Text,
    role            : ManagerRole,
    displayName     : IDL.Text,
    invitedBy       : IDL.Principal,
    createdAt       : IDL.Int,
    expiresAt       : IDL.Int,
    spendLimitCents : IDL.Opt(IDL.Nat),
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
  const ApprovalStatus = IDL.Variant({ Pending: IDL.Null, Approved: IDL.Null, Declined: IDL.Null });
  const PendingApprovalRequest = IDL.Record({
    id            : IDL.Nat,
    propertyId    : IDL.Text,
    requestedBy   : IDL.Principal,
    requesterName : IDL.Text,
    description   : IDL.Text,
    amountCents   : IDL.Nat,
    createdAt     : IDL.Int,
    status        : ApprovalStatus,
  });

  // Rooms and fixtures (merged into the property canister from the old room canister)
  const Fixture = IDL.Record({
    id:             IDL.Text,
    brand:          IDL.Text,
    model:          IDL.Text,
    serialNumber:   IDL.Text,
    installedDate:  IDL.Text,
    warrantyExpiry: IDL.Text,
    notes:          IDL.Text,
  });
  const RoomRecord = IDL.Record({
    id:         IDL.Text,
    propertyId: IDL.Text,
    owner:      IDL.Principal,
    name:       IDL.Text,
    floorName:  IDL.Text,
    floorType:  IDL.Text,
    paintColor: IDL.Text,
    paintBrand: IDL.Text,
    paintCode:  IDL.Text,
    notes:      IDL.Text,
    fixtures:   IDL.Vec(Fixture),
    createdAt:  IDL.Int,
    updatedAt:  IDL.Int,
  });

  const AddressMatch = IDL.Record({
    id:      IDL.Text,
    owner:   IDL.Principal,
    address: IDL.Text,
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
  return IDL.Service({
    getApiDoc: IDL.Func([], [IDL.Text], ["query"]),
    // OQL for AI assistants: a JSON catalogue, and one JSON query -> paged rows.
    schema:  IDL.Func([], [IDL.Text], ["query"]),
    execute: IDL.Func([IDL.Text], [OqlResult], ["query"]),
    getRoomsByProperty: IDL.Func([IDL.Text], [IDL.Vec(RoomRecord)], ["query"]),
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
    getPendingVerifications: IDL.Func([], [IDL.Variant({ ok: IDL.Vec(Property), err: Error })], []),  // admin only
    isAdminPrincipal: IDL.Func([IDL.Principal], [IDL.Bool], ["query"]),
    // Weekly Home Pulse email (notification relay only).
    getPulseProperties: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({
        ok: IDL.Vec(IDL.Record({
          id: IDL.Text, address: IDL.Text, city: IDL.Text, state: IDL.Text, zipCode: IDL.Text, yearBuilt: IDL.Nat,
        })),
        err: Error,
      })],
      ["query"]
    ),
    // #711: the home's insurance policy (household) and renewal dates for the
    // weekly Home Pulse email (notification relay only).
    getInsurancePolicy: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(InsurancePolicy), err: Error })],
      ["query"]
    ),
    setInsurancePolicy: IDL.Func(
      [IDL.Text, IDL.Opt(InsurancePolicyInput)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // #711 claim kit: the household's records of insurance claims on the home.
    getInsuranceClaims: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(InsuranceClaim), err: Error })],
      ["query"]
    ),
    createInsuranceClaim: IDL.Func(
      [IDL.Text, ClaimInput],
      [IDL.Variant({ ok: InsuranceClaim, err: Error })],
      []
    ),
    updateInsuranceClaim: IDL.Func(
      [IDL.Text, ClaimInput],
      [IDL.Variant({ ok: InsuranceClaim, err: Error })],
      []
    ),
    addInsuranceClaimLog: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: InsuranceClaim, err: Error })],
      []
    ),
    deleteInsuranceClaim: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // #711 contents inventory: what's in the home, room by room, for a claim.
    getInventory: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(InventoryItem), err: Error })],
      ["query"]
    ),
    addInventoryItem: IDL.Func(
      [IDL.Text, InventoryItemInput],
      [IDL.Variant({ ok: InventoryItem, err: Error })],
      []
    ),
    updateInventoryItem: IDL.Func(
      [IDL.Text, InventoryItemInput],
      [IDL.Variant({ ok: InventoryItem, err: Error })],
      []
    ),
    deleteInventoryItem: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    // #725 house guide.
    setHouseGuide: IDL.Func([IDL.Text, IDL.Opt(HouseGuideInput)], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getHouseGuide: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Opt(HouseGuideRecord), err: Error })], ["query"]),
    createHouseGuideLink: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat],
      [IDL.Variant({ ok: HouseGuideLink, err: Error })],
      []
    ),
    listHouseGuideLinks: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(HouseGuideLink), err: Error })], ["query"]),
    revokeHouseGuideLink: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getSharedHouseGuide: IDL.Func([IDL.Text], [IDL.Variant({ ok: SharedHouseGuide, err: Error })], ["query"]),
    // #726 condo and HOA paperwork.
    addArchitecturalReview: IDL.Func(
      [IDL.Text, ReviewInput],
      [IDL.Variant({ ok: ArchitecturalReview, err: Error })],
      []
    ),
    updateArchitecturalReview: IDL.Func(
      [IDL.Text, ReviewInput],
      [IDL.Variant({ ok: ArchitecturalReview, err: Error })],
      []
    ),
    deleteArchitecturalReview: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getArchitecturalReviews: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(ArchitecturalReview), err: Error })],
      ["query"]
    ),
    addSpecialAssessment: IDL.Func(
      [IDL.Text, AssessmentInput],
      [IDL.Variant({ ok: SpecialAssessment, err: Error })],
      []
    ),
    updateSpecialAssessment: IDL.Func(
      [IDL.Text, AssessmentInput],
      [IDL.Variant({ ok: SpecialAssessment, err: Error })],
      []
    ),
    deleteSpecialAssessment: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getSpecialAssessments: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(SpecialAssessment), err: Error })],
      ["query"]
    ),
    setCondoAssociationRecord: IDL.Func(
      [IDL.Text, IDL.Opt(CondoRecordInput)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getCondoAssociationRecord: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(CondoRecord), err: Error })],
      ["query"]
    ),
    // #719 home warranty plan and claims
    setHomeWarrantyPlan: IDL.Func(
      [IDL.Text, IDL.Opt(HomeWarrantyPlanInput)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getHomeWarrantyPlan: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(HomeWarrantyPlan), err: Error })],
      ["query"]
    ),
    addHomeWarrantyClaim: IDL.Func(
      [IDL.Text, HomeWarrantyClaimInput],
      [IDL.Variant({ ok: HomeWarrantyClaim, err: Error })],
      []
    ),
    updateHomeWarrantyClaim: IDL.Func(
      [IDL.Text, HomeWarrantyClaimInput],
      [IDL.Variant({ ok: HomeWarrantyClaim, err: Error })],
      []
    ),
    deleteHomeWarrantyClaim: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getHomeWarrantyClaims: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(HomeWarrantyClaim), err: Error })],
      ["query"]
    ),
    // #722 mortgage details (owner and co-owners)
    setMortgageLoan: IDL.Func(
      [IDL.Text, IDL.Opt(MortgageLoanInput)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getMortgageLoan: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(MortgageLoan), err: Error })],
      ["query"]
    ),
    // #719 / #722 weekly Home Pulse email (notification relay only)
    getPulseHomeFinance: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Vec(PulseHomeFinance), err: Error })],
      ["query"]
    ),
    // #714 property-tax years (owner and co-owners)
    setPropertyTaxYear: IDL.Func(
      [IDL.Text, PropertyTaxYearInput],
      [IDL.Variant({ ok: PropertyTaxYear, err: Error })],
      []
    ),
    deletePropertyTaxYear: IDL.Func([IDL.Text, IDL.Nat], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPropertyTaxYears: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Vec(PropertyTaxYear), err: Error })],
      ["query"]
    ),
    // #714 weekly Home Pulse email (notification relay only)
    getPulsePropertyTax: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({ ok: IDL.Vec(PulsePropertyTax), err: Error })],
      ["query"]
    ),
    // #712 move-in plan for new owners
    startMoveInPlan: IDL.Func([IDL.Text], [IDL.Variant({ ok: MoveInPlan, err: Error })], []),
    getMoveInPlan: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(MoveInPlan), err: Error })],
      ["query"]
    ),
    setMoveInStep: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Bool],
      [IDL.Variant({ ok: MoveInPlan, err: Error })],
      []
    ),
    addMoveInTasks: IDL.Func(
      [IDL.Text, IDL.Vec(MoveInTaskInput)],
      [IDL.Variant({ ok: MoveInPlan, err: Error })],
      []
    ),
    deleteMoveInTask: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: MoveInPlan, err: Error })],
      []
    ),
    endMoveInPlan: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    // #724 successor / legacy contact for the home record
    setSuccessor: IDL.Func([IDL.Text, SuccessorInput], [IDL.Variant({ ok: Successor, err: Error })], []),
    getSuccessor: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Opt(Successor), err: Error })], ["query"]),
    removeSuccessor: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getSuccessionInvite: IDL.Func([IDL.Text], [IDL.Opt(SuccessionInvite)], ["query"]),
    openSuccessionClaim: IDL.Func(
      [IDL.Text, SuccessionClaimInput, IDL.Vec(IDL.Nat8)],
      [IDL.Variant({ ok: SuccessionClaim, err: Error })],
      []
    ),
    getOpenSuccessionClaim: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(SuccessionClaim), err: Error })],
      ["query"]
    ),
    getMySuccessionClaims: IDL.Func([], [IDL.Vec(SuccessionClaim)], ["query"]),
    cancelSuccessionClaim: IDL.Func([IDL.Text], [IDL.Variant({ ok: SuccessionClaim, err: Error })], []),
    listSuccessionClaimsForReview: IDL.Func(
      [],
      [IDL.Variant({ ok: IDL.Vec(SuccessionReview), err: Error })],
      ["query"]
    ),
    getSuccessionProof: IDL.Func([IDL.Text], [IDL.Variant({ ok: SuccessionProof, err: Error })], ["query"]),
    reviewSuccessionClaim: IDL.Func(
      [IDL.Text, IDL.Bool, IDL.Text],
      [IDL.Variant({ ok: SuccessionClaim, err: Error })],
      []
    ),
    completeSuccessionClaim: IDL.Func([IDL.Text], [IDL.Variant({ ok: Property, err: Error })], []),
    getSuccessionNotice: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(SuccessionNotice), err: Error })],
      ["query"]
    ),
    getNotificationEvents: IDL.Func(
      [IDL.Nat, IDL.Nat],
      [IDL.Variant({ ok: IDL.Record({ events: IDL.Vec(NotifyEvent), latestSeq: IDL.Nat }), err: Error })],
      ["query"]
    ),
    // #718 FEMA flood zone (the household reads; the voice Worker looks it up and saves)
    getFloodZone: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Opt(FloodZoneRecord), err: Error })],
      ["query"]
    ),
    relayFloodTarget: IDL.Func(
      [IDL.Text, IDL.Principal],
      [IDL.Variant({ ok: FloodTarget, err: Error })],
      ["query"]
    ),
    relaySetFloodZone: IDL.Func(
      [IDL.Text, IDL.Principal, FloodZoneInput],
      [IDL.Variant({ ok: FloodZoneRecord, err: Error })],
      []
    ),
    getPulseInsurance: IDL.Func(
      [IDL.Principal],
      [IDL.Variant({
        ok: IDL.Vec(IDL.Record({ propertyId: IDL.Text, carrier: IDL.Text, renewalDate: IDL.Text })),
        err: Error,
      })],
      ["query"]
    ),
    relayMarkIdentityCleared: IDL.Func(
      [IDL.Text, IDL.Principal, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    verifyProperty: IDL.Func(
      [IDL.Text, IDL.Variant({ Unverified: IDL.Null, PendingReview: IDL.Null, Basic: IDL.Null, Premium: IDL.Null }), IDL.Opt(IDL.Text)],
      [IDL.Variant({ ok: Property, err: Error })],
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
      [IDL.Text, ManagerRole, IDL.Text, IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: ManagerInvite, err: Error })],
      []
    ),
    claimManagerRole: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Record({ propertyId: IDL.Text, role: ManagerRole }), err: Error })],
      []
    ),
    cancelManagerInvite: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getPendingInvitesForProperty: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(ManagerInvite), err: Error })], ["query"]),
    updateManagerRole: IDL.Func(
      [IDL.Text, IDL.Principal, ManagerRole, IDL.Opt(IDL.Nat)],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    removeManager: IDL.Func([IDL.Text, IDL.Principal], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    resignAsManager: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    deleteMyData: IDL.Func([], [IDL.Variant({ ok: IDL.Nat, err: Error })], []),
    getMyManagedProperties: IDL.Func([], [IDL.Vec(ManagedProperty)], ["query"]),
    getPropertyManagers: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(PropertyManager), err: Error })], ["query"]),
    getManagerInviteByToken: IDL.Func([IDL.Text], [IDL.Opt(ManagerInvite)], ["query"]),
    // Token-gated property views for the claim pages (address included, PII blanked)
    getPropertyByTransferToken: IDL.Func([IDL.Text], [IDL.Opt(Property)], ["query"]),
    getPropertyByManagerInviteToken: IDL.Func([IDL.Text], [IDL.Opt(Property)], ["query"]),
    // Street addresses for jobs the caller is a party to (contractor views)
    getJobPropertyAddresses: IDL.Func(
      [IDL.Vec(IDL.Text)],
      [IDL.Vec(IDL.Record({ jobId: IDL.Text, propertyId: IDL.Text, address: IDL.Text }))],
      []
    ),
    recordManagerActivity: IDL.Func([IDL.Text, IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    getOwnerNotifications: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(OwnerNotification), err: Error })], ["query"]),
    dismissNotifications: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Null, err: Error })], []),
    requestApproval: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Nat],
      [IDL.Variant({ ok: IDL.Nat, err: Error })],
      []
    ),
    respondToApproval: IDL.Func(
      [IDL.Text, IDL.Nat, IDL.Bool],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    getApprovals: IDL.Func([IDL.Text], [IDL.Variant({ ok: IDL.Vec(PendingApprovalRequest), err: Error })], ["query"]),
    isAuthorized: IDL.Func([IDL.Text, IDL.Principal, IDL.Bool], [IDL.Bool], ["query"]),
    getAccessRole: IDL.Func(
      [IDL.Text, IDL.Principal],
      [IDL.Opt(IDL.Variant({ Owner: IDL.Null, CoOwner: IDL.Null, Manager: IDL.Null, Viewer: IDL.Null, NoAccess: IDL.Null }))],
      ["query"],
    ),
    getAccessRoles: IDL.Func(
      [IDL.Vec(IDL.Text), IDL.Principal],
      [IDL.Vec(IDL.Opt(IDL.Variant({ Owner: IDL.Null, CoOwner: IDL.Null, Manager: IDL.Null, Viewer: IDL.Null, NoAccess: IDL.Null })))],
      ["query"],
    ),
    getPropertyYearBuilt: IDL.Func([IDL.Text], [IDL.Opt(IDL.Nat)], ["query"]),
    getPropertyAddress:   IDL.Func([IDL.Text], [IDL.Opt(IDL.Text)], ["query"]),
    // Contractor job proposals: street address → the property that holds it
    findPropertiesByAddress: IDL.Func([IDL.Text], [IDL.Vec(AddressMatch)], ["query"]),
  });
};
