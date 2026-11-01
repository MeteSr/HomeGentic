/**
 * market: the zip index moves from arrays to sets on upgrade (cycle-drain
 * audit CD-10, 2026-10-31). Scores written by the base build must still count
 * towards getZipStats after the upgrade, and deleteMyData must drop the
 * caller from the zip without scanning every zip (CD-6).
 *
 * property and job are this branch's builds, wired as deploy.sh wires them;
 * only market starts on the base build. Needs .dfx/base/ (CI's
 * scripts/ci/build-upgrade-wasms.sh <base-ref>); skipped without it.
 *
 * Run: cd tests/upgrade && npx vitest run market-zip.upgrade.test.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import { createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { readFileSync } from "fs";
import { createPic, wasmPath, baseWasmPath, tearDownLeftovers, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got ${JSON.stringify(r.err)}`);
  return r.ok;
}

const base = baseWasmPath("market");
const DAY_MS = 24 * 60 * 60 * 1000;
type Name = "property" | "job" | "market";

describe.skipIf(!base)("market: zip index upgrade", () => {
  afterEach(tearDownLeftovers);

  it("keeps zip stats across the move to sets, and deletion leaves the zip", async () => {
    const pic = await createPic();
    const admin = createIdentity("mz-admin");
    const ids = {} as Record<Name, any>;
    const svcs = {} as Record<Name, IDL.ServiceClass>;
    for (const name of ["property", "job", "market"] as Name[]) {
      const wasm = name === "market" ? base! : wasmPath(name);
      const { idlFactory, initArgs } = serviceFromWasm(wasm);
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm, arg })).canisterId;
    }
    const as = (name: Name, who: Identity) => {
      const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
      a.setIdentity(who);
      return a;
    };
    for (const name of ["property", "job", "market"] as Name[]) {
      await as(name, CONTROLLER).setBootstrapNonce("n");
      ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("market", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("market", admin).setJobCanisterId(ids.job.toText()));

    const homeowners = [0, 1, 2, 3, 4, 5].map((i) => createIdentity(`mz-${i}`));
    for (const [i, h] of homeowners.entries()) {
      const prop = ok<any>(
        await as("property", h).registerProperty({
          address: `${20 + i} Palm Court`,
          city: "Orlando",
          state: "FL",
          zipCode: "32801",
          propertyType: { SingleFamily: null },
          yearBuilt: BigInt(1990 + i),
          squareFeet: 1900n,
          tier: { Free: null },
        }),
      ).id;
      const done = BigInt((await pic.getTime()) - DAY_MS * 30) * 1_000_000n;
      ok(
        await as("job", h).createJob(
          prop,
          "New roof",
          { Roofing: null },
          "Roof replaced.",
          [],
          0n,
          done,
          [],
          [],
          true,
          [],
        ),
      );
      ok(await as("market", h).submitScore(prop));
    }
    const before = ok<any>(await as("market", homeowners[0]).getZipStats("32801"));
    expect(Number(before.sampleSize)).toBe(6);

    await pic.upgradeCanister({ canisterId: ids.market, wasm: readFileSync(wasmPath("market")) });
    svcs.market = serviceFromWasm(wasmPath("market")).idlFactory({ IDL });

    const after = ok<any>(await as("market", homeowners[0]).getZipStats("32801"));
    expect(Number(after.sampleSize)).toBe(6);
    expect(after.mean).toBe(before.mean);

    // Deleting two drops the zip below the k-anonymity floor of 5.
    expect(await as("market", homeowners[0]).deleteMyData()).toEqual({ ok: 1n });
    expect(await as("market", homeowners[1]).deleteMyData()).toEqual({ ok: 1n });
    expect(await as("market", homeowners[1]).deleteMyData()).toEqual({ ok: 0n });
    expect(await as("market", homeowners[2]).getZipStats("32801")).toEqual({ err: { NotFound: null } });

    // A second upgrade finds nothing left to move and changes nothing.
    await pic.upgradeCanister({ canisterId: ids.market, wasm: readFileSync(wasmPath("market")) });
    expect(await as("market", createIdentity("mz-stranger")).deleteMyData()).toEqual({ ok: 0n });
    await pic.tearDown();
  }, 180_000);
});
