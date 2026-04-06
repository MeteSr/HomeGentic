/**
 * Payment canister — upgrade persistence tests
 *
 * Verifies that subscriptions and aggregate stats survive canister upgrades.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, paymentIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("payment");

interface Subscription {
  owner: object;
  tier: Record<string, null>;
  expiresAt: bigint;
  createdAt: bigint;
}

interface PaymentActor {
  subscribe:            (tier: object) => Promise<{ ok: Subscription } | { err: object }>;
  getMySubscription:    () => Promise<{ ok: Subscription } | { err: object }>;
  getSubscriptionStats: () => Promise<{
    total: bigint; free: bigint; pro: bigint; premium: bigint;
    contractorPro: bigint; activePaid: bigint; estimatedMrrUsd: bigint;
  }>;
}

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

describe("payment canister — upgrade persistence", () => {
  let pic: PocketIc;
  let actor: PaymentActor;
  let canisterId: import("@dfinity/principal").Principal;

  beforeAll(async () => {
    pic = await createPic();

    const bob = createIdentity("bob");
    const fixture = await pic.setupCanister<PaymentActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: paymentIdlFactory as any,
      wasm: WASM,
      sender: bob.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(bob);
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  // ── 1. Subscription tier survives upgrade ───────────────────────────────────

  it("Pro subscription survives upgrade", async () => {
    ok(await actor.subscribe({ Pro: null }));
    const before = ok(await actor.getMySubscription());
    expect(Object.keys(before.tier)[0]).toBe("Pro");

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = ok(await actor.getMySubscription());
    expect(Object.keys(after.tier)[0]).toBe("Pro");
    expect(after.expiresAt).toBe(before.expiresAt);
    expect(after.createdAt).toBe(before.createdAt);
  });

  // ── 2. Aggregate stats survive upgrade ──────────────────────────────────────

  it("subscription stats are preserved across upgrade", async () => {
    const before = await actor.getSubscriptionStats();

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getSubscriptionStats();
    expect(after.total).toBe(before.total);
    expect(after.pro).toBe(before.pro);
    expect(after.activePaid).toBe(before.activePaid);
    expect(after.estimatedMrrUsd).toBe(before.estimatedMrrUsd);
  });

  // ── 3. Tier upgrade then canister upgrade ───────────────────────────────────

  it("Premium subscription created after Pro, then canister upgrade preserves Premium", async () => {
    // Overwrite Pro with Premium
    ok(await actor.subscribe({ Premium: null }));

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const sub = ok(await actor.getMySubscription());
    expect(Object.keys(sub.tier)[0]).toBe("Premium");
  });

  // ── 4. Estimated MRR calculation survives ───────────────────────────────────

  it("estimatedMrrUsd is non-zero after paid subscription and survives upgrade", async () => {
    const statsBefore = await actor.getSubscriptionStats();
    expect(Number(statsBefore.estimatedMrrUsd)).toBeGreaterThan(0);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const statsAfter = await actor.getSubscriptionStats();
    expect(statsAfter.estimatedMrrUsd).toBe(statsBefore.estimatedMrrUsd);
  });
});
