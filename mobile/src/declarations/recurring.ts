// Candid interface for the recurring canister — keep in sync with backend/recurring/main.mo
export const idlFactory = ({ IDL }: any) => {
  const RecurringServiceType = IDL.Variant({
    LawnCare:        IDL.Null,
    PestControl:     IDL.Null,
    PoolMaintenance: IDL.Null,
    GutterCleaning:  IDL.Null,
    PressureWashing: IDL.Null,
    Other:           IDL.Null,
  });

  const Frequency = IDL.Variant({
    Weekly:       IDL.Null,
    BiWeekly:     IDL.Null,
    Monthly:      IDL.Null,
    Quarterly:    IDL.Null,
    SemiAnnually: IDL.Null,
    Annually:     IDL.Null,
  });

  const ServiceStatus = IDL.Variant({
    Active:    IDL.Null,
    Paused:    IDL.Null,
    Cancelled: IDL.Null,
  });

  const RecurringService = IDL.Record({
    id:                 IDL.Text,
    propertyId:         IDL.Text,
    homeowner:          IDL.Principal,
    serviceType:        RecurringServiceType,
    providerName:       IDL.Text,
    providerLicense:    IDL.Opt(IDL.Text),
    providerPhone:      IDL.Opt(IDL.Text),
    frequency:          Frequency,
    startDate:          IDL.Text,
    contractEndDate:    IDL.Opt(IDL.Text),
    notes:              IDL.Opt(IDL.Text),
    status:             ServiceStatus,
    contractDocPhotoId: IDL.Opt(IDL.Text),
    createdAt:          IDL.Int,
  });

  const VisitLog = IDL.Record({
    id:         IDL.Text,
    serviceId:  IDL.Text,
    propertyId: IDL.Text,
    visitDate:  IDL.Text,
    note:       IDL.Opt(IDL.Text),
    createdAt:  IDL.Int,
  });

  const Error = IDL.Variant({
    NotFound:         IDL.Null,
    NotAuthorized:    IDL.Null,
    InvalidInput:     IDL.Text,
    AlreadyCancelled: IDL.Null,
  });

  return IDL.Service({
    createRecurringService: IDL.Func(
      [
        IDL.Text,              // propertyId
        RecurringServiceType,  // serviceType
        IDL.Text,              // providerName
        IDL.Opt(IDL.Text),     // providerLicense
        IDL.Opt(IDL.Text),     // providerPhone
        Frequency,             // frequency
        IDL.Text,              // startDate
        IDL.Opt(IDL.Text),     // contractEndDate
        IDL.Opt(IDL.Text),     // notes
      ],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      []
    ),
    getRecurringService: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      ["query"]
    ),
    getByProperty: IDL.Func(
      [IDL.Text],
      [IDL.Vec(RecurringService)],
      ["query"]
    ),
    updateStatus: IDL.Func(
      [IDL.Text, ServiceStatus],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      []
    ),
    attachContractDoc: IDL.Func(
      [IDL.Text, IDL.Text],
      [IDL.Variant({ ok: RecurringService, err: Error })],
      []
    ),
    addVisitLog: IDL.Func(
      [IDL.Text, IDL.Text, IDL.Opt(IDL.Text)],
      [IDL.Variant({ ok: VisitLog, err: Error })],
      []
    ),
    getVisitLogs: IDL.Func(
      [IDL.Text],
      [IDL.Vec(VisitLog)],
      ["query"]
    ),
    getMetrics: IDL.Func([], [IDL.Record({
      totalServices:  IDL.Nat,
      activeServices: IDL.Nat,
      pausedServices: IDL.Nat,
      totalVisitLogs: IDL.Nat,
      isPaused:       IDL.Bool,
    })], ["query"]),
  });
};
