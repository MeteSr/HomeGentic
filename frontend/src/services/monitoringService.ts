/**
 * Monitoring service — frontend client for the `monitoring` ICP canister.
 *
 * Used by AdminDashboardPage to surface cycles burn rate, runway estimates,
 * and per-canister health (13.6.3).
 *
 * Falls back to mock data when MONITORING_CANISTER_ID is not set.
 */

import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const MONITORING_CANISTER_ID = (import.meta as any).env?.VITE_MONITORING_CANISTER_ID ?? "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

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
    Unauthorized: IDL.Null,
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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanisterMetrics {
  canisterId:        string;   // Principal as text
  cyclesBalance:     number;
  cyclesBurned:      number;   // burned in last snapshot window (~1 day)
  memoryBytes:       number;
  memoryCapacity:    number;
  requestCount:      number;
  errorCount:        number;
  avgResponseTimeMs: number;
  updatedAt:         number;   // nanosecond timestamp → divide by 1e6 for ms
}

export interface MethodCyclesSummary {
  method:        string;
  avgCycles:     number;
  sampleCount:   number;
  lastUpdatedAt: number;
}

export interface MonitoringMetrics {
  totalCanisters: number;
  activeAlerts:   number;
  criticalAlerts: number;
  isPaused:       boolean;
  cyclesPerCall:  MethodCyclesSummary[];
}

export interface TrackedCanister {
  id:   string;   // Principal as text
  name: string;
}

export interface CycleLevelResult {
  id:        string;   // Principal as text
  name:      string;
  cycles:    number;
  /** "ok" | "warning" | "critical" | "unknown" */
  status:    string;
  fromCache: boolean;
}

// ─── Computed helpers ─────────────────────────────────────────────────────────

/** Estimated days of runway remaining given current balance and daily burn. */
export function runwayDays(cyclesBalance: number, dailyBurn: number): number | null {
  if (dailyBurn <= 0) return null;
  return cyclesBalance / dailyBurn;
}

/** USD cost for a given cycles amount. */
export function cyclesToUsd(cycles: number): number {
  return (cycles / 1e12) * 1.39;
}

/** Human-readable label for a canister ID (falls back to first 12 chars). */
export function canisterLabel(canisterId: string): string {
  const KNOWN: Record<string, string> = {
    // populated at runtime from dfx.json / env — hardcode common names here
  };
  return KNOWN[canisterId] ?? canisterId.slice(0, 12) + "…";
}

// ─── Mock data (used when no canister ID is set) ──────────────────────────────

const MOCK_CANISTER_NAMES = [
  "auth", "property", "job", "contractor", "quote",
  "payment", "photo", "report", "market",
  "maintenance", "sensor", "monitoring", "listing",
  "agent", "recurring", "bills",
];

function mockMetrics(): CanisterMetrics[] {
  return MOCK_CANISTER_NAMES.map((name, i) => ({
    canisterId:        `mock-${name}-canister-id`,
    cyclesBalance:     20_000_000_000_000 - i * 500_000_000_000,  // ~20T declining
    cyclesBurned:      10_000_000 + i * 2_000_000,               // ~10-34M/day
    memoryBytes:       (1 + i * 0.3) * 1024 * 1024,
    memoryCapacity:    32 * 1024 * 1024,
    requestCount:      1000 + i * 100,
    errorCount:        i % 5 === 0 ? 5 : 0,
    avgResponseTimeMs: 50 + i * 10,
    updatedAt:         Date.now() * 1_000_000,
  }));
}

function mockCycleLevels(): CycleLevelResult[] {
  return MOCK_CANISTER_NAMES.map((name, i) => {
    const cycles = 20_000_000_000_000 - i * 500_000_000_000;
    const status = cycles < 1_000_000_000_000 ? "critical"
                 : cycles < 2_000_000_000_000 ? "warning"
                 : "ok";
    return { id: `mock-${name}-canister-id`, name, cycles, status, fromCache: true };
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

function createMonitoringService() {
  let _actor: any = null;

  async function getActor() {
    if (!_actor) {
      const agent = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent, canisterId: MONITORING_CANISTER_ID });
    }
    return _actor;
  }

  return {
    async getAllCanisterMetrics(): Promise<CanisterMetrics[]> {
      if (!MONITORING_CANISTER_ID) return mockMetrics();
      const a = await getActor();
      const raw = await a.getAllCanisterMetrics() as any[];
      return raw.map((r: any) => ({
        canisterId:        r.canisterId.toText(),
        cyclesBalance:     Number(r.cyclesBalance),
        cyclesBurned:      Number(r.cyclesBurned),
        memoryBytes:       Number(r.memoryBytes),
        memoryCapacity:    Number(r.memoryCapacity),
        requestCount:      Number(r.requestCount),
        errorCount:        Number(r.errorCount),
        avgResponseTimeMs: Number(r.avgResponseTimeMs),
        updatedAt:         Number(r.updatedAt),
      }));
    },

    async checkCycleLevels(): Promise<CycleLevelResult[]> {
      if (!MONITORING_CANISTER_ID) return mockCycleLevels();
      const a = await getActor();
      const raw = await a.checkCycleLevels() as any[];
      return raw.map((r: any) => ({
        id:        r.id.toText(),
        name:      r.name,
        cycles:    Number(r.cycles),
        status:    r.status,
        fromCache: Boolean(r.fromCache),
      }));
    },

    async getTrackedCanisters(): Promise<TrackedCanister[]> {
      if (!MONITORING_CANISTER_ID) return MOCK_CANISTER_NAMES.map((name) => ({
        id: `mock-${name}-canister-id`, name,
      }));
      const a = await getActor();
      const raw = await a.getTrackedCanisters() as any[];
      return raw.map((r: any) => ({ id: r.id.toText(), name: r.name }));
    },

    async getMetrics(): Promise<MonitoringMetrics> {
      if (!MONITORING_CANISTER_ID) {
        return {
          totalCanisters: 13,
          activeAlerts:   0,
          criticalAlerts: 0,
          isPaused:       false,
          cyclesPerCall:  [],
        };
      }
      const a = await getActor();
      const raw = await a.getMetrics() as any;
      return {
        totalCanisters: Number(raw.totalCanisters),
        activeAlerts:   Number(raw.activeAlerts),
        criticalAlerts: Number(raw.criticalAlerts),
        isPaused:       Boolean(raw.isPaused),
        cyclesPerCall:  (raw.cyclesPerCall ?? []).map((r: any) => ({
          method:        r.method,
          avgCycles:     Number(r.avgCycles),
          sampleCount:   Number(r.sampleCount),
          lastUpdatedAt: Number(r.lastUpdatedAt),
        })),
      };
    },
  };
}

export const monitoringService = createMonitoringService();
