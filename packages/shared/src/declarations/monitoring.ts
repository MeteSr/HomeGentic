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
  const AlertSeverity = IDL.Variant({ Critical: IDL.Null, Warning: IDL.Null, Info: IDL.Null });
  const AlertCategory = IDL.Variant({
    Cycles: IDL.Null, ErrorRate: IDL.Null, ResponseTime: IDL.Null,
    Memory: IDL.Null, Milestone: IDL.Null, TopUp: IDL.Null, Stale: IDL.Null,
  });
  const Alert = IDL.Record({
    id:         IDL.Text,
    severity:   AlertSeverity,
    category:   AlertCategory,
    canisterId: IDL.Opt(IDL.Principal),
    message:    IDL.Text,
    resolved:   IDL.Bool,
    createdAt:  IDL.Int,
    resolvedAt: IDL.Opt(IDL.Int),
  });
  const ErrorSummaryInput = IDL.Record({
    fingerprint: IDL.Text,
    message:     IDL.Text,
    errorType:   IDL.Text,
    count:       IDL.Nat,
    firstSeen:   IDL.Int,
    lastSeen:    IDL.Int,
    tierCounts:  IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat)),
    release:     IDL.Opt(IDL.Text),
  });
  const CostMetrics = IDL.Record({
    totalCyclesBurned:       IDL.Nat,
    totalUsdCost:            IDL.Float64,
    storageCostUsd:          IDL.Float64,
    computeCostUsd:          IDL.Float64,
    networkCostUsd:          IDL.Float64,
    projectedMonthlyCostUsd: IDL.Float64,
    costPerUserUsd:          IDL.Float64,
    calculatedAt:            IDL.Int,
  });
  const ProfitabilityMetrics = IDL.Record({
    revenueUsd:     IDL.Float64,
    costUsd:        IDL.Float64,
    profitUsd:      IDL.Float64,
    marginPct:      IDL.Float64,
    arpu:           IDL.Float64,
    ltv:            IDL.Float64,
    cac:            IDL.Float64,
    ltvToCacRatio:  IDL.Float64,
    breakEvenUsers: IDL.Nat,
    calculatedAt:   IDL.Int,
  });
  const ErrorSummary = IDL.Record({
    fingerprint: IDL.Text,
    message:     IDL.Text,
    errorType:   IDL.Text,
    firstSeen:   IDL.Int,
    lastSeen:    IDL.Int,
    count:       IDL.Nat,
    tierCounts:  IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat)),
    release:     IDL.Opt(IDL.Text),
    resolved:    IDL.Bool,
  });
  const FrontendErrorStats = IDL.Record({
    total:           IDL.Nat,
    unresolved:      IDL.Nat,
    topFingerprints: IDL.Vec(ErrorSummary),
  });
  return IDL.Service({
    // Used by the admin dashboard.
    getActiveAlerts:        IDL.Func([], [IDL.Vec(Alert)], ["query"]),
    calculateCostMetrics:   IDL.Func([IDL.Nat], [CostMetrics], ["query"]),
    calculateProfitability: IDL.Func([IDL.Float64, IDL.Nat, IDL.Nat], [ProfitabilityMetrics], ["query"]),
    getFrontendErrorStats:  IDL.Func([], [FrontendErrorStats], ["query"]),
    getFrontendErrors:      IDL.Func([IDL.Nat, IDL.Nat], [IDL.Vec(ErrorSummary)], ["query"]),
    resolveFrontendError:   IDL.Func([IDL.Text], [ResultUnit], []),
    // Used by the voice Worker (cron alerts, frontend error reports).
    getCriticalCycleAlerts: IDL.Func([], [IDL.Vec(Alert)], ["query"]),
    recordFrontendError:    IDL.Func([ErrorSummaryInput], [], []),
    getAllCanisterMetrics:  IDL.Func([], [IDL.Vec(CanisterMetrics)], ["query"]),
    getMetrics:            IDL.Func([], [Metrics],                  ["query"]),
    checkCycleLevels:      IDL.Func([], [IDL.Vec(CycleLevelResult)], []),
    getTrackedCanisters:   IDL.Func([], [IDL.Vec(TrackedCanister)], ["query"]),
    registerCanister:      IDL.Func([IDL.Principal, IDL.Text], [ResultUnit], []),
    unregisterCanister:    IDL.Func([IDL.Principal],            [ResultUnit], []),
    setLowCycleThreshold:  IDL.Func([IDL.Nat],                  [ResultUnit], []),
  });
};
