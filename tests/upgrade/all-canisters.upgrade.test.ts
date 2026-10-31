/**
 * Every canister survives an upgrade from the base branch with its data.
 *
 * from-base.upgrade.test.ts checks six canisters in depth with hand-written
 * data. This one covers all twenty generically, so a canister nobody wrote an
 * upgrade test for is still upgraded with state in it:
 *
 *  1. install the base branch's build (what is deployed today) and run its
 *     admin bootstrap;
 *  2. write through every non-destructive update method, as the admin and as
 *     a signed-in user, with plausible arguments (whatever the canister
 *     accepts becomes its state);
 *  3. read every query, as both callers, with the same arguments;
 *  4. upgrade to this branch's build, read again, and compare.
 *
 * Reads go through the base build's interface on both sides, so a field this
 * branch adds to a reply doesn't count as a change.
 *
 * Base Wasm comes from .dfx/base/ (scripts/ci/build-upgrade-wasms.sh). Without
 * it each canister is upgraded to its own build, which still checks that the
 * data survives an upgrade.
 *
 * Run: cd tests/upgrade && npx vitest run all-canisters.upgrade.test.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import { createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { readFileSync } from "fs";
import { createPic, wasmPath, baseWasmPath, tearDownLeftovers, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm, sampleValue } from "./__helpers__/candid";

const CANISTERS = [
  "agent", "ai_proxy", "audit", "auth", "bills", "contractor", "fee", "job", "listing", "maintenance",
  "market", "monitoring", "payment", "photo", "property", "quote", "recurring", "referrals", "report", "sensor",
];

/** Updates that take state away or reconfigure the canister: not seed data. */
const DESTRUCTIVE = /pause|delete|remove|revoke|reset|clear|cancel|resign|deactivate|withdraw|Transfer|BootstrapNonce|CanisterId|initAdmins|addAdmin|retire|purge|prune|wipe/i;

const norm = (x: unknown) => JSON.stringify(x, (_k, v) =>
  typeof v === "bigint" ? v.toString() : (v && v._isPrincipal ? v.toText() : v));

describe("every canister keeps its data across an upgrade", () => {
  afterEach(tearDownLeftovers);
  const seeded: string[] = [];

  it.each(CANISTERS)("%s", async (name) => {
    const base = baseWasmPath(name) ?? wasmPath(name);
    const { idlFactory, initArgs } = serviceFromWasm(base);
    const svc = idlFactory({ IDL });
    const methods = new Map(svc._fields);
    const admin = createIdentity(`upg-admin-${name}`);
    const user  = createIdentity(`upg-user-${name}`);

    const pic = await createPic();
    const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
    const { canisterId } = await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: base, arg });
    const as = (who: Identity) => { const a = pic.createActor<any>((() => svc) as any, canisterId); a.setIdentity(who); return a; };
    const call = async (who: Identity, m: string, args: unknown[]) => {
      try { return { r: await as(who)[m](...args) }; } catch (e) { return { trap: String(e).slice(0, 80) }; }
    };

    if (methods.has("setBootstrapNonce")) await call(CONTROLLER, "setBootstrapNonce", ["n"]);
    const addAdmin = methods.get("addAdmin");
    if (addAdmin) await call(admin, "addAdmin", addAdmin.argTypes.length === 2 ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()]);
    if (methods.has("initAdmins")) await call(admin, "initAdmins", [[admin.getPrincipal()], "n"]);

    const kind = (m: string) => methods.get(m)!.annotations;
    const isQuery = (m: string) => kind(m).includes("query") || kind(m).includes("composite_query");
    const updates = [...methods.keys()].filter((m) => !isQuery(m) && !DESTRUCTIVE.test(m)).sort();
    const queries = [...methods.keys()].filter(isQuery).sort();
    const sample = (m: string, who: Identity) => methods.get(m)!.argTypes.map((t) => sampleValue(t, who.getPrincipal()));

    for (const who of [admin, user]) {
      for (const m of updates) await call(who, m, sample(m, who));
    }

    const read = async () => {
      const out: Record<string, string> = {};
      for (const who of [admin, user]) {
        for (const m of queries) out[`${who === admin ? "admin" : "user"}.${m}`] = norm(await call(who, m, sample(m, who)));
      }
      return out;
    };
    // Reads that change on their own (they include the current time) are
    // left out: read twice, a second apart, and drop what differs.
    const before = await read();
    await pic.advanceTime(1000); await pic.tick();
    const again = await read();
    const stable = Object.keys(before).filter((k) => before[k] === again[k]);

    await pic.upgradeCanister({ canisterId, wasm: readFileSync(wasmPath(name)) });
    await pic.advanceTime(1000); await pic.tick();

    const after = await read();
    if (process.env.DEBUG_UPGRADE) console.log(name, JSON.stringify(before, null, 1));
    const changed = stable.filter((k) => again[k] !== after[k])
      .map((k) => ({ read: k, before: again[k].slice(0, 300), after: after[k].slice(0, 300) }));
    expect(changed).toEqual([]);
    // Note whether the plausible-argument writes stored anything that a read
    // shows; the last test checks that most canisters did.
    if (Object.values(again).some((v) => /"ok":\{|"ok":\[.+\]|\[\{|"[1-9][0-9]*"/.test(v))) seeded.push(name);

    await pic.tearDown();
  }, 180_000);

  // Generic writes can't satisfy every canister's input checks (some need a
  // registered profile or a wired canister first), but they must reach most.
  it("the generic writes stored data in most canisters", () => {
    expect(seeded.length).toBeGreaterThanOrEqual(12);
  });
});
