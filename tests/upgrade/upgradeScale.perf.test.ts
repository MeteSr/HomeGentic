/**
 * Upgrade cost at scale — an upgrade must fit in one message however much a
 * canister holds.
 *
 * The canisters rebuild their transient indexes from the stored records on
 * every upgrade, so upgrade cost grows with record count, and an upgrade over
 * the instruction limit is rejected (the canister keeps running the old
 * code, and no fix can ship until data is removed). Seeding a realistic
 * volume through the API takes too long for CI, so each case measures the
 * upgrade at two sizes, takes the cost per record from the difference, and
 * projects it to the target count. The fixed part of the upgrade is in both
 * measurements and cancels out.
 *
 * Cycles convert to instructions at 0.4 cycles per instruction, the rate for
 * a 13-node application subnet, which is the subnet PocketIC installs on.
 *
 * Measured 2026-10-28: about 145k instructions per job, 240k per photo record
 * and 49k per sensor event, so one canister reaches the limit at roughly 2M
 * jobs, 1.2M photo records or 6M sensor events. The cost tracks how much
 * heap each record takes (the small sensor events are cheapest), not just
 * the index rebuild. The targets below sit at about half of those, so the test
 * fails well before a real canister would, and when a change makes records
 * dearer to upgrade.
 */

import { describe, it, expect, afterAll, afterEach } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";
import { createPic, wasmPath, CONTROLLER, tearDownLeftovers } from "./__helpers__/setup";

/** Instruction limit for an upgrade (install_code with deterministic time slicing). */
const UPGRADE_LIMIT = 300_000_000_000;
/** Projections must stay under this share of the limit, leaving room for growth in the code. */
const HEADROOM = 0.5;
const CYCLES_PER_INSTRUCTION = 0.4;
const TIMEOUT = 600_000;

const results: string[] = [];
afterAll(() => { if (results.length) console.log("\nUpgrade cost per record, projected\n" + results.join("\n")); });

async function install(name: string, idl: any) {
  const pic: PocketIc = await createPic();
  const wasm = wasmPath(name);
  const f = await pic.setupCanister({ idlFactory: idl, wasm });
  const as = (id: Identity) => { const a = pic.createActor<any>(idl, f.canisterId); a.setIdentity(id); return a; };
  const once = async () => {
    // install_code is rate-limited per canister by the instructions it ran.
    await pic.advanceTime(10 * 60_000);
    await pic.tick();
    const before = await pic.getCyclesBalance(f.canisterId);
    await pic.upgradeCanister({ canisterId: f.canisterId, wasm });
    return before - (await pic.getCyclesBalance(f.canisterId));
  };
  // The first upgrade after a run of writes costs a few billion cycles more,
  // the same amount at any record count, so the second one is measured.
  const upgradeCost = async () => { await once(); return once(); };
  return { pic, id: f.canisterId as Principal, as, upgradeCost };
}

/** Concurrent writes per batch; larger batches have crashed the PocketIC server on CI runners. */
const BATCH = 10;

async function fill(from: number, to: number, write: (i: number) => Promise<unknown>) {
  for (let i = from; i < to; i += BATCH) {
    await Promise.all(Array.from({ length: Math.min(BATCH, to - i) }, (_, k) => write(i + k)));
  }
}

/** Projects the upgrade cost to `target` records and checks it against the limit. */
function check(label: string, target: number, n1: number, c1: bigint, n2: number, c2: bigint) {
  const perRecord = Number(c2 - c1) / (n2 - n1) / CYCLES_PER_INSTRUCTION;
  const fixed = Number(c1) / CYCLES_PER_INSTRUCTION - perRecord * n1;
  const projected = fixed + perRecord * target;
  const fits = Math.floor((UPGRADE_LIMIT - fixed) / perRecord);
  results.push(
    `  ${label.padEnd(16)} ${Math.round(perRecord).toLocaleString().padStart(8)} instr/record  ` +
    `${target.toLocaleString()} records → ${(projected / 1e9).toFixed(1)}B of ${UPGRADE_LIMIT / 1e9}B  ` +
    `(limit reached at ~${fits.toLocaleString()})`
  );
  expect(perRecord, `${label}: upgrade cost should grow with records`).toBeGreaterThan(0);
  expect(projected, `${label}: ${target.toLocaleString()} records would need ${(projected / 1e9).toFixed(1)}B instructions`)
    .toBeLessThan(UPGRADE_LIMIT * HEADROOM);
}

const ADMIN_IDL = (I: any) => ({
  setBootstrapNonce: I.Func([I.Text], [], []),
  addAdmin: I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: I.Reserved })], []),
});

async function bootstrapAdmin(t: { as: (id: Identity) => any }, admin: Identity) {
  await t.as(CONTROLLER).setBootstrapNonce("n");
  await t.as(admin).addAdmin(admin.getPrincipal(), "n");
}

describe("upgrade cost stays under the instruction limit at scale", () => {
  afterEach(tearDownLeftovers);

  it("job: 1,000,000 jobs", async () => {
    const idl = ({ IDL: I }: any) => I.Service({
      ...ADMIN_IDL(I),
      createJob: I.Func([I.Text, I.Text, I.Variant({ HVAC: I.Null }), I.Text, I.Opt(I.Text), I.Nat, I.Int,
        I.Opt(I.Text), I.Opt(I.Nat), I.Bool, I.Opt(I.Text)], [I.Variant({ ok: I.Record({ id: I.Text }), err: I.Reserved })], []),
      getJobsForProperty: I.Func([I.Text], [I.Variant({ ok: I.Vec(I.Record({ id: I.Text })), err: I.Reserved })], []),
    });
    const t = await install("job", idl);
    const ADM = createIdentity("ADM");
    const a = t.as(ADM);
    await bootstrapAdmin(t, ADM);
    const create = async (i: number) => {
      const r = await a.createJob(`P_${i % 500}`, `t${i}`, { HVAC: null }, "description", [], 0n, 0n, [], [], true, []);
      expect("ok" in r, JSON.stringify(r)).toBe(true);
    };
    const [n1, n2] = [500, 2_500];
    await fill(0, n1, create);
    const c1 = await t.upgradeCost();
    await fill(n1, n2, create);
    const c2 = await t.upgradeCost();
    // The indexes came back: one property's jobs are still found after the upgrades.
    expect((await a.getJobsForProperty("P_7")).ok).toHaveLength(n2 / 500);
    check("job", 1_000_000, n1, c1, n2, c2);
    await t.pic.tearDown();
  }, TIMEOUT);

  it("photo: 500,000 photo records", async () => {
    const idl = ({ IDL: I }: any) => I.Service({
      ...ADMIN_IDL(I),
      uploadPhoto: I.Func([I.Text, I.Text, I.Variant({ Framing: I.Null }), I.Text, I.Text, I.Vec(I.Nat8)],
        [I.Variant({ ok: I.Record({ id: I.Text }), err: I.Reserved })], []),
      getPhotosByJob: I.Func([I.Text], [I.Vec(I.Record({ id: I.Text }))], []),
    });
    const t = await install("photo", idl);
    const ADM = createIdentity("ADM");
    const a = t.as(ADM);
    await bootstrapAdmin(t, ADM);
    // Uploads are limited to 10 a minute, admins included. One byte each: once
    // photos are off-chain the canister holds only these records.
    const upload = async (i: number) => {
      if (i > 0 && i % 10 === 0) { await t.pic.advanceTime(61_000); await t.pic.tick(); }
      const r = await a.uploadPhoto(`JOB_${i % 200}`, `PROP_${i}`, { Framing: null }, "d", i.toString(16).padStart(64, "0"), [i % 256]);
      expect("ok" in r, JSON.stringify(r)).toBe(true);
    };
    const [n1, n2] = [100, 600];
    for (let i = 0; i < n1; i++) await upload(i);
    const c1 = await t.upgradeCost();
    for (let i = n1; i < n2; i++) await upload(i);
    const c2 = await t.upgradeCost();
    expect(await a.getPhotosByJob("JOB_7")).toHaveLength(n2 / 200);
    check("photo", 500_000, n1, c1, n2, c2);
    await t.pic.tearDown();
  }, TIMEOUT);

  it("sensor: 2,500,000 events", async () => {
    const Ev = (I: any) => I.Record({ id: I.Text });
    const idl = ({ IDL: I }: any) => I.Service({
      ...ADMIN_IDL(I),
      registerDevice: I.Func([I.Text, I.Text, I.Variant({ Nest: I.Null }), I.Text], [I.Variant({ ok: I.Record({ id: I.Text }), err: I.Reserved })], []),
      recordEvent: I.Func([I.Text, I.Variant({ HighHumidity: I.Null }), I.Float64, I.Text, I.Text], [I.Variant({ ok: Ev(I), err: I.Reserved })], []),
      getEventsForProperty: I.Func([I.Text, I.Nat], [I.Vec(Ev(I))], []),
    });
    const t = await install("sensor", idl);
    const ADM = createIdentity("ADM");
    const a = t.as(ADM);
    await bootstrapAdmin(t, ADM);
    for (let i = 0; i < 20; i++) await a.registerDevice(`PROP_${i}`, `ext-${i}`, { Nest: null }, `D${i}`);
    const record = async (i: number) => {
      const r = await a.recordEvent(`ext-${i % 20}`, { HighHumidity: null }, 70, "%", "");
      expect("ok" in r, JSON.stringify(r)).toBe(true);
    };
    const [n1, n2] = [500, 2_500];
    await fill(0, n1, record);
    const c1 = await t.upgradeCost();
    await fill(n1, n2, record);
    const c2 = await t.upgradeCost();
    expect(await a.getEventsForProperty("PROP_7", 1_000n)).toHaveLength(n2 / 20);
    // Events are capped at 1,000 per property, so 2.5M is about 2,500 homes with busy sensors.
    check("sensor events", 2_500_000, n1, c1, n2, c2);
    await t.pic.tearDown();
  }, TIMEOUT);
});
