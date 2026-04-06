/**
 * Auth canister — upgrade persistence tests
 *
 * Verifies that Enhanced Orthogonal Persistence (EOP) works correctly for the
 * auth canister: user profiles, login timestamps, and aggregate counts all
 * survive a canister upgrade to the same or a new Wasm binary.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, authIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("auth");

// ── Typed actor interface (subset used in tests) ──────────────────────────────

interface AuthActor {
  register:     (args: { role: object; email: string; phone: string }) => Promise<{ ok: object } | { err: object }>;
  getProfile:   () => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  recordLogin:  () => Promise<void>;
  getUserStats: () => Promise<Record<string, bigint>>;
  getMetrics:   () => Promise<Record<string, bigint | boolean>>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe("auth canister — upgrade persistence", () => {
  let pic:      PocketIc;
  let actor:    AuthActor;
  let canisterId: import("@dfinity/principal").Principal;

  beforeAll(async () => {
    pic = await createPic();

    const alice = createIdentity("alice");
    const fixture = await pic.setupCanister<AuthActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: authIdlFactory as any,
      wasm: WASM,
      sender: alice.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(alice);
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  // ── 1. Basic state survival ─────────────────────────────────────────────────

  it("user profile survives upgrade", async () => {
    await actor.register({ role: { Homeowner: null }, email: "alice@example.com", phone: "555-0100" });
    const before = ok(await actor.getProfile()) as any;

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = ok(await actor.getProfile()) as any;
    expect(after.email).toBe(before.email);
    expect(after.phone).toBe(before.phone);
    expect(Object.keys(after.role)[0]).toBe(Object.keys(before.role)[0]);
    expect(after.createdAt).toBe(before.createdAt);
  });

  // ── 2. Login timestamp survival ─────────────────────────────────────────────

  it("lastLoggedIn timestamp survives upgrade", async () => {
    await actor.recordLogin();
    const before = ok(await actor.getProfile()) as any;
    // lastLoggedIn is opt int — should now be [<bigint>]
    expect(before.lastLoggedIn.length).toBe(1);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = ok(await actor.getProfile()) as any;
    expect(after.lastLoggedIn).toEqual(before.lastLoggedIn);
  });

  // ── 3. Aggregate count invariants ───────────────────────────────────────────

  it("getUserStats total is preserved across upgrade", async () => {
    const before = await actor.getUserStats();
    const totalBefore = Number(before.total);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getUserStats();
    expect(Number(after.total)).toBe(totalBefore);
  });

  it("getMetrics homeowner count matches getUserStats homeowners", async () => {
    const stats   = await actor.getUserStats();
    const metrics = await actor.getMetrics();
    expect(Number(stats.homeowners)).toBe(Number(metrics.homeowners));
    expect(Number(stats.total)).toBe(Number(metrics.totalUsers));
  });

  // ── 4. Multiple upgrades ─────────────────────────────────────────────────────

  it("data is intact after three successive upgrades", async () => {
    const before = ok(await actor.getProfile()) as any;

    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = ok(await actor.getProfile()) as any;
    expect(after.email).toBe(before.email);
    expect(after.isActive).toBe(before.isActive);
  });
});
