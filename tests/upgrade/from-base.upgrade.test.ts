/**
 * Upgrade from the base branch to this branch.
 *
 * The other suites upgrade a canister to the same Wasm it already runs. These
 * install the canister built from the PR's base branch (what is deployed
 * today), write data through it, upgrade to this branch's build, and check
 * that the data, the query answers and the limits derived from it still hold.
 * That covers state that changes shape on upgrade (photo bytes, sensor event
 * keys, the audit log, address keys) and the transient indexes rebuilt from
 * stable state when the actor initialises.
 *
 * Base Wasm comes from .dfx/base/ (scripts/ci/build-upgrade-wasms.sh). Without
 * it each case installs this branch's build instead, so the behaviour checks
 * (batched photo bytes, sensor order and retention, address normalisation,
 * index-backed lists) still run; only the change of version is skipped.
 */

import { describe, it, expect, afterEach } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { readFileSync } from "fs";
import { createPic, wasmPath, baseWasmPath, tearDownLeftovers } from "./__helpers__/setup";
import { idlFactory as jobIdl } from "../../packages/shared/src/declarations/job";
import { idlFactory as propIdl } from "../../packages/shared/src/declarations/property";
import { idlFactory as quoteIdl } from "../../packages/shared/src/declarations/quote";

const CANISTERS = ["photo", "sensor", "job", "property", "quote", "audit"];
const haveBase = CANISTERS.every((c) => baseWasmPath(c) !== null);
if (!haveBase) console.warn("No base Wasm in .dfx/base/: installing this branch's build, so no version change is tested.");

/** Installs `name` from the base branch; `upgrade()` moves it to this branch. */
async function fromBase(name: string, idl: any) {
  const pic: PocketIc = await createPic();
  const ctl = createIdentity("ctl");
  const f = await pic.setupCanister({ idlFactory: idl, wasm: baseWasmPath(name) ?? wasmPath(name), sender: ctl.getPrincipal() });
  const as = (id: Identity) => { const a = pic.createActor<any>({ idlFactory: idl, canisterId: f.canisterId }); a.setIdentity(id); return a; };
  const upgrade = () => pic.upgradeCanister({ canisterId: f.canisterId, wasm: readFileSync(wasmPath(name)) });
  /** Makes `admin` an admin: only a controller may open the bootstrap (setBootstrapNonce). */
  const bootstrapAdmin = async (admin: Identity) => {
    await as(ctl).setBootstrapNonce("n");
    await as(admin).addAdmin(admin.getPrincipal(), "n");
  };
  return { pic, as, upgrade, bootstrapAdmin, done: () => pic.tearDown() };
}

/** Adds methods the frontend declarations leave out, reusing their record types. */
const ext = (base: any, extra: (I: any, f: Record<string, any>) => Record<string, any>) => ({ IDL }: any) => {
  const svc = base({ IDL });
  const f = Object.fromEntries(svc._fields);
  return IDL.Service({ ...f, ...extra(IDL, f) });
};

const norm = (x: unknown) => JSON.stringify(x, (_k, v) =>
  typeof v === "bigint" ? v.toString() : (v && v._isPrincipal ? v.toText() : v));

const TIMEOUT = 180_000;

describe(haveBase ? "upgrade from base branch" : "upgrade (no base build: this branch to itself)", () => {
  afterEach(tearDownLeftovers);

  // ── photo: [Nat8] bytes → Blob, per-job / per-property indexes ────────────
  it("photo: bytes, counts and lists survive; reads are batched", async () => {
    const idl = ({ IDL: I }: any) => {
      const Phase = I.Variant({ Framing: I.Null, Listing: I.Null, PostConstruction: I.Null });
      const Err = I.Variant({ NotFound: I.Null, NotAuthorized: I.Null, QuotaExceeded: I.Text, Duplicate: I.Text, InvalidInput: I.Text });
      // Only fields present in both the old Photo and the new PhotoMeta.
      const Meta = I.Record({ id: I.Text, jobId: I.Text, propertyId: I.Text, size: I.Nat });
      const Bytes = I.Vec(I.Nat8);
      return I.Service({
        setBootstrapNonce: I.Func([I.Text], [], []),
        addAdmin: I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Err })], []),
        uploadPhoto: I.Func([I.Text, I.Text, Phase, I.Text, I.Text, Bytes], [I.Variant({ ok: Meta, err: Err })], []),
        getPhotosByJob: I.Func([I.Text], [I.Vec(Meta)], []),
        getPhotosByProperty: I.Func([I.Text], [I.Vec(Meta)], []),
        getPublicListingPhotos: I.Func([I.Text], [I.Vec(Meta)], ["query"]),
        getPhotoData: I.Func([I.Text], [I.Variant({ ok: Bytes, err: Err })], []),
        getPhotoDataBatch: I.Func([I.Vec(I.Text)], [I.Vec(I.Tuple(I.Text, Bytes))], []),
        getListingPhotoDataBatch: I.Func([I.Vec(I.Text)], [I.Vec(I.Tuple(I.Text, Bytes))], ["query"]),
        deletePhoto: I.Func([I.Text], [I.Variant({ ok: I.Null, err: Err })], []),
        getMetrics: I.Func([], [I.Record({ totalPhotos: I.Nat, totalStorageBytes: I.Nat })], ["query"]),
      });
    };
    const t = await fromBase("photo", idl);
    const ADM = createIdentity("ADM");
    const a = t.as(ADM);
    await t.bootstrapAdmin(ADM);
    const hash = (n: number) => n.toString(16).padStart(64, "0");
    const up = (job: string, prop: string, n: number, size = 3) =>
      a.uploadPhoto(job, prop, { Framing: null }, "d", hash(n), Array.from({ length: size }, (_, i) => (n + i) % 256));

    for (let i = 1; i <= 5; i++) await up("JOB_1", "PROP_1", i);   // Free: 5 per job
    await up("JOB_2", "PROP_1", 6);
    await a.uploadPhoto("LISTING_PROP_9", "PROP_9", { Listing: null }, "l", hash(7), [7, 7]);
    await t.pic.advanceTime(61_000);   // clear the 10/min upload limit
    await t.upgrade();

    const job1 = await a.getPhotosByJob("JOB_1");
    expect(job1.map((p: any) => p.id)).toEqual(["PHOTO_1", "PHOTO_2", "PHOTO_3", "PHOTO_4", "PHOTO_5"]);
    expect(await a.getPhotosByProperty("PROP_1")).toHaveLength(6);
    expect(Array.from((await a.getPhotoData("PHOTO_3")).ok)).toEqual([3, 4, 5]);
    expect((await a.getMetrics()).totalPhotos).toBe(7n);

    // The per-job quota counts photos stored before the upgrade.
    const sixth = await up("JOB_1", "PROP_1", 50);
    expect("QuotaExceeded" in sixth.err).toBe(true);

    expect(await a.getPhotoDataBatch(job1.map((p: any) => p.id))).toHaveLength(5);
    expect(await a.getPublicListingPhotos("PROP_9")).toHaveLength(1);
    const listing = await a.getListingPhotoDataBatch(["PHOTO_7", "PHOTO_1"]);
    expect(listing.map(([id]: [string]) => id)).toEqual(["PHOTO_7"]);

    await a.deletePhoto("PHOTO_1");
    expect(await a.getPhotosByJob("JOB_1")).toHaveLength(4);

    // Five 400 KB photos don't fit one reply: the batch stops at the budget.
    for (let i = 0; i < 5; i++) { await t.pic.advanceTime(61_000); await up("JOB_BIG", "PROP_2", 100 + i, 400_000); }
    const big = await a.getPhotosByJob("JOB_BIG");
    expect(big).toHaveLength(5);
    expect(await a.getPhotoDataBatch(big.map((p: any) => p.id))).toHaveLength(3);

    await t.upgrade();
    expect(await a.getPhotosByJob("JOB_BIG")).toHaveLength(5);
    expect(await a.getPhotosByJob("JOB_1")).toHaveLength(4);
    await t.done();
  }, TIMEOUT);

  // ── sensor: text-keyed events → Nat-keyed log, per-property indexes ───────
  it("sensor: events survive, latest N is the newest, retention is capped", async () => {
    const idl = ({ IDL: I }: any) => {
      const Err = I.Variant({ NotFound: I.Null, NotAuthorized: I.Null, InvalidInput: I.Text, AlreadyExists: I.Null });
      const Ev = I.Record({ id: I.Text, propertyId: I.Text });
      return I.Service({
        setBootstrapNonce: I.Func([I.Text], [], []),
        addAdmin: I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Err })], []),
        registerDevice: I.Func([I.Text, I.Text, I.Variant({ Nest: I.Null }), I.Text], [I.Variant({ ok: I.Record({ id: I.Text }), err: Err })], []),
        recordEvent: I.Func([I.Text, I.Variant({ HighHumidity: I.Null }), I.Float64, I.Text, I.Text], [I.Variant({ ok: Ev, err: Err })], []),
        getEventsForProperty: I.Func([I.Text, I.Nat], [I.Vec(Ev)], []),
        getPendingAlerts: I.Func([I.Text], [I.Vec(Ev)], []),
        getDevicesForProperty: I.Func([I.Text], [I.Vec(I.Record({ id: I.Text }))], ["query"]),
        getMetrics: I.Func([], [I.Record({ totalEvents: I.Nat })], ["query"]),
      });
    };
    const t = await fromBase("sensor", idl);
    const ADM = createIdentity("ADM");
    const a = t.as(ADM);
    await t.bootstrapAdmin(ADM);
    await a.registerDevice("PROP_A", "ext-a", { Nest: null }, "A");
    await a.registerDevice("PROP_B", "ext-b", { Nest: null }, "B");
    const record = (ext: string) => a.recordEvent(ext, { HighHumidity: null }, 1, "", "");
    // EVT_1..EVT_12; every 4th goes to PROP_B.
    for (let i = 1; i <= 12; i++) await record(i % 4 === 0 ? "ext-b" : "ext-a");
    await t.upgrade();

    const ids = async (prop: string, n: bigint) => (await a.getEventsForProperty(prop, n)).map((e: any) => e.id);
    // Text keys sorted EVT_10 before EVT_9; the newest three are 9, 10, 11.
    expect(await ids("PROP_A", 3n)).toEqual(["EVT_9", "EVT_10", "EVT_11"]);
    expect(await ids("PROP_A", 0n)).toHaveLength(9);
    expect(await ids("PROP_B", 0n)).toEqual(["EVT_4", "EVT_8", "EVT_12"]);
    expect((await a.getMetrics()).totalEvents).toBe(12n);
    expect(await a.getDevicesForProperty("PROP_A")).toHaveLength(1);
    expect(await a.getPendingAlerts("PROP_A")).toHaveLength(9);

    await record("ext-a");   // EVT_13
    expect(await ids("PROP_A", 2n)).toEqual(["EVT_11", "EVT_13"]);

    // 10 events on PROP_A + 1,000 more → the 10 oldest are pruned.
    for (let i = 0; i < 1000; i++) await record("ext-a");
    const all = await ids("PROP_A", 0n);
    expect([all.length, all[0], all[999]]).toEqual([1000, "EVT_14", "EVT_1013"]);
    expect(await ids("PROP_B", 0n)).toHaveLength(3);

    await t.upgrade();
    expect(await ids("PROP_A", 1n)).toEqual(["EVT_1013"]);
    await t.done();
  }, TIMEOUT);

  // ── job: property / homeowner / contractor indexes ────────────────────────
  it("job: list answers are unchanged and new writes are indexed", async () => {
    const idl = ext(jobIdl, (I, f) => ({
      getJobsByOwner: I.Func([I.Principal], [I.Vec(f.getJobsPendingMySignature.retTypes[0]._type)], ["query"]),
    }));
    const t = await fromBase("job", idl);
    const A = createIdentity("A"), B = createIdentity("B");
    const a = t.as(A), b = t.as(B);
    const create = (actor: any, prop: string, title: string) =>
      actor.createJob(prop, title, { HVAC: null }, "d", [], 0n, 0n, [], [], true, []);
    for (let i = 0; i < 12; i++) expect("ok" in await create(i % 3 ? a : b, `P${i % 2}`, `t${i}`)).toBe(true);

    const snapshot = async () => norm({
      p0: await a.getJobsForProperty("P0"), p1: await b.getJobsForProperty("P1"),
      snapshots: await a.getJobSnapshotsForProperty("P0"),
      ownerA: await a.getJobsByOwner(A.getPrincipal()), ownerB: await b.getJobsByOwner(B.getPrincipal()),
      pending: await a.getJobsPendingMySignature(),
    });
    const before = await snapshot();
    await t.upgrade();
    expect(await snapshot()).toEqual(before);

    expect("ok" in await create(a, "P0", "after")).toBe(true);
    expect((await a.getJobsForProperty("P0")).ok.map((j: any) => j.title)).toContain("after");
    expect(await a.getJobsByOwner(A.getPrincipal())).toHaveLength(9);
    await t.upgrade();
    expect(await a.getJobsByOwner(A.getPrincipal())).toHaveLength(9);
    await t.done();
  }, TIMEOUT);

  // ── property: owner index, normalised address index ───────────────────────
  const propIdlX = ext(propIdl, (I, f) => ({
    getPropertiesByOwner: I.Func([I.Principal], [f.getMyProperties.retTypes[0]], ["query"]),
    setBootstrapNonce: I.Func([I.Text], [], []),
    addAdmin: I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: I.Reserved })], []),
    bulkRegisterProperties: I.Func([I.Vec(f.registerProperty.argTypes[0])],
      [I.Record({ succeeded: I.Vec(I.Text), failed: I.Vec(I.Record({ index: I.Nat, reason: I.Text })) })], []),
  }));
  const row = (address: string) => ({ address, city: "Austin", state: "TX", zipCode: "78701",
    propertyType: { SingleFamily: null }, yearBuilt: 2000n, squareFeet: 1500n, tier: { Free: null } });

  it("property: owner lists and the Free limit hold across the upgrade", async () => {
    const t = await fromBase("property", propIdlX);
    const A = createIdentity("A"), B = createIdentity("B");
    const a = t.as(A), b = t.as(B);
    expect("ok" in await a.registerProperty(row("1 Main St"))).toBe(true);
    expect("ok" in await b.registerProperty(row("2 Main St"))).toBe(true);
    const snapshot = async () => norm({ mine: await a.getMyProperties(), ofB: await b.getPropertiesByOwner(B.getPrincipal()) });
    const before = await snapshot();
    await t.upgrade();
    expect(await snapshot()).toEqual(before);
    // Free allows one property; the count includes the pre-upgrade one.
    expect("err" in await a.registerProperty(row("3 Main St"))).toBe(true);
    expect(await a.getMyProperties()).toHaveLength(1);
    await t.done();
  }, TIMEOUT);

  it("property: bulk import and registration share one normalised address index", async () => {
    const t = await fromBase("property", propIdlX);
    const ADM = createIdentity("ADM"), A = createIdentity("A"), C = createIdentity("C");
    const adm = t.as(ADM), a = t.as(A), c = t.as(C);
    await t.bootstrapAdmin(ADM);
    expect("ok" in await a.registerProperty(row("9 Pine St"))).toBe(true);
    await t.upgrade();

    // A case/whitespace variant of an address registered before the upgrade.
    expect(norm(await c.registerProperty(row("9  PINE st")))).toContain("AddressConflict");
    // Bulk import catches duplicates in the batch and against registrations…
    const bulk = await adm.bulkRegisterProperties([row("7 Elm Rd"), row("7 elm rd"), row("9 pine st")]);
    expect(norm(bulk.failed)).toEqual(norm([{ index: 1n, reason: "DuplicateAddress" }, { index: 2n, reason: "DuplicateAddress" }]));
    // …and registration sees what bulk import wrote.
    expect(norm(await c.registerProperty(row("7 ELM RD")))).toContain("AddressConflict");
    await t.done();
  }, TIMEOUT);

  // ── quote: request / quote indexes ─────────────────────────────────────────
  it("quote: open-request limit, lists and accept flow", async () => {
    const t = await fromBase("quote", quoteIdl);
    const H = createIdentity("H"), C1 = createIdentity("C1"), C2 = createIdentity("C2");
    const h = t.as(H), c1 = t.as(C1), c2 = t.as(C2);
    const request = () => h.createQuoteRequest("PROP_1", { HVAC: null }, "fix", { Medium: null }, [], [], [], [], []);
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) { const r = await request(); expect("ok" in r).toBe(true); ids.push(r.ok.id); }
    const validUntil = BigInt(Math.floor(await t.pic.getTime()) + 86_400_000) * 1_000_000n;
    const q1 = await c1.submitQuote(ids[0], 100n, 5n, validUntil);
    const q2 = await c2.submitQuote(ids[0], 120n, 5n, validUntil);
    expect("ok" in q1 && "ok" in q2).toBe(true);

    const snapshot = async () => norm({
      mine: await h.getMyQuoteRequests(), open: await h.getOpenRequests(),
      page: await h.getOpenRequestsPage(1n, 5n), quotes: await h.getQuotesForRequest(ids[0]), c1: await c1.getMyQuotes(),
    });
    const before = await snapshot();
    await t.upgrade();
    expect(await snapshot()).toEqual(before);

    // Free allows 3 #Open requests; ids[0] is #Quoted so it doesn't count.
    expect("ok" in await request()).toBe(true);
    expect("err" in await request()).toBe(true);

    expect("ok" in await h.acceptQuote(q1.ok.id)).toBe(true);
    const quotes = (await h.getQuotesForRequest(ids[0])).ok;
    expect(Object.fromEntries(quotes.map((q: any) => [q.id, Object.keys(q.status)[0]])))
      .toEqual({ [q1.ok.id]: "Accepted", [q2.ok.id]: "Rejected" });
    const open = (await h.getOpenRequests()).map((r: any) => r.id);
    expect(open).not.toContain(ids[0]);
    expect(open).toHaveLength(3);
    await t.done();
  }, TIMEOUT);

  // ── audit: array → Nat-keyed map ──────────────────────────────────────────
  it("audit: entries, paging and filters survive", async () => {
    const idl = ({ IDL: I }: any) => {
      const Entry = I.Record({ id: I.Nat, action: I.Text, caller: I.Principal, detail: I.Text });
      const Res = (T: any) => I.Variant({ ok: T, err: I.Reserved });
      return I.Service({
        setBootstrapNonce: I.Func([I.Text], [], []),
        addAdmin: I.Func([I.Principal, I.Text], [Res(I.Null)], []),
        log: I.Func([I.Text, I.Text, I.Opt(I.Principal), I.Text], [Res(I.Nat)], []),
        getEntries: I.Func([I.Nat, I.Nat], [Res(I.Vec(Entry))], []),
        getEntriesByCallerAndAction: I.Func([I.Principal, I.Text], [Res(I.Vec(Entry))], []),
        metrics: I.Func([], [I.Record({ entryCount: I.Nat })], ["query"]),
      });
    };
    const t = await fromBase("audit", idl);
    const ADM = createIdentity("ADM");
    const a = t.as(ADM);
    await t.bootstrapAdmin(ADM);
    for (let i = 0; i < 25; i++) await a.log("c", i % 2 ? "Odd" : "Even", [], `d${i}`);

    const snapshot = async () => norm({
      page: await a.getEntries(5n, 7n), all: await a.getEntries(0n, 100n),
      odd: await a.getEntriesByCallerAndAction(ADM.getPrincipal(), "Odd"), metrics: await a.metrics(),
    });
    const before = await snapshot();
    await t.upgrade();
    expect(await snapshot()).toEqual(before);

    expect((await a.log("c", "New", [], "")).ok).toBe(25n);
    expect((await a.getEntries(25n, 10n)).ok.map((e: any) => e.id)).toEqual([25n]);
    expect((await a.getEntries(26n, 10n)).ok).toEqual([]);
    await t.done();
  }, TIMEOUT);
});
