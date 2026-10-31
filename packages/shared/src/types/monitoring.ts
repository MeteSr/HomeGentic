// Generated from ../declarations/monitoring.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type CostMetrics = {
  projectedMonthlyCostUsd: number;
  storageCostUsd: number;
  totalCyclesBurned: bigint;
  totalUsdCost: number;
  calculatedAt: bigint;
  costPerUserUsd: number;
  computeCostUsd: number;
  networkCostUsd: number;
};

export type ProfitabilityMetrics = {
  cac: number;
  ltv: number;
  revenueUsd: number;
  arpu: number;
  profitUsd: number;
  calculatedAt: bigint;
  breakEvenUsers: bigint;
  marginPct: number;
  ltvToCacRatio: number;
  costUsd: number;
};

export type CycleLevelResult = {
  id: Principal;
  status: string;
  name: string;
  cycles: bigint;
  fromCache: boolean;
};

export type Alert = {
  id: string;
  resolved: boolean;
  createdAt: bigint;
  message: string;
  category: AlertCategory;
  severity: AlertSeverity;
  canisterId: [] | [Principal];
  resolvedAt: [] | [bigint];
};

export type AlertCategory =
  | { ErrorRate: null }
  | { Stale: null }
  | { Memory: null }
  | { Milestone: null }
  | { ResponseTime: null }
  | { TopUp: null }
  | { Cycles: null };

export type AlertSeverity = { Info: null } | { Critical: null } | { Warning: null };

export type CanisterMetrics = {
  memoryCapacity: bigint;
  updatedAt: bigint;
  memoryBytes: bigint;
  avgResponseTimeMs: bigint;
  errorCount: bigint;
  cyclesBalance: bigint;
  requestCount: bigint;
  canisterId: Principal;
  cyclesBurned: bigint;
};

export type FrontendErrorStats = {
  total: bigint;
  topFingerprints: ErrorSummary[];
  unresolved: bigint;
};

export type ErrorSummary = {
  firstSeen: bigint;
  resolved: boolean;
  count: bigint;
  release: [] | [string];
  errorType: string;
  message: string;
  fingerprint: string;
  tierCounts: Array<[string, bigint]>;
  lastSeen: bigint;
};

export type Metrics = {
  cyclesPerCall: MethodCyclesSummary[];
  isPaused: boolean;
  totalCanisters: bigint;
  activeAlerts: bigint;
  criticalAlerts: bigint;
};

export type MethodCyclesSummary = {
  method: string;
  sampleCount: bigint;
  lastUpdatedAt: bigint;
  avgCycles: bigint;
};

export type TrackedCanister = {
  id: Principal;
  name: string;
};

export type ErrorSummaryInput = {
  firstSeen: bigint;
  count: bigint;
  release: [] | [string];
  errorType: string;
  message: string;
  fingerprint: string;
  tierCounts: Array<[string, bigint]>;
  lastSeen: bigint;
};

export type ResultUnit = { ok: null } | { err: Error };

export type Error = { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null };

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  calculateCostMetrics: ActorMethod<[bigint], CostMetrics>;
  calculateProfitability: ActorMethod<[number, bigint, bigint], ProfitabilityMetrics>;
  checkCycleLevels: ActorMethod<[], CycleLevelResult[]>;
  getActiveAlerts: ActorMethod<[], Alert[]>;
  getAllCanisterMetrics: ActorMethod<[], CanisterMetrics[]>;
  getCriticalCycleAlerts: ActorMethod<[], Alert[]>;
  getFrontendErrorStats: ActorMethod<[], FrontendErrorStats>;
  getFrontendErrors: ActorMethod<[bigint, bigint], ErrorSummary[]>;
  getMetrics: ActorMethod<[], Metrics>;
  getTrackedCanisters: ActorMethod<[], TrackedCanister[]>;
  recordFrontendError: ActorMethod<[ErrorSummaryInput], undefined>;
  registerCanister: ActorMethod<[Principal, string], ResultUnit>;
  resolveFrontendError: ActorMethod<[string], ResultUnit>;
  setLowCycleThreshold: ActorMethod<[bigint], ResultUnit>;
  unregisterCanister: ActorMethod<[Principal], ResultUnit>;
}
