/**
 * Cross-tenant sweep: one user's real records, every method, another user.
 *
 * authz-sweep.canister.test.ts calls each method as a stranger with made-up
 * ids, so a method that refuses "not found" passes it without its permission
 * check ever running. Here a homeowner first creates one of everything (a
 * home, a job, a bill, a recurring service with a visit, a maintenance entry,
 * a quote request), then every update and query on every canister is called
 * by a different signed-in Pro user with those ids in each Text argument
 * (and in record fields named like ids).
 *
 *  IDOR.1 what the other user gets back matches idor-expectations.json, so a
 *         new method that hands out someone else's data fails here
 *  IDOR.2 the owner's records are all still there and unchanged afterwards
 *  IDOR.3 bills refuses a bill filed against a property id nobody registered
 *
 * Regenerate after a deliberate change, and review the diff:
 *   UPDATE_IDOR=1 npx vitest run idor-sweep
 *
 * Run: cd tests/upgrade && npx vitest run idor-sweep.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, tearDownLeftovers } from "./__helpers__/setup";
import { sampleValue } from "./__helpers__/candid";
import { deployAll, ALL_CANISTERS, type Deployment, type CanisterName } from "./__helpers__/deployAll";

const EXPECTATIONS = resolve(__dirname, "idor-expectations.json");

type R<T> = { ok: T } | { err: Record<string, unknown> };
const ok = <T,>(r: R<T>): T => {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`);
  return r.ok;
};
const json = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v?._isPrincipal ? v.toText() : v));

/** Methods that change who is admin, pause the canister or reconfigure it: the other user is refused by them anyway, and calling them can't tell us about data access. */
const SKIP = /^(setBootstrapNonce|initAdmins|addAdmin|pause|unpause)$/;
/** Record fields that hold a record id. */
const ID_FIELD = /(^id$|Id$|Ids$|^token$)/;

/** `sampleValue`, with `id` in every Text argument and id-named record field. */
function argsWith(f: IDL.FuncClass, id: string, self: unknown): unknown[] {
  const fill = (t: IDL.Type, field: string, top: boolean, depth: number): unknown => {
    if (t instanceof IDL.RecClass) return fill((t as any)._type, field, top, depth);
    if (t instanceof IDL.TextClass && (top || ID_FIELD.test(field))) return id;
    if (t instanceof IDL.VecClass && (t as any)._type instanceof IDL.TextClass && (top || ID_FIELD.test(field))) return [id];
    if (t instanceof IDL.OptClass && (t as any)._type instanceof IDL.TextClass && ID_FIELD.test(field)) return [id];
    if (t instanceof IDL.RecordClass && depth < 4)
      return Object.fromEntries((t as any)._fields.map(([k, ft]: [string, IDL.Type]) => [k, fill(ft, k, false, depth + 1)]));
    return sampleValue(t, self, depth, field);
  };
  return f.argTypes.map((t) => fill(t, "", true, 0));
}

/** "ok" for #ok, true or anything non-empty; "refused" for #err, a trap, or nothing. */
function judge(r: unknown): "ok" | "refused" {
  if (r === undefined || r === null || r === false) return "refused";
  if (r === true) return "ok";
  if (Array.isArray(r)) return r.length > 0 ? "ok" : "refused";
  if (typeof r === "object") {
    if ("err" in (r as object)) return "refused";
    if ("ok" in (r as object)) {
      const v = (r as any).ok;
      return v === null || (Array.isArray(v) && v.length === 0) ? "refused" : "ok";
    }
    const keys = Object.keys(r as object);
    // A bare variant such as #unknown / #notFound / #denied is a refusal.
    if (keys.length === 1 && (r as any)[keys[0]] === null && /unknown|none|notfound|denied|invalid/i.test(keys[0])) return "refused";
    const vals = Object.values(r as object);
    return vals.every((v) => v === 0n || v === 0 || v === false || v === "" || (Array.isArray(v) && v.length === 0)) ? "refused" : "ok";
  }
  if (typeof r === "string") return r.length > 0 ? "ok" : "refused";
  return "ok";
}

describe("cross-tenant sweep: another user with the owner's real ids", () => {
  let pic: PocketIc;
  let d: Deployment;
  const admin = createIdentity("idor-admin");
  const owner = createIdentity("idor-owner");
  const other = createIdentity("idor-other");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);
  const ids: Record<string, string> = {};
  const found: Record<string, string[]> = {};
  let before = "";

  /** Everything the owner can read about their records. */
  async function ownerView(): Promise<string> {
    return json({
      property: await as("property", owner).getMyProperties(),
      jobs: await as("job", owner).getJobsForProperty(ids.property),
      bills: await as("bills", owner).getBillsForProperty(ids.property),
      recurring: await as("recurring", owner).getByProperty(ids.property),
      visits: await as("recurring", owner).getVisitLogs(ids.service),
      maintenance: await as("maintenance", owner).getScheduleByProperty(ids.property),
      quote: await as("quote", owner).getQuoteRequest(ids.request),
    });
  }

  beforeAll(async () => {
    pic = await createPic();
    d = await deployAll(pic, admin);
    for (const u of [owner, other]) ok(await as("payment", admin).grantSubscription(u.getPrincipal(), { Pro: null }));

    const home = ok<any>(await as("property", owner).registerProperty({
      address: "1 Private Lane", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Pro: null },
    }));
    ids.property = home.id;
    ids.job = ok<any>(await as("job", owner).createJob(ids.property, "Water heater", { Plumbing: null }, "Replaced it.", [], 120_000n, 0n, [], [], true, [])).id;
    ids.bill = ok<any>(await as("bills", owner).addBill({
      propertyId: ids.property, billType: { Electric: null }, provider: "Duke", periodStart: "2026-09-01",
      periodEnd: "2026-09-30", amountCents: 12_000n, usageAmount: [], usageUnit: [],
    })).id;
    ids.service = ok<any>(await as("recurring", owner).createRecurringService(
      ids.property, { LawnCare: null }, "Green Co", [], [], { Monthly: null }, "2026-01-01", [], [])).id;
    ok(await as("recurring", owner).addVisitLog(ids.service, "2026-02-01", []));
    ids.entry = ok<any>(await as("maintenance", owner).createScheduleEntry(ids.property, "HVAC", "Annual service", 2027n, [3n], [20_000n])).id;
    ids.request = ok<any>(await as("quote", owner).createQuoteRequest(ids.property, { HVAC: null }, "AC out", { High: null }, [], [], [], [], [])).id;
    ok(await as("market", owner).submitScore(ids.property));
    before = await ownerView();

    for (const name of ALL_CANISTERS) {
      const svc = d.svcs[name];
      // Reads first, so a write that wrongly succeeds can't hide a read leak.
      const fields = [...svc._fields].sort(([, a], [, b]) =>
        Number(!a.annotations.includes("query") && !a.annotations.includes("composite_query")) -
        Number(!b.annotations.includes("query") && !b.annotations.includes("composite_query")));
      const leaks = new Set<string>();
      for (const [m, f] of fields) {
        if (SKIP.test(m) || !f.argTypes.some((t) => /text/.test(t.display()))) continue;
        for (const [kind, id] of Object.entries(ids)) {
          let r: unknown;
          try { r = await as(name, other)[m](...argsWith(f, id, other.getPrincipal())); } catch { continue; }
          if (judge(r) === "ok") leaks.add(`${m}(${kind})`);
        }
      }
      found[name] = [...leaks].sort();
    }
    if (process.env.UPDATE_IDOR) writeFileSync(EXPECTATIONS, JSON.stringify(found, null, 2) + "\n");
  }, 900_000);

  afterAll(async () => { await pic?.tearDown(); await tearDownLeftovers(); });

  const expected: Record<string, string[]> = existsSync(EXPECTATIONS) ? JSON.parse(readFileSync(EXPECTATIONS, "utf8")) : {};

  it.each(ALL_CANISTERS)("IDOR.1 %s: the other user gets only what idor-expectations.json lists", (name) => {
    expect(found[name]).toEqual(expected[name] ?? []);
  });

  it("IDOR.3 bills refuses records on a property id nobody registered", async () => {
    const r = await as("bills", other).addBill({
      propertyId: "no-such-home", billType: { Electric: null }, provider: "Duke", periodStart: "2026-09-01",
      periodEnd: "2026-09-30", amountCents: 1n, usageAmount: [], usageUnit: [],
    });
    expect(Object.keys((r as any).err ?? { ok: null })[0]).toBe("NotFound");
  });

  it("IDOR.2 the owner's records are unchanged", async () => {
    expect(await ownerView()).toBe(before);
  });
});
