/**
 * The job canister keeps its indexes (jobs by property, homeowner and
 * contractor) in stable memory instead of rebuilding them on every upgrade.
 * Stored indexes must stay in step with the jobs through writes, deletes and
 * repeated upgrades, because nothing rebuilds them any more. The first upgrade
 * from a build that kept them transient is covered in from-base.upgrade.test.ts,
 * and the upgrade cost in upgradeScale.perf.test.ts.
 *
 *  SI.1 property and owner lists survive two upgrades unchanged
 *  SI.2 a job written after an upgrade is listed, and survives the next one
 *  SI.3 deleteMyData takes the owner's jobs out of every list, and they stay
 *       out after an upgrade
 *
 * Run: cd tests/upgrade && npx vitest run job-stored-indexes.canister.test.ts
 * (needs .dfx/local/canisters/job/job.wasm)
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath } from "./__helpers__/setup";
import { idlFactory as jobIdl } from "../../packages/shared/src/declarations/job";

const titles = (r: any) => ("ok" in r ? r.ok.map((j: any) => j.title).sort() : r);
const ownerTitles = (jobs: any[]) => jobs.map((j) => j.title).sort();

describe("job canister: stored indexes stay in step across upgrades", () => {
  let pic: PocketIc;
  let canisterId: any;
  let a: any;
  let b: any;
  const alice = createIdentity("si-alice");
  const bob = createIdentity("si-bob");

  const create = (actor: any, prop: string, title: string) =>
    actor.createJob(prop, title, { HVAC: null }, "d", [], 0n, 0n, [], [], true, []);
  const upgrade = () => pic.upgradeCanister({ canisterId, wasm: readFileSync(wasmPath("job")) });

  beforeAll(async () => {
    pic = await createPic();
    const f = await pic.setupCanister({ idlFactory: jobIdl as any, wasm: wasmPath("job") });
    canisterId = f.canisterId;
    a = pic.createActor<any>(jobIdl as any, canisterId);
    a.setIdentity(alice);
    b = pic.createActor<any>(jobIdl as any, canisterId);
    b.setIdentity(bob);
    for (let i = 0; i < 6; i++) expect("ok" in (await create(a, `SI_P${i % 2}`, `a${i}`))).toBe(true);
    for (let i = 0; i < 3; i++) expect("ok" in (await create(b, "SI_P0", `b${i}`))).toBe(true);
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("SI.1 property and owner lists survive two upgrades unchanged", async () => {
    const snapshot = async () => ({
      p0: titles(await a.getJobsForProperty("SI_P0")),
      p1: titles(await a.getJobsForProperty("SI_P1")),
      alice: ownerTitles(await a.getJobsByOwner(alice.getPrincipal())),
      bob: ownerTitles(await b.getJobsByOwner(bob.getPrincipal())),
    });
    const before = await snapshot();
    expect(before.alice).toEqual(["a0", "a1", "a2", "a3", "a4", "a5"]);
    expect(before.bob).toEqual(["b0", "b1", "b2"]);
    await upgrade();
    expect(await snapshot()).toEqual(before);
    await upgrade();
    expect(await snapshot()).toEqual(before);
  });

  it("SI.2 a job written after an upgrade is listed, and survives the next one", async () => {
    expect("ok" in (await create(a, "SI_P1", "after"))).toBe(true);
    expect(titles(await a.getJobsForProperty("SI_P1"))).toContain("after");
    await upgrade();
    expect(titles(await a.getJobsForProperty("SI_P1"))).toContain("after");
    expect(ownerTitles(await a.getJobsByOwner(alice.getPrincipal()))).toHaveLength(7);
  });

  it("SI.3 deleteMyData takes the owner's jobs out of every list, and they stay out after an upgrade", async () => {
    expect("ok" in (await b.deleteMyData())).toBe(true);
    const check = async () => {
      expect(await b.getJobsByOwner(bob.getPrincipal())).toEqual([]);
      const p0 = titles(await a.getJobsForProperty("SI_P0"));
      expect(p0.filter((t: string) => t.startsWith("b"))).toEqual([]);
      expect(p0).toEqual(["a0", "a2", "a4"]);
    };
    await check();
    await upgrade();
    await check();
    // Bob can start again, and his new job is filed under the property.
    expect("ok" in (await create(b, "SI_P0", "b-new"))).toBe(true);
    await upgrade();
    expect(titles(await a.getJobsForProperty("SI_P0"))).toContain("b-new");
  });
});
