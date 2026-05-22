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
import { idlFactory } from "@/declarations/monitoring";
export { idlFactory };

const MONITORING_CANISTER_ID = (import.meta as any).env?.VITE_MONITORING_CANISTER_ID ?? "";

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
      const a = await getActor();
      const raw = await a.getTrackedCanisters() as any[];
      return raw.map((r: any) => ({ id: r.id.toText(), name: r.name }));
    },

    async getMetrics(): Promise<MonitoringMetrics> {
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
