/**
 * Scaling — a user's own list calls must not get dearer as the canister fills
 * up with other users' records.
 *
 * Each case writes a few target records, measures the cycles one call about
 * them burns, adds thousands of unrelated records, and measures the same call
 * again. With secondary indexes the cost stays about flat; a full scan grows
 * with the canister's total size and fails the check.
 *
 * When base Wasm is present (.dfx/base/, built by
 * scripts/ci/build-upgrade-wasms.sh) the same cases run against it too and
 * the numbers are printed side by side, so a reviewer can see the difference.
 * Only this branch's numbers are asserted.
 */

import { describe, it, expect, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";
import { createPic, wasmPath, baseWasmPath } from "./__helpers__/setup";

/** Records written by other users between the two measurements. */
const NOISE = 2_000;
/** Allowed cost growth for the target call after NOISE unrelated records. */
const MAX_GROWTH = 1.5;
const TIMEOUT = 300_000;

type Build = "head" | "base";
const builds: Build[] = baseWasmPath("job") ? ["head", "base"] : ["head"];
const wasmFor = (name: string, b: Build) => (b === "head" ? wasmPath(name) : baseWasmPath(name)!);

const results: string[] = [];
afterAll(() => { if (results.length) console.log("\nCycles per call, before → after " + NOISE + " unrelated records\n" + results.join("\n")); });

async function install(name: string, b: Build, idl: any) {
  const pic: PocketIc = await createPic();
  const f = await pic.setupCanister({ idlFactory: idl, wasm: wasmFor(name, b) });
  const as = (id: Identity) => { const a = pic.createActor<any>(idl, f.canisterId); a.setIdentity(id); return a; };
  const cost = async (call: () => Promise<unknown>) => {
    const before = await pic.getCyclesBalance(f.canisterId);
    await call();
    return before - (await pic.getCyclesBalance(f.canisterId));
  };
  return { pic, id: f.canisterId as Principal, as, cost };
}

/** Runs `n` writes, a batch at a time. */
async function fill(n: number, write: (i: number) => Promise<unknown>) {
  for (let i = 0; i < n; i += 25) {
    await Promise.all(Array.from({ length: Math.min(25, n - i) }, (_, k) => write(i + k)));
  }
}

function check(label: string, b: Build, beforeCycles: bigint, afterCycles: bigint) {
  const before = Number(beforeCycles), after = Number(afterCycles);
  const growth = after / before;
  results.push(`  ${b.padEnd(4)} ${label.padEnd(36)} ${before.toLocaleString().padStart(12)} → ${after.toLocaleString().padStart(12)}  (×${growth.toFixed(2)})`);
  if (b === "head") expect(growth, `${label} grew ×${growth.toFixed(2)}`).toBeLessThan(MAX_GROWTH);
}

const ADMIN_IDL = (I: any) => ({
  setBootstrapNonce: I.Func([I.Text], [], []),
  addAdmin: I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: I.Reserved })], []),
});

async function bootstrapAdmin(a: any, admin: Identity) {
  await a.setBootstrapNonce("n");
  await a.addAdmin(admin.getPrincipal(), "n");
}

describe("scaling: per-user calls stay flat as the canister grows", () => {
  for (const b of builds) {
    it(`job: jobs for one property (${b})`, async () => {
      const idl = ({ IDL: I }: any) => I.Service({
        ...ADMIN_IDL(I),
        createJob: I.Func([I.Text, I.Text, I.Variant({ HVAC: I.Null }), I.Text, I.Opt(I.Text), I.Nat, I.Int,
          I.Opt(I.Text), I.Opt(I.Nat), I.Bool, I.Opt(I.Text)], [I.Variant({ ok: I.Record({ id: I.Text }), err: I.Reserved })], []),
        getJobsForProperty: I.Func([I.Text], [I.Variant({ ok: I.Vec(I.Record({ id: I.Text })), err: I.Reserved })], []),
      });
      const t = await install("job", b, idl);
      const ADM = createIdentity("ADM");
      const a = t.as(ADM);
      await bootstrapAdmin(a, ADM);
      const create = (prop: string, i: number) => a.createJob(prop, `t${i}`, { HVAC: null }, "d", [], 0n, 0n, [], [], true, []);
      for (let i = 0; i < 3; i++) expect("ok" in await create("P_TARGET", i)).toBe(true);

      const read = async () => {
        const r = await a.getJobsForProperty("P_TARGET");
        expect(r.ok).toHaveLength(3);
      };
      const before = await t.cost(read);
      await fill(NOISE, (i) => create(`P_${i % 200}`, i));
      check("getJobsForProperty", b, before, await t.cost(read));
      await t.pic.tearDown();
    }, TIMEOUT);

    it(`photo: list and upload for one job (${b})`, async () => {
      const idl = ({ IDL: I }: any) => I.Service({
        ...ADMIN_IDL(I),
        uploadPhoto: I.Func([I.Text, I.Text, I.Variant({ Framing: I.Null }), I.Text, I.Text, I.Vec(I.Nat8)],
          [I.Variant({ ok: I.Record({ id: I.Text }), err: I.Reserved })], []),
        getPhotosByJob: I.Func([I.Text], [I.Vec(I.Record({ id: I.Text }))], []),
      });
      const t = await install("photo", b, idl);
      const ADM = createIdentity("ADM");
      const a = t.as(ADM);
      await bootstrapAdmin(a, ADM);
      const hash = (n: number) => n.toString(16).padStart(64, "0");
      // Uploads are limited to 10 a minute, admins included.
      let slots = 10;
      const upload = async (job: string, prop: string, n: number) => {
        if (slots === 0) { await t.pic.advanceTime(61_000); await t.pic.tick(); slots = 10; }
        slots--;
        const r = await a.uploadPhoto(job, prop, { Framing: null }, "d", hash(n), [n % 256]);
        expect("ok" in r, JSON.stringify(r)).toBe(true);
      };
      for (let i = 0; i < 3; i++) await upload("JOB_T", "PROP_T", i);

      const list = async () => expect(await a.getPhotosByJob("JOB_T")).toHaveLength(3);
      let fresh = 1_000_000;
      const uploadOne = () => upload(`JOB_U${fresh}`, `PROP_U${fresh}`, fresh++);
      const listBefore = await t.cost(list), uploadBefore = await t.cost(uploadOne);

      // Each photo on its own job and property, so no quota is reached.
      for (let i = 0; i < NOISE; i++) await upload(`JOB_${i}`, `PROP_${i}`, 10 + i);
      await t.pic.advanceTime(61_000); await t.pic.tick(); slots = 10;   // outside the measured call

      check("getPhotosByJob", b, listBefore, await t.cost(list));
      check("uploadPhoto (per-job/property quota)", b, uploadBefore, await t.cost(uploadOne));
      await t.pic.tearDown();
    }, TIMEOUT);

    it(`sensor: latest events for one property (${b})`, async () => {
      const Ev = (I: any) => I.Record({ id: I.Text });
      const idl = ({ IDL: I }: any) => I.Service({
        ...ADMIN_IDL(I),
        registerDevice: I.Func([I.Text, I.Text, I.Variant({ Nest: I.Null }), I.Text], [I.Variant({ ok: I.Record({ id: I.Text }), err: I.Reserved })], []),
        recordEvent: I.Func([I.Text, I.Variant({ HighHumidity: I.Null }), I.Float64, I.Text, I.Text], [I.Variant({ ok: Ev(I), err: I.Reserved })], []),
        getEventsForProperty: I.Func([I.Text, I.Nat], [I.Vec(Ev(I))], []),
      });
      const t = await install("sensor", b, idl);
      const ADM = createIdentity("ADM");
      const a = t.as(ADM);
      await bootstrapAdmin(a, ADM);
      await a.registerDevice("PROP_T", "ext-t", { Nest: null }, "T");
      for (let i = 0; i < 20; i++) await a.registerDevice(`PROP_${i}`, `ext-${i}`, { Nest: null }, `D${i}`);
      for (let i = 0; i < 3; i++) expect("ok" in await a.recordEvent("ext-t", { HighHumidity: null }, 70, "%", "")).toBe(true);

      const read = async () => expect(await a.getEventsForProperty("PROP_T", 10n)).toHaveLength(3);
      const before = await t.cost(read);
      await fill(NOISE, (i) => a.recordEvent(`ext-${i % 20}`, { HighHumidity: null }, 70, "%", ""));
      check("getEventsForProperty", b, before, await t.cost(read));
      await t.pic.tearDown();
    }, TIMEOUT);
  }
});
