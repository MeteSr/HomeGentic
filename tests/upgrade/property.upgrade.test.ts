/**
 * Property canister — upgrade persistence tests
 *
 * Verifies that property records — including verificationLevel, tier,
 * owner, and address fields — survive a canister upgrade.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, propertyIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("property");

interface PropertyActor {
  addAdmin:         (p: object, nonce: string) => Promise<{ ok: null } | { err: object }>;
  setBootstrapNonce: (nonce: string) => Promise<void>;
  setTier:          (user: object, tier: object) => Promise<{ ok: null } | { err: object }>;
  registerProperty: (args: object) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  verifyProperty:   (id: string, level: object, method: [] | [string]) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getProperty:      (id: string) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getMetrics:       () => Promise<Record<string, bigint | boolean>>;
}

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

describe("property canister — upgrade persistence", () => {
  let pic:        PocketIc;
  let actor:      PropertyActor;
  let canisterId: import("@dfinity/principal").Principal;

  let propertyId: string;

  beforeAll(async () => {
    pic = await createPic();
    const alice = createIdentity("alice");

    const fixture = await pic.setupCanister<PropertyActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: propertyIdlFactory as any,
      wasm: WASM,
      sender: alice.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(alice);

    // Bootstrap alice as first admin (H-20: nonce-gated)
    await actor.setBootstrapNonce("test-nonce");
    ok(await actor.addAdmin(alice.getPrincipal(), "test-nonce"));
    // Grant alice Pro tier (allows up to 5 properties)
    ok(await actor.setTier(alice.getPrincipal(), { Pro: null }));

    // Register a property
    const prop: any = ok(await actor.registerProperty({
      address:      "123 Main Street",
      city:         "Austin",
      state:        "TX",
      zipCode:      "78701",
      propertyType: { SingleFamily: null },
      yearBuilt:    BigInt(2000),
      squareFeet:   BigInt(2400),
      tier:         { Pro: null },   // ignored — canister uses its own grant map
    }));
    propertyId = prop.id;

    // Admin directly sets verificationLevel to Basic (no intermediate steps needed)
    ok(await actor.verifyProperty(propertyId, { Basic: null }, []));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("property record survives upgrade", async () => {
    const before: any = ok(await actor.getProperty(propertyId));
    expect(before.id).toBe(propertyId);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after: any = ok(await actor.getProperty(propertyId));
    expect(after.id).toBe(before.id);
  });

  it("verificationLevel Basic is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const prop: any = ok(await actor.getProperty(propertyId));
    expect(Object.keys(prop.verificationLevel)[0]).toBe("Basic");
  });

  it("address fields are preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const prop: any = ok(await actor.getProperty(propertyId));
    expect(prop.address).toBe("123 Main Street");
    expect(prop.city).toBe("Austin");
    expect(prop.state).toBe("TX");
    expect(prop.zipCode).toBe("78701");
  });

  it("propertyType variant is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const prop: any = ok(await actor.getProperty(propertyId));
    expect(Object.keys(prop.propertyType)[0]).toBe("SingleFamily");
  });

  it("tier is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const prop: any = ok(await actor.getProperty(propertyId));
    expect(Object.keys(prop.tier)[0]).toBe("Pro");
  });

  it("yearBuilt and squareFeet are preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const prop: any = ok(await actor.getProperty(propertyId));
    expect(Number(prop.yearBuilt)).toBe(2000);
    expect(Number(prop.squareFeet)).toBe(2400);
  });

  it("createdAt is unchanged after upgrade", async () => {
    const before: any = ok(await actor.getProperty(propertyId));
    const createdAt = before.createdAt;

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after: any = ok(await actor.getProperty(propertyId));
    expect(after.createdAt).toBe(createdAt);
  });

  it("metrics are preserved across upgrade", async () => {
    const before = await actor.getMetrics();
    expect(Number(before.totalProperties)).toBe(1);
    expect(Number(before.verifiedProperties)).toBe(1);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getMetrics();
    expect(Number(after.totalProperties)).toBe(Number(before.totalProperties));
    expect(Number(after.verifiedProperties)).toBe(Number(before.verifiedProperties));
  });
});
