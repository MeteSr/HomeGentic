/**
 * OQL on the bills canister (docs/AI_CONNECTORS.md, audits/icp-aiware-2026-11-10.md):
 * `schema()` and `execute(oql)` let an AI assistant (ICP MCP, or the in-app
 * assistant's query_home_records tool) answer questions such as "which bills
 * jumped this year?" or "what are my fixed housing costs a year?" in one call
 * that filters and adds up inside the canister. Real property, payment and
 * bills canisters, wired as deploy.sh wires them.
 *
 *  BOQL.1 schema() is a query describing "bills" and "recurring_expenses",
 *         with no principals
 *  BOQL.2 execute is a composite query, so "Questions only" sessions can use it
 *  BOQL.3 the owner sees their homes' bills with no property filter, and can
 *         filter, group and add up (anomalies, spend by type, annual costs)
 *  BOQL.4 strangers and anonymous callers get nothing, even when they name the
 *         home; a manager sees the home they name, without the mortgage
 *  BOQL.5 malformed, oversized and too-many-homes queries are rejected with a
 *         message and change nothing
 *
 * Run: cd tests/upgrade && npx vitest run bills-oql.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,bills}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}

type Cell = { name: string; value: Record<string, unknown> };
type Result = { hasMore: boolean; rows: Cell[][] };
/** A row as a plain object, read by cell name (never by position). */
const plain = (row: Cell[]) =>
  Object.fromEntries(
    row.map((c) => {
      const [k, v] = Object.entries(c.value)[0];
      return [c.name, k === "null" ? null : typeof v === "bigint" ? Number(v) : v];
    }),
  );

const CANISTERS = ["property", "payment", "bills"] as const;
type Name = (typeof CANISTERS)[number];
const DAY_MS = 86_400_000;

describe("bills OQL (schema + execute)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let homeA = "";
  let homeB = "";
  let otherHome = "";
  let spike = "";

  const admin = createIdentity("boql-admin");
  const owner = createIdentity("boql-owner");
  const manager = createIdentity("boql-manager");
  const stranger = createIdentity("boql-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const exec = async (who: Identity, q: object | string): Promise<Result> =>
    as("bills", who).execute(typeof q === "string" ? q : JSON.stringify(q));
  const rows = async (who: Identity, q: object) => (await exec(who, q)).rows.map(plain);

  const register = async (who: Identity, address: string) =>
    ok<any>(
      await as("property", who).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1999n,
        squareFeet: 1600n,
        tier: { Pro: null },
      }),
    ).id as string;
  const bill = async (
    who: Identity,
    propertyId: string,
    billType: object,
    provider: string,
    periodStart: string,
    cents: bigint,
    usage: [number, string] | null,
  ) => {
    const r = ok<any>(
      await as("bills", who).addBill({
        propertyId,
        billType,
        provider,
        periodStart,
        periodEnd: periodStart.replace(/-01$/, "-28"),
        amountCents: cents,
        usageAmount: usage ? [usage[0]] : [],
        usageUnit: usage ? [usage[1]] : [],
      }),
    );
    await pic.advanceTime(DAY_MS); // the anomaly baseline only counts earlier uploads
    await pic.tick();
    return r.id as string;
  };
  const expense = async (who: Identity, propertyId: string, category: object, cents: bigint, frequency: object) =>
    ok<any>(
      await as("bills", who).addRecurringExpense(propertyId, {
        category,
        provider: "Provider",
        amountCents: cents,
        frequency,
        startDate: "2024-01-01",
        endDate: [],
      }),
    ).id as string;

  beforeAll(async () => {
    pic = await createPic();
    await pic.setTime(Date.now());
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      ids[name] = (
        await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })
      ).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));
    ok(await as("bills", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("bills", admin).setPaymentCanisterId(ids.payment.toText()));

    for (const who of [owner, stranger])
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));
    homeA = await register(owner, "1 Bill Way");
    homeB = await register(owner, "2 Bill Way");
    otherHome = await register(stranger, "3 Elsewhere Rd");

    const invite = ok<any>(await as("property", owner).inviteManager(homeA, { Manager: null }, "Manager", []));
    ok(await as("property", manager).claimManagerRole(invite.token));

    await bill(owner, homeA, { Electric: null }, "FPL", "2025-01-01", 10_000n, [800, "kWh"]);
    await bill(owner, homeA, { Electric: null }, "FPL", "2025-02-01", 10_000n, [820, "kWh"]);
    spike = await bill(owner, homeA, { Electric: null }, "FPL", "2025-03-01", 20_000n, [1600, "kWh"]);
    await bill(owner, homeB, { Water: null }, "OUC", "2025-03-01", 4_500n, null);
    await bill(stranger, otherHome, { Electric: null }, "Duke", "2025-03-01", 99_000n, null);

    await expense(owner, homeA, { Mortgage: null }, 180_000n, { Monthly: null });
    await expense(owner, homeA, { HOA: null }, 60_000n, { Quarterly: null });
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("BOQL.1 schema() describes bills and recurring_expenses as JSON, with no principals", async () => {
    expect(svcs.bills._fields.find(([n]) => n === "schema")?.[1].annotations).toEqual(["query"]);
    const schema = JSON.parse(await as("bills", stranger).schema());
    const byName = Object.fromEntries(schema.entities.map((e: any) => [e.name, e]));
    const fields = (e: string) => Object.fromEntries(byName[e].fields.map((f: any) => [f.name, f.typeName]));
    expect(byName.bills.primaryKey).toBe("id");
    expect(fields("bills")).toMatchObject({
      id: "text",
      propertyId: "text",
      billType: "text",
      provider: "text",
      periodStart: "text",
      periodMonth: "text",
      periodYear: "int",
      amountCents: "int",
      usageAmount: "float",
      usageUnit: "text",
      anomalyFlag: "bool",
      anomalyReason: "text",
    });
    expect(fields("recurring_expenses")).toMatchObject({
      id: "text",
      propertyId: "text",
      category: "text",
      amountCents: "int",
      frequency: "text",
      annualCents: "int",
      startDate: "text",
      endDate: "text",
    });
    for (const e of schema.entities) {
      expect(Object.keys(fields(e.name))).not.toContain("homeowner");
      for (const f of e.fields) expect(f.role).toBe("payload");
    }
  });

  it("BOQL.2 execute is a composite query", async () => {
    expect(svcs.bills._fields.find(([n]) => n === "execute")?.[1].annotations).toEqual(["composite_query"]);
  });

  it("BOQL.3 lets the owner filter, group and add up their homes' bills and fixed costs", async () => {
    const all = await rows(owner, { start: "bills", select: ["propertyId"] });
    expect(all.map((r) => r.propertyId).sort()).toEqual([homeA, homeA, homeA, homeB].sort());

    const jumps = await rows(owner, {
      start: "bills",
      where: { eq: { field: "anomalyFlag", value: true } },
      select: ["id", "provider", "periodMonth", "amountCents", "usageAmount", "usageUnit"],
    });
    expect(jumps).toEqual([
      { id: spike, provider: "FPL", periodMonth: "2025-03", amountCents: 20_000, usageAmount: 1600, usageUnit: "kWh" },
    ]);
    const reason = await rows(owner, { start: "bills", where: { eq: { field: "id", value: spike } }, select: ["anomalyReason"] });
    expect(String(reason[0].anomalyReason)).toMatch(/above your 3-month average/);

    const byType = await rows(owner, {
      start: "bills",
      where: { eq: { field: "periodYear", value: 2025 } },
      groupBy: ["billType"],
      aggregate: [{ fn: "sum", field: "amountCents", as: "spent" }],
      orderBy: [{ field: "spent", dir: "desc" }],
    });
    expect(byType).toEqual([
      { billType: "Electric", spent: 40_000 },
      { billType: "Water", spent: 4_500 },
    ]);

    const fixed = await rows(owner, {
      start: "recurring_expenses",
      aggregate: [{ fn: "sum", field: "annualCents", as: "perYear" }],
    });
    expect(fixed).toEqual([{ perYear: 180_000 * 12 + 60_000 * 4 }]);
  });

  it("BOQL.4 shows strangers and anonymous callers nothing, and a manager the home they name without the mortgage", async () => {
    expect(await rows(stranger, { start: "bills", where: { eq: { field: "propertyId", value: homeA } } })).toEqual([]);
    expect(
      (
        await rows(stranger, { start: "bills", where: { in: { field: "propertyId", value: [homeA, homeB, otherHome] } } })
      ).map((r) => r.propertyId),
    ).toEqual([otherHome]);
    expect(await exec(new AnonymousIdentity(), { start: "bills" })).toEqual({ hasMore: false, rows: [] });

    expect(await rows(manager, { start: "bills" })).toEqual([]);
    const pinned = { eq: { field: "propertyId", value: homeA } };
    expect((await rows(manager, { start: "bills", where: pinned, aggregate: [{ fn: "count", as: "n" }] }))[0].n).toBe(3);
    const visible = await rows(manager, { start: "recurring_expenses", where: pinned, select: ["category"] });
    expect(visible).toEqual([{ category: "HOA" }]);
    expect(await rows(manager, { start: "bills", where: { eq: { field: "propertyId", value: homeB } } })).toEqual([]);
  });

  it("BOQL.5 rejects malformed, oversized and too-many-homes queries with a message", async () => {
    await expect(exec(owner, "not json")).rejects.toThrow(/OQL/);
    await expect(exec(owner, { start: "people" })).rejects.toThrow(/OQL.*people/);
    await expect(exec(owner, { start: "bills", select: ["homeowner"] })).rejects.toThrow(/OQL/);
    await expect(exec(owner, "x".repeat(5000))).rejects.toThrow(/OQL/);
    const many = Array.from({ length: 21 }, (_, i) => `HOME_${i}`);
    await expect(
      exec(owner, { start: "bills", where: { in: { field: "propertyId", value: many } } }),
    ).rejects.toThrow(/OQL.*20 homes/);
    expect((await rows(owner, { start: "bills", aggregate: [{ fn: "count", as: "n" }] }))[0].n).toBe(4);
  });
});
