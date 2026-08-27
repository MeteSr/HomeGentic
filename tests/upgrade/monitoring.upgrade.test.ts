/**
 * Monitoring canister — upgrade persistence tests (issue #421)
 *
 * Verifies that cycle alerts and canister metrics survive canister upgrades.
 * This is the most important upgrade test for operational continuity: a canister
 * approaching freeze stops executing and therefore stops pushing metrics — if
 * existing cycle alerts are wiped on upgrade the ops team loses the warning.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test -- monitoring
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, monitoringIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("monitoring");

interface Alert {
  id: string;
  severity: { Critical?: null } | { Warning?: null } | { Info?: null };
  category: { Cycles?: null } | { ErrorRate?: null } | { Stale?: null };
  canisterId: [] | [object];
  message: string;
  resolved: boolean;
  createdAt: bigint;
  resolvedAt: [] | [bigint];
}

interface Metrics {
  totalCanisters: bigint;
  activeAlerts: bigint;
  criticalAlerts: bigint;
  isPaused: boolean;
}

interface MonitoringActor {
  addAdmin:              (p: object) => Promise<{ ok: null } | { err: object }>;
  recordCanisterMetrics: (
    canisterId: object,
    cyclesBalance: bigint,
    cyclesBurned: bigint,
    memoryBytes: bigint,
    memoryCapacity: bigint,
    requestCount: bigint,
    errorCount: bigint,
    avgResponseTimeMs: bigint,
  ) => Promise<void>;
  getActiveAlerts:        () => Promise<Alert[]>;
  getCriticalCycleAlerts: () => Promise<Alert[]>;
  resolveAlert:           (id: string) => Promise<boolean>;
  getMetrics:             () => Promise<Metrics>;
}

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

// 3T cycles — below the 5T criticalCyclesT threshold defined in main.mo
const CRITICAL_BALANCE = 3_000_000_000_000n;
// 8T cycles — below the 10T warningCyclesT threshold
const WARNING_BALANCE  = 8_000_000_000_000n;
// Healthy — above all thresholds
const HEALTHY_BALANCE  = 20_000_000_000_000n;

describe("monitoring canister — upgrade persistence", () => {
  let pic: PocketIc;
  let actor: MonitoringActor;
  let canisterId: import("@dfinity/principal").Principal;
  let fakeCanisterId: import("@dfinity/principal").Principal;

  beforeAll(async () => {
    pic = await createPic();

    const admin = createIdentity("monitoring-admin");
    fakeCanisterId = createIdentity("fake-canister").getPrincipal();

    const fixture = await pic.setupCanister<MonitoringActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: monitoringIdlFactory as any,
      wasm: WASM,
      sender: admin.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(admin);

    // Bootstrap admin
    ok(await actor.addAdmin(admin.getPrincipal()));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  // ── 1. Critical cycle alert fires and survives upgrade ──────────────────────

  it("critical cycle alert fires when balance is below 5T threshold", async () => {
    await actor.recordCanisterMetrics(
      fakeCanisterId,
      CRITICAL_BALANCE, 0n, 0n, 0n, 0n, 0n, 0n,
    );

    const alerts = await actor.getCriticalCycleAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((a) => "Critical" in a.severity)).toBe(true);
  });

  it("critical cycle alert is preserved across canister upgrade", async () => {
    const before = await actor.getCriticalCycleAlerts();
    expect(before.length).toBeGreaterThan(0);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getCriticalCycleAlerts();
    expect(after.length).toBe(before.length);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].message).toBe(before[0].message);
    expect("Critical" in after[0].severity).toBe(true);
  });

  // ── 2. Warning cycle alert fires and survives upgrade ───────────────────────

  it("warning cycle alert fires when balance is below 10T threshold", async () => {
    const warnCanister = createIdentity("warn-canister").getPrincipal();
    await actor.recordCanisterMetrics(
      warnCanister,
      WARNING_BALANCE, 0n, 0n, 0n, 0n, 0n, 0n,
    );

    const alerts = await actor.getActiveAlerts();
    const warnings = alerts.filter((a) => "Warning" in a.severity && "Cycles" in a.category);
    expect(warnings.length).toBeGreaterThan(0);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const afterAlerts = await actor.getActiveAlerts();
    const afterWarnings = afterAlerts.filter((a) => "Warning" in a.severity && "Cycles" in a.category);
    expect(afterWarnings.length).toBe(warnings.length);
  });

  // ── 3. Metrics aggregate count survives upgrade ─────────────────────────────

  it("canister metrics count survives upgrade", async () => {
    const before = await actor.getMetrics();

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getMetrics();
    expect(after.totalCanisters).toBe(before.totalCanisters);
    expect(after.activeAlerts).toBe(before.activeAlerts);
    expect(after.criticalAlerts).toBe(before.criticalAlerts);
  });

  // ── 4. Resolved alert stays resolved across upgrade ─────────────────────────

  it("resolving an alert persists across canister upgrade", async () => {
    const alertsBefore = await actor.getCriticalCycleAlerts();
    expect(alertsBefore.length).toBeGreaterThan(0);

    const targetId = alertsBefore[0].id;
    const resolved = await actor.resolveAlert(targetId);
    expect(resolved).toBe(true);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    // The resolved alert should no longer appear in critical alerts
    const alertsAfter = await actor.getCriticalCycleAlerts();
    expect(alertsAfter.every((a) => a.id !== targetId)).toBe(true);
  });

  // ── 5. Healthy canister produces no cycle alert ──────────────────────────────

  it("healthy canister balance produces no cycle alert", async () => {
    const healthyCanister = createIdentity("healthy-canister").getPrincipal();
    await actor.recordCanisterMetrics(
      healthyCanister,
      HEALTHY_BALANCE, 0n, 0n, 0n, 0n, 0n, 0n,
    );

    const alerts = await actor.getCriticalCycleAlerts();
    const healthyAlerts = alerts.filter(
      (a) => a.canisterId.length > 0 &&
              a.canisterId[0]?.toString() === healthyCanister.toString(),
    );
    expect(healthyAlerts.length).toBe(0);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    // Still no alert for the healthy canister after upgrade
    const alertsAfter = await actor.getCriticalCycleAlerts();
    const healthyAfter = alertsAfter.filter(
      (a) => a.canisterId.length > 0 &&
              a.canisterId[0]?.toString() === healthyCanister.toString(),
    );
    expect(healthyAfter.length).toBe(0);
  });
});
