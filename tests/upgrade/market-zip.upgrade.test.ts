/**
 * market: the zip index moves from arrays to sets on upgrade (cycle-drain
 * audit CD-10, 2026-10-31). Scores written by the base build, whose
 * submitScore took caller-supplied jobs and a zip, must still count towards
 * getZipStats after the upgrade, and deleteMyData must drop the caller from
 * the zip without scanning every zip (CD-6).
 *
 * Needs the base build in .dfx/base/ (scripts/ci/build-upgrade-wasms.sh
 * <base-ref> market); skipped without it, since this branch's submitScore
 * no longer takes jobs and a zip.
 *
 * Run: cd tests/upgrade && npx vitest run market-zip.upgrade.test.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { readFileSync } from "fs";
import { createPic, wasmPath, baseWasmPath, tearDownLeftovers } from "./__helpers__/setup";

const base = baseWasmPath("market");

const idl = ({ IDL: I }: any) => {
  const Err = I.Variant({ NotFound: I.Null, NotAuthorized: I.Null, InvalidInput: I.Text });
  const JobSummary = I.Record({
    serviceType: I.Text,
    completedYear: I.Nat,
    amountCents: I.Nat,
    isDiy: I.Bool,
    isVerified: I.Bool,
  });
  const Stored = I.Record({ score: I.Nat, zipCode: I.Text, updatedAt: I.Int });
  const ZipStats = I.Record({ zipCode: I.Text, mean: I.Nat, median: I.Nat, sampleSize: I.Nat, grade: I.Text });
  return I.Service({
    // The base build's signature.
    submitScore: I.Func([I.Vec(JobSummary), I.Nat, I.Text], [I.Variant({ ok: Stored, err: Err })], []),
    getZipStats: I.Func([I.Text], [I.Variant({ ok: ZipStats, err: Err })], ["query"]),
    deleteMyData: I.Func([], [I.Variant({ ok: I.Nat, err: Err })], []),
  });
};

const JOBS = [{ serviceType: "HVAC", completedYear: 2023n, amountCents: 250_000n, isDiy: false, isVerified: true }];

describe.skipIf(!base)("market: zip index upgrade", () => {
  afterEach(tearDownLeftovers);

  it("keeps zip stats across the move to sets, and deletion leaves the zip", async () => {
    const pic: PocketIc = await createPic();
    const f = await pic.setupCanister({ idlFactory: idl, wasm: base! });
    const as = (id: Identity) => {
      const a = pic.createActor<any>(idl, f.canisterId);
      a.setIdentity(id);
      return a;
    };

    const homeowners = [0, 1, 2, 3, 4, 5].map((i) => createIdentity(`mz-${i}`));
    for (const [i, h] of homeowners.entries()) {
      const r = await as(h).submitScore(JOBS, BigInt(1990 + i), i < 5 ? "32801" : "32803");
      expect(r).toHaveProperty("ok");
    }
    // One homeowner moves zip on the base build, so the old array had a removal.
    expect(await as(homeowners[5]).submitScore(JOBS, 1995n, "32801")).toHaveProperty("ok");
    const before = (await as(homeowners[0]).getZipStats("32801")).ok;
    expect(Number(before.sampleSize)).toBe(6);

    await pic.upgradeCanister({ canisterId: f.canisterId, wasm: readFileSync(wasmPath("market")) });

    const after = (await as(homeowners[0]).getZipStats("32801")).ok;
    expect(Number(after.sampleSize)).toBe(6);
    expect(after.mean).toBe(before.mean);
    expect(await as(homeowners[0]).getZipStats("32803")).toEqual({ err: { NotFound: null } });

    // Deleting two drops the zip below the k-anonymity floor of 5.
    expect(await as(homeowners[0]).deleteMyData()).toEqual({ ok: 1n });
    expect(await as(homeowners[1]).deleteMyData()).toEqual({ ok: 1n });
    expect(await as(homeowners[1]).deleteMyData()).toEqual({ ok: 0n });
    expect(await as(homeowners[2]).getZipStats("32801")).toEqual({ err: { NotFound: null } });

    // A second upgrade finds nothing left to move and changes nothing.
    await pic.upgradeCanister({ canisterId: f.canisterId, wasm: readFileSync(wasmPath("market")) });
    expect(await as(createIdentity("mz-stranger")).deleteMyData()).toEqual({ ok: 0n });
    await pic.tearDown();
  }, 180_000);
});
