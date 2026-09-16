/**
 * Contractor canister — upgrade persistence tests
 *
 * Verifies that contractor profiles, reviews, isVerified flag, and
 * trustScore survive a canister upgrade.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, contractorIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("contractor");

interface ContractorActor {
  addAdmin:                (p: object, nonce: string) => Promise<{ ok: null } | { err: object }>;
  setBootstrapNonce:       (nonce: string) => Promise<void>;
  register:                (args: object) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  submitReview:            (contractorPrincipal: object, rating: bigint, comment: string, jobId: string) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  verifyContractor:        (c: object) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getContractor:           (c: object) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getReviewsForContractor: (c: object) => Promise<Record<string, unknown>[]>;
  getMetrics:              () => Promise<Record<string, bigint | boolean>>;
}

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

describe("contractor canister — upgrade persistence", () => {
  let pic:        PocketIc;
  let actor:      ContractorActor;
  let canisterId: import("@dfinity/principal").Principal;

  const charlie = createIdentity("charlie");
  const alice   = createIdentity("alice");
  const bob     = createIdentity("bob");

  beforeAll(async () => {
    pic = await createPic();

    const fixture = await pic.setupCanister<ContractorActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: contractorIdlFactory as any,
      wasm: WASM,
      sender: alice.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(alice);

    // Bootstrap alice as first admin (H-20: nonce-gated)
    await actor.setBootstrapNonce("test-nonce");
    ok(await actor.addAdmin(alice.getPrincipal(), "test-nonce"));

    // Charlie registers as a contractor
    actor.setIdentity(charlie);
    ok(await actor.register({
      name:        "Charlie's Roofing",
      specialties: [{ Roofing: null }, { Gutters: null }],
      email:       "charlie@roofingpro.example",
      phone:       "+12125550101",
    }));

    // Alice submits a review for charlie (job JOB_001)
    actor.setIdentity(alice);
    ok(await actor.submitReview(charlie.getPrincipal(), BigInt(5), "Great work, on time.", "JOB_001"));

    // Bob submits a second review for charlie (different jobId)
    actor.setIdentity(bob);
    ok(await actor.submitReview(charlie.getPrincipal(), BigInt(4), "Good quality, minor cleanup needed.", "JOB_002"));

    // Alice verifies charlie (admin only)
    actor.setIdentity(alice);
    ok(await actor.verifyContractor(charlie.getPrincipal()));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("contractor profile survives upgrade", async () => {
    const before: any = ok(await actor.getContractor(charlie.getPrincipal()));
    expect(before.name).toBe("Charlie's Roofing");

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after: any = ok(await actor.getContractor(charlie.getPrincipal()));
    expect(after.name).toBe(before.name);
  });

  it("isVerified flag is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const profile: any = ok(await actor.getContractor(charlie.getPrincipal()));
    expect(profile.isVerified).toBe(true);
  });

  it("specialties array is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const profile: any = ok(await actor.getContractor(charlie.getPrincipal()));
    const specs = profile.specialties.map((s: any) => Object.keys(s)[0]).sort();
    expect(specs).toContain("Roofing");
    expect(specs).toContain("Gutters");
    expect(specs.length).toBe(2);
  });

  it("contact details are preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const profile: any = ok(await actor.getContractor(charlie.getPrincipal()));
    expect(profile.email).toBe("charlie@roofingpro.example");
    expect(profile.phone).toBe("+12125550101");
  });

  it("trustScore is preserved across upgrade", async () => {
    const before: any = ok(await actor.getContractor(charlie.getPrincipal()));
    const scoreBefore = Number(before.trustScore);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after: any = ok(await actor.getContractor(charlie.getPrincipal()));
    expect(Number(after.trustScore)).toBe(scoreBefore);
  });

  it("both reviews survive upgrade", async () => {
    const before = await actor.getReviewsForContractor(charlie.getPrincipal());
    expect(before.length).toBe(2);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getReviewsForContractor(charlie.getPrincipal());
    expect(after.length).toBe(2);
  });

  it("review content is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const reviews = await actor.getReviewsForContractor(charlie.getPrincipal());
    const comments = reviews.map((r: any) => r.comment as string);
    expect(comments).toContain("Great work, on time.");
    expect(comments).toContain("Good quality, minor cleanup needed.");
  });

  it("metrics are preserved across upgrade", async () => {
    const before = await actor.getMetrics();
    expect(Number(before.totalContractors)).toBe(1);
    expect(Number(before.verifiedContractors)).toBe(1);
    expect(Number(before.totalReviews)).toBe(2);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getMetrics();
    expect(Number(after.totalContractors)).toBe(Number(before.totalContractors));
    expect(Number(after.verifiedContractors)).toBe(Number(before.verifiedContractors));
    expect(Number(after.totalReviews)).toBe(Number(before.totalReviews));
  });

  it("profile is intact after three successive upgrades", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const profile: any = ok(await actor.getContractor(charlie.getPrincipal()));
    expect(profile.name).toBe("Charlie's Roofing");
    expect(profile.isVerified).toBe(true);

    const reviews = await actor.getReviewsForContractor(charlie.getPrincipal());
    expect(reviews.length).toBe(2);
  });
});
