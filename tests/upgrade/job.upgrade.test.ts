/**
 * Job canister — upgrade persistence tests
 *
 * Verifies that job records — including permitNumber, status transitions,
 * and DIY flag — survive a canister upgrade.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, jobIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("job");

interface JobActor {
  addAdmin:        (p: object, nonce: string) => Promise<{ ok: null } | { err: object }>;
  setBootstrapNonce: (nonce: string) => Promise<void>;
  createJob:       (
    propertyId: string, title: string, serviceType: object, description: string,
    contractorName: [] | [string], amount: bigint, completedDate: bigint,
    permitNumber: [] | [string], warrantyMonths: [] | [bigint],
    isDiy: boolean, sourceQuoteId: [] | [string]
  ) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  updateJobStatus: (jobId: string, status: object) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getJob:          (jobId: string) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getMetrics:      () => Promise<Record<string, bigint | boolean>>;
}

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

describe("job canister — upgrade persistence", () => {
  let pic:        PocketIc;
  let actor:      JobActor;
  let canisterId: import("@dfinity/principal").Principal;

  let jobId: string;

  beforeAll(async () => {
    pic = await createPic();
    const alice = createIdentity("alice");

    const fixture = await pic.setupCanister<JobActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: jobIdlFactory as any,
      wasm: WASM,
      sender: alice.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(alice);

    // Bootstrap alice as first admin (H-20: nonce-gated)
    await actor.setBootstrapNonce("test-nonce");
    ok(await actor.addAdmin(alice.getPrincipal(), "test-nonce"));

    // Create a DIY job with a permit number — completedDate = 0 (epoch, always past)
    const job: any = ok(await actor.createJob(
      "PROP-001",
      "Roof Replacement",
      { Roofing: null },
      "Replaced all shingles with architectural 30-year shingles.",
      [],                       // contractorName (null for DIY)
      BigInt(0),                // amount (0 for DIY)
      BigInt(0),                // completedDate — epoch is safely in the past
      ["PERMIT-2024-001"],      // permitNumber
      [BigInt(24)],             // warrantyMonths
      true,                     // isDiy
      []                        // sourceQuoteId
    ));
    jobId = job.id;

    // Transition status: Pending → InProgress
    ok(await actor.updateJobStatus(jobId, { InProgress: null }));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("job record survives upgrade", async () => {
    const before: any = ok(await actor.getJob(jobId));
    expect(before.id).toBe(jobId);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after: any = ok(await actor.getJob(jobId));
    expect(after.id).toBe(before.id);
  });

  it("permitNumber is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const job: any = ok(await actor.getJob(jobId));
    // permitNumber is Opt(Text) → ["PERMIT-2024-001"] when set
    expect(job.permitNumber).toEqual(["PERMIT-2024-001"]);
  });

  it("status InProgress survives upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const job: any = ok(await actor.getJob(jobId));
    expect(Object.keys(job.status)[0]).toBe("InProgress");
  });

  it("isDiy flag is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const job: any = ok(await actor.getJob(jobId));
    expect(job.isDiy).toBe(true);
  });

  it("warrantyMonths is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const job: any = ok(await actor.getJob(jobId));
    expect(job.warrantyMonths).toEqual([BigInt(24)]);
  });

  it("serviceType variant is preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const job: any = ok(await actor.getJob(jobId));
    expect(Object.keys(job.serviceType)[0]).toBe("Roofing");
  });

  it("metrics counts are preserved across upgrade", async () => {
    const before = await actor.getMetrics();
    expect(Number(before.totalJobs)).toBe(1);
    expect(Number(before.diyJobs)).toBe(1);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getMetrics();
    expect(Number(after.totalJobs)).toBe(Number(before.totalJobs));
    expect(Number(after.diyJobs)).toBe(Number(before.diyJobs));
    expect(after.isPaused).toBe(false);
  });

  it("job record is intact after three successive upgrades", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const job: any = ok(await actor.getJob(jobId));
    expect(job.id).toBe(jobId);
    expect(job.permitNumber).toEqual(["PERMIT-2024-001"]);
    expect(Object.keys(job.status)[0]).toBe("InProgress");
  });
});
