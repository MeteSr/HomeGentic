/**
 * Permission sweep over every update method of every canister.
 *
 * Each canister's real interface is read from its Wasm (candid:service), so
 * admin methods the shared declarations leave out are covered too. Every
 * update method is called with plausible arguments (principals are the
 * caller's own, to catch a caller granting itself something), once by a
 * signed-in stranger with no role anywhere and once anonymously.
 *
 * The canisters are wired to each other first, as deploy.sh does. A call
 * counts as allowed when it returns `#ok` (or true, or a non-empty value); a
 * method that returns nothing to judge by ((), false, an empty list) and
 * doesn't trap is listed with a trailing "?". The allowed set has to match
 * authz-expectations.json exactly: a new method that forgets its permission
 * check fails here, and so does one that starts refusing. When you add a
 * method that a stranger may legitimately call, add it to the file.
 *
 * Regenerate after a deliberate change: UPDATE_AUTHZ=1 npx vitest run authz-sweep
 *
 * Run: cd tests/upgrade && npx vitest run authz-sweep.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createPic, wasmPath, tearDownLeftovers, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm, sampleValue } from "./__helpers__/candid";

const CANISTERS = [
  "agent", "ai_proxy", "audit", "auth", "bills", "contractor", "fee", "job", "listing", "maintenance",
  "market", "monitoring", "payment", "photo", "property", "quote", "recurring", "referrals", "report", "sensor",
];

const EXPECTATIONS = resolve(__dirname, "authz-expectations.json");
type Allowed = { stranger: string[]; anonymous: string[] };

const admin = createIdentity("authz-admin");

/** Runs the canister's admin bootstrap so the sweep sees a deployed state. */
async function bootstrap(pic: PocketIc, svc: IDL.ServiceClass, cid: any) {
  const methods = new Map(svc._fields);
  const call = async (who: Identity, m: string, args: unknown[]) => {
    if (!methods.has(m)) return;
    const a = pic.createActor<any>((() => svc) as any, cid);
    a.setIdentity(who);
    try { await a[m](...args); } catch { /* best effort */ }
  };
  await call(CONTROLLER, "setBootstrapNonce", ["n"]);
  const addAdmin = methods.get("addAdmin");
  if (addAdmin) await call(admin, "addAdmin", addAdmin.argTypes.length === 2 ? [admin.getPrincipal(), "n"] : [admin.getPrincipal()]);
  if (methods.has("initAdmins")) await call(admin, "initAdmins", [[admin.getPrincipal()], "n"]);
}

/**
 * Points each canister at the others, as deploy.sh does, through its
 * set<Name>CanisterId setters, so permission checks that ask another canister
 * (property's roles, payment's tiers) run for real rather than in their
 * local-dev fallback.
 */
async function wire(pic: PocketIc, svcs: Record<string, IDL.ServiceClass>, ids: Record<string, any>) {
  for (const [name, svc] of Object.entries(svcs)) {
    for (const [m, f] of svc._fields) {
      const target = /^set(.+)CanisterId$/.exec(m)?.[1];
      if (!target || f.argTypes.length !== 1) continue;
      const key = target === "RiskJob" ? "job" : target.replace(/^./, (c) => c.toLowerCase());
      if (!ids[key]) continue;
      const a = pic.createActor<any>((() => svc) as any, ids[name]);
      a.setIdentity(admin);
      const arg = f.argTypes[0] instanceof IDL.TextClass ? ids[key].toText() : ids[key];
      await a[m](arg);
    }
  }
}

/**
 * How a call came back: "refused" (trap, reject or #err), "ok" (#ok, true,
 * or something non-empty), or "silent" (no result to judge: (), false, an
 * empty list or record). Silent methods are listed with a trailing "?".
 */
function classify(r: unknown): "refused" | "ok" | "silent" {
  if (r === undefined || r === null || r === false) return "silent";
  if (r === true) return "ok";
  if (Array.isArray(r)) return r.length > 0 ? "ok" : "silent";
  if (typeof r === "object") {
    if ("err" in (r as object)) return "refused";
    if ("ok" in (r as object)) return "ok";
    const vals = Object.values(r as object);
    return vals.every((v) => v === 0n || v === 0 || v === false || (Array.isArray(v) && v.length === 0)) ? "silent" : "ok";
  }
  return "ok";
}

/** Which update methods `mkCaller()` (a fresh caller per method) gets through. */
async function sweep(pic: PocketIc, svc: IDL.ServiceClass, cid: any, mkCaller: () => Identity): Promise<string[]> {
  const updates = svc._fields
    .filter(([, f]) => !f.annotations.includes("query") && !f.annotations.includes("composite_query"))
    .map(([m]) => m)
    // Pausing first would make every later call fail for the wrong reason.
    .sort((a, b) => Number(/pause/i.test(a)) - Number(/pause/i.test(b)) || a.localeCompare(b));
  const allowed: string[] = [];
  for (const m of updates) {
    const who = mkCaller();
    const f = new Map(svc._fields).get(m)!;
    const args = f.argTypes.map((t) => sampleValue(t, who.getPrincipal()));
    const a = pic.createActor<any>((() => svc) as any, cid);
    a.setIdentity(who);
    let r: unknown;
    try { r = await a[m](...args); } catch { continue; }
    const c = classify(r);
    if (c !== "refused") allowed.push(c === "ok" ? m : `${m}?`);
  }
  return allowed;
}

describe("permission sweep: strangers and anonymous callers", () => {
  let pic: PocketIc;
  const found: Record<string, Allowed> = {};

  beforeAll(async () => {
    pic = await createPic();
    const svcs: Record<string, IDL.ServiceClass> = {};
    const ids: Record<string, any> = {};
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      await bootstrap(pic, svcs[name], ids[name]);
    }
    await wire(pic, svcs, ids);
    let n = 0;
    for (const name of CANISTERS) {
      found[name] = {
        stranger:  await sweep(pic, svcs[name], ids[name], () => createIdentity(`authz-stranger-${++n}`)),
        anonymous: await sweep(pic, svcs[name], ids[name], () => new AnonymousIdentity()),
      };
    }
    if (process.env.UPDATE_AUTHZ) writeFileSync(EXPECTATIONS, JSON.stringify(found, null, 2) + "\n");
  }, 600_000);

  afterAll(async () => { await pic?.tearDown(); await tearDownLeftovers(); });

  const expected: Record<string, Allowed> = existsSync(EXPECTATIONS) ? JSON.parse(readFileSync(EXPECTATIONS, "utf8")) : {};

  it.each(CANISTERS)("%s: strangers and anonymous callers get through only the expected methods", (name) => {
    expect(found[name]).toEqual(expected[name]);
  });

  it("anonymous callers get through nothing", () => {
    const open = Object.entries(found).flatMap(([c, a]) => a.anonymous.map((m) => `${c}.${m}`));
    expect(open).toEqual([]);
  });
});
