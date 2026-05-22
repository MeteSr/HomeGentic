// Candid interface for the monitoring canister — keep in sync with backend/monitoring/main.mo
export const idlFactory = ({ IDL }: any) => {
  const CanisterMetrics = IDL.Record({
    canisterId:        IDL.Principal,
    cyclesBalance:     IDL.Nat,
    cyclesBurned:      IDL.Nat,
    memoryBytes:       IDL.Nat,
    memoryCapacity:    IDL.Nat,
    requestCount:      IDL.Nat,
    errorCount:        IDL.Nat,
    avgResponseTimeMs: IDL.Nat,
    updatedAt:         IDL.Int,
  });
  const MethodCyclesSummary = IDL.Record({
    method:        IDL.Text,
    avgCycles:     IDL.Nat,
    sampleCount:   IDL.Nat,
    lastUpdatedAt: IDL.Int,
  });
  const Metrics = IDL.Record({
    totalCanisters: IDL.Nat,
    activeAlerts:   IDL.Nat,
    criticalAlerts: IDL.Nat,
    isPaused:       IDL.Bool,
    cyclesPerCall:  IDL.Vec(MethodCyclesSummary),
  });
  const TrackedCanister = IDL.Record({
    id:   IDL.Principal,
    name: IDL.Text,
  });
  const CycleLevelResult = IDL.Record({
    id:        IDL.Principal,
    name:      IDL.Text,
    cycles:    IDL.Nat,
    status:    IDL.Text,
    fromCache: IDL.Bool,
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    NotAuthorized: IDL.Null,
    InvalidInput: IDL.Text,
  });
  const ResultUnit = IDL.Variant({ ok: IDL.Null, err: Error });
  return IDL.Service({
    getAllCanisterMetrics:  IDL.Func([], [IDL.Vec(CanisterMetrics)], ["query"]),
    getMetrics:            IDL.Func([], [Metrics],                  ["query"]),
    checkCycleLevels:      IDL.Func([], [IDL.Vec(CycleLevelResult)], []),
    getTrackedCanisters:   IDL.Func([], [IDL.Vec(TrackedCanister)], ["query"]),
    registerCanister:      IDL.Func([IDL.Principal, IDL.Text], [ResultUnit], []),
    unregisterCanister:    IDL.Func([IDL.Principal],            [ResultUnit], []),
    setLowCycleThreshold:  IDL.Func([IDL.Nat],                  [ResultUnit], []),
  });
};
