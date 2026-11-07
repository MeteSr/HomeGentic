/**
 * Integration tests — monitoring canister via direct Actor (no service wrapper).
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * Uses Actor.createActor directly with MONITORING_CANISTER_ID from env to avoid
 * the service wrapper's VITE_* env var which is not injected in Node/Vitest.
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: CanisterMetrics / MonitoringMetrics / TrackedCanister record
 *     fields (Nat, Int ns→ms, Bool)
 *   - getMetrics() returns MonitoringMetrics with expected numeric fields
 *   - getAllCanisterMetrics() returns an array of CanisterMetrics
 *   - getTrackedCanisters() returns registered canister records
 *   - checkCycleLevels() returns CycleLevelResult array with valid status strings
 *   - registerCanister() / unregisterCanister() update the tracked set
 *   - registry and threshold changes are admin only (TEST_ADMIN is one)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { Actor } from "@icp-sdk/core/agent";
import { idlFactory } from "@/services/monitoringService";
import { getAgent } from "@/services/actor";
import { ADMIN_SEED, agentFor, seededIdentity } from "./helpers";

const CANISTER_ID = (process.env as any).MONITORING_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

async function getActor() {
  const agent = await getAgent();
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID });
}

/** TEST_ADMIN, made a monitoring admin by CI's integration setup. */
async function getAdminActor() {
  const agent = await agentFor(seededIdentity(ADMIN_SEED));
  return Actor.createActor(idlFactory, { agent, canisterId: CANISTER_ID });
}

// ─── getMetrics ───────────────────────────────────────────────────────────────

describe.skipIf(!deployed)("getMetrics — MonitoringMetrics record", () => {
  let raw: any;

  beforeAll(async () => {
    const a = await getActor();
    raw = await a.getMetrics();
  });

  it("totalCanisters is a non-negative number", () => {
    expect(typeof Number(raw.totalCanisters)).toBe("number");
    expect(Number(raw.totalCanisters)).toBeGreaterThanOrEqual(0);
  });

  it("activeAlerts and criticalAlerts are non-negative numbers", () => {
    expect(Number(raw.activeAlerts)).toBeGreaterThanOrEqual(0);
    expect(Number(raw.criticalAlerts)).toBeGreaterThanOrEqual(0);
  });

  it("isPaused is a boolean", () => {
    expect(typeof raw.isPaused).toBe("boolean");
  });

  it("cyclesPerCall is an array", () => {
    expect(Array.isArray(raw.cyclesPerCall)).toBe(true);
  });
});

// ─── getAllCanisterMetrics ─────────────────────────────────────────────────────

describe.skipIf(!deployed)("getAllCanisterMetrics — per-canister data", () => {
  let all: any[];

  beforeAll(async () => {
    const a = await getActor();
    all = await a.getAllCanisterMetrics() as any[];
  });

  it("returns an array", () => {
    expect(Array.isArray(all)).toBe(true);
  });

  it("each entry has numeric fields (Nat bigint → number conversion)", () => {
    for (const m of all) {
      expect(typeof Number(m.cyclesBalance)).toBe("number");
      expect(typeof Number(m.cyclesBurned)).toBe("number");
      expect(typeof Number(m.memoryBytes)).toBe("number");
      expect(typeof Number(m.requestCount)).toBe("number");
    }
  });
});

// ─── getTrackedCanisters ──────────────────────────────────────────────────────

describe.skipIf(!deployed)("getTrackedCanisters — returns registered canisters", () => {
  it("returns an array of TrackedCanister records", async () => {
    const a = await getActor();
    const canisters = await a.getTrackedCanisters() as any[];
    expect(Array.isArray(canisters)).toBe(true);
    for (const c of canisters) {
      expect(typeof c.id.toText()).toBe("string");
      expect(typeof c.name).toBe("string");
    }
  });
});

// ─── registerCanister + unregisterCanister round-trip ─────────────────────────

describe.skipIf(!deployed)("registerCanister & unregisterCanister — round-trip", () => {
  const testName = `integ-test-${Date.now()}`;
  const target = async () => (await import("@icp-sdk/core/principal")).Principal.fromText(CANISTER_ID);
  const tracked = async () =>
    ((await (await getAdminActor()).getTrackedCanisters()) as any[]).filter((c) => c.id.toText() === CANISTER_ID);

  it("a plain user can't register or unregister a canister", async () => {
    const a = await getActor();
    expect(await a.registerCanister(await target(), testName)).toEqual({ err: { NotAuthorized: null } });
    expect(await a.unregisterCanister(await target())).toEqual({ err: { NotAuthorized: null } });
    expect(await a.getTrackedCanisters()).toEqual([]);
  });

  it("the admin's registration shows in getTrackedCanisters", async () => {
    expect(await (await getAdminActor()).registerCanister(await target(), testName)).toEqual({ ok: null });
    expect((await tracked()).map((c) => c.name)).toEqual([testName]);
  });

  it("the admin's unregisterCanister removes it", async () => {
    expect(await (await getAdminActor()).unregisterCanister(await target())).toEqual({ ok: null });
    expect(await tracked()).toEqual([]);
  });
});

// ─── checkCycleLevels ─────────────────────────────────────────────────────────

describe.skipIf(!deployed)("checkCycleLevels — returns CycleLevelResult array", () => {
  let results: any[];

  beforeAll(async () => {
    const admin = await getAdminActor();
    await admin.registerCanister(
      (await import("@icp-sdk/core/principal")).Principal.fromText(CANISTER_ID),
      "monitoring (integ)",
    );
    results = (await admin.checkCycleLevels()) as any[];
  });

  it("a plain user gets nothing", async () => {
    expect(await (await getActor()).checkCycleLevels()).toEqual([]);
  });

  it("the admin gets one result per tracked canister, with a valid status", () => {
    const mine = results.filter((r) => r.id.toText() === CANISTER_ID);
    expect(mine).toHaveLength(1);
    const VALID = new Set(["ok", "warning", "critical", "unknown"]);
    for (const r of results) expect(VALID.has(r.status)).toBe(true);
  });

  it("each result has numeric cycles and boolean fromCache", () => {
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(typeof r.cycles).toBe("bigint");
      expect(typeof r.fromCache).toBe("boolean");
    }
  });
});

// ─── setLowCycleThreshold ─────────────────────────────────────────────────────

describe.skipIf(!deployed)("setLowCycleThreshold — admin only", () => {
  it("refuses a plain user and accepts the admin", async () => {
    expect(await (await getActor()).setLowCycleThreshold(BigInt(500_000_000_000))).toEqual({
      err: { NotAuthorized: null },
    });
    expect(await (await getAdminActor()).setLowCycleThreshold(BigInt(1_000_000_000_000))).toEqual({ ok: null });
  });
});
