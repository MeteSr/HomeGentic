// Candid interface for the report canister — keep in sync with backend/report/main.mo
export const idlFactory = ({ IDL }: any) => {
  const VisibilityLevel = IDL.Variant({ Public: IDL.Null, BuyerOnly: IDL.Null });

  const JobInput = IDL.Record({
    serviceType:    IDL.Text,
    description:    IDL.Text,
    contractorName: IDL.Opt(IDL.Text),
    amountCents:    IDL.Nat,
    date:           IDL.Text,
    isDiy:          IDL.Bool,
    permitNumber:   IDL.Opt(IDL.Text),
    warrantyMonths: IDL.Opt(IDL.Nat),
    isVerified:     IDL.Bool,
    status:         IDL.Text,
  });

  const PropertyInput = IDL.Record({
    address:           IDL.Text,
    city:              IDL.Text,
    state:             IDL.Text,
    zipCode:           IDL.Text,
    propertyType:      IDL.Text,
    yearBuilt:         IDL.Nat,
    squareFeet:        IDL.Nat,
    verificationLevel: IDL.Text,
  });

  const RecurringServiceInput = IDL.Record({
    serviceType:   IDL.Text,
    providerName:  IDL.Text,
    frequency:     IDL.Text,
    status:        IDL.Text,
    startDate:     IDL.Text,
    lastVisitDate: IDL.Opt(IDL.Text),
    totalVisits:   IDL.Nat,
  });

  const RoomInput = IDL.Record({
    name:         IDL.Text,
    floorType:    IDL.Text,
    paintColor:   IDL.Text,
    paintBrand:   IDL.Text,
    paintCode:    IDL.Text,
    fixtureCount: IDL.Nat,
  });

  const ReportSnapshot = IDL.Record({
    snapshotId:        IDL.Text,
    propertyId:        IDL.Text,
    generatedBy:       IDL.Principal,
    address:           IDL.Text,
    city:              IDL.Text,
    state:             IDL.Text,
    zipCode:           IDL.Text,
    propertyType:      IDL.Text,
    yearBuilt:         IDL.Nat,
    squareFeet:        IDL.Nat,
    verificationLevel: IDL.Text,
    jobs:              IDL.Vec(JobInput),
    recurringServices: IDL.Vec(RecurringServiceInput),
    rooms:             IDL.Opt(IDL.Vec(RoomInput)),
    totalAmountCents:  IDL.Nat,
    verifiedJobCount:  IDL.Nat,
    diyJobCount:       IDL.Nat,
    permitCount:       IDL.Nat,
    generatedAt:       IDL.Int,
  });

  const ShareLink = IDL.Record({
    token:      IDL.Text,
    snapshotId: IDL.Text,
    propertyId: IDL.Text,
    createdBy:  IDL.Principal,
    expiresAt:  IDL.Opt(IDL.Int),
    visibility: VisibilityLevel,
    viewCount:  IDL.Nat,
    isActive:   IDL.Bool,
    createdAt:  IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:            IDL.Null,
    Expired:             IDL.Null,
    Revoked:             IDL.Null,
    NotAuthorized:       IDL.Null,
    InvalidInput:        IDL.Text,
    UnverifiedProperty:  IDL.Null,
  });

  const SensorSummary = IDL.Record({
    deviceId:    IDL.Text,
    name:        IDL.Text,
    source:      IDL.Text,
    isActive:    IDL.Bool,
    lastEventAt: IDL.Opt(IDL.Int),
    eventCount:  IDL.Nat,
  });

  const AlertSummary = IDL.Record({
    alertId:         IDL.Text,
    eventType:       IDL.Text,
    severity:        IDL.Text,
    timestamp:       IDL.Int,
    resolvedByJobId: IDL.Opt(IDL.Text),
  });

  const RiskProfile = IDL.Record({
    schemaVersion:    IDL.Text,
    token:            IDL.Text,
    propertyId:       IDL.Text,
    generatedAt:      IDL.Int,
    expiresAt:        IDL.Opt(IDL.Int),
    maintenanceScore: IDL.Nat,
    verificationLevel: IDL.Text,
    sensorCoverage:   IDL.Vec(SensorSummary),
    recentAlerts:     IDL.Vec(AlertSummary),
    openJobs:         IDL.Nat,
    verifiedJobCount: IDL.Nat,
    permitCount:      IDL.Nat,
  });

  const RiskProfileError = IDL.Variant({
    NotFound:      IDL.Null,
    Expired:       IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput:  IDL.Text,
  });

  return IDL.Service({
    // Params 1-6 match the original interface; 7-11 are new trailing opt args.
    generateReport: IDL.Func(
      [IDL.Text, PropertyInput, IDL.Vec(JobInput), IDL.Vec(RecurringServiceInput),
       IDL.Opt(IDL.Nat), VisibilityLevel,
       IDL.Opt(IDL.Vec(RoomInput)), IDL.Opt(IDL.Bool), IDL.Opt(IDL.Bool), IDL.Opt(IDL.Bool), IDL.Opt(IDL.Bool)],
      [IDL.Variant({ ok: ShareLink, err: Error })],
      []
    ),
    // getReport returns a tuple (ShareLink, ReportSnapshot) on success
    getReport: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Tuple(ShareLink, ReportSnapshot), err: Error })],
      []
    ),
    hasActivePublicShareLink: IDL.Func([IDL.Text], [IDL.Bool], ["query"]),
    listShareLinks: IDL.Func([IDL.Text], [IDL.Vec(ShareLink)], []),
    revokeShareLink: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    generateRiskProfile: IDL.Func(
      [IDL.Text, IDL.Opt(IDL.Nat), IDL.Text],
      [IDL.Variant({ ok: RiskProfile, err: RiskProfileError })],
      []
    ),
    getRiskProfile: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: RiskProfile, err: RiskProfileError })],
      ["query"]
    ),
  });
};
