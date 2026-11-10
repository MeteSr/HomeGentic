/**
 * OQL on the job canister (docs/AI_CONNECTORS.md, audits/icp-aiware-2026-11-10.md):
 * `schema()` and `execute(oql)` let an AI assistant (ICP MCP, or our own
 * agent later) answer open-ended questions about a household's maintenance
 * record, such as "what did I spend on HVAC since 2023?", with one call that
 * filters and adds up inside the canister. Real property, payment and job
 * canisters, wired as deploy.sh wires them.
 *
 *  OQL.1 schema() is a query describing the "jobs" entity: its key, every
 *        field with its type, and the owner's marks (cost category, permit
 *        status) joined in
 *  OQL.2 execute is a composite query, so "Questions only" sessions can use it
 *  OQL.3 the owner sees their homes' jobs with no property filter, and can
 *        filter, sort, page and add up
 *  OQL.4 strangers and anonymous callers get no rows, even when they name the
 *        property; a manager sees the home once they name it
 *  OQL.5 a malformed or oversized query is rejected with a message and
 *        changes nothing
 *
 * Run: cd tests/upgrade && npx vitest run job-oql.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,job}/*.wasm)
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

const CANISTERS = ["property", "payment", "job"] as const;
type Name = (typeof CANISTERS)[number];
const ns = (iso: string) => BigInt(Date.parse(iso)) * 1_000_000n;

describe("job OQL (schema + execute)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let homeA = "";
  let homeB = "";
  let otherHome = "";
  let hvac2022 = "";
  let hvac2024 = "";
  let roof2023 = "";

  const admin = createIdentity("oql-admin");
  const owner = createIdentity("oql-owner");
  const manager = createIdentity("oql-manager");
  const stranger = createIdentity("oql-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const exec = async (who: Identity, q: object | string): Promise<Result> =>
    as("job", who).execute(typeof q === "string" ? q : JSON.stringify(q));
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
  const job = async (who: Identity, pid: string, title: string, serviceType: object, cents: bigint, iso: string) =>
    ok<any>(
      await as("job", who).createJob(
        pid,
        title,
        serviceType,
        `${title} work`,
        ["Acme Pros"],
        cents,
        ns(iso),
        [],
        [12n],
        false,
        [],
      ),
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
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("job", admin).addTrustedCanister(ids.property));

    for (const who of [owner, stranger])
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));
    homeA = await register(owner, "1 Query Way");
    homeB = await register(owner, "2 Query Way");
    otherHome = await register(stranger, "3 Elsewhere Rd");

    const invite = ok<any>(await as("property", owner).inviteManager(homeB, { Manager: null }, "Manager", []));
    ok(await as("property", manager).claimManagerRole(invite.token));

    hvac2022 = await job(owner, homeA, "AC tune-up", { HVAC: null }, 20_000n, "2022-05-10T12:00:00Z");
    hvac2024 = await job(owner, homeA, "New condenser", { HVAC: null }, 480_000n, "2024-07-01T12:00:00Z");
    roof2023 = await job(owner, homeB, "Roof patch", { Roofing: null }, 125_000n, "2023-03-15T12:00:00Z");
    await job(stranger, otherHome, "Their HVAC", { HVAC: null }, 99_000n, "2024-01-01T12:00:00Z");

    ok(await as("job", owner).setJobCostCategory(hvac2024, [{ Improvement: null }]));
    ok(await as("job", owner).setPermitStatus(hvac2024, [{ Closed: null }]));
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("OQL.1 schema() describes the jobs entity as JSON", async () => {
    expect(svcs.job._fields.find(([n]) => n === "schema")?.[1].annotations).toEqual(["query"]);
    const schema = JSON.parse(await as("job", stranger).schema());
    const jobs = schema.entities.find((e: any) => e.name === "jobs");
    expect(jobs.primaryKey).toBe("id");
    const fields = Object.fromEntries(jobs.fields.map((f: any) => [f.name, f.typeName]));
    expect(fields).toMatchObject({
      id: "text",
      propertyId: "text",
      title: "text",
      serviceType: "text",
      amountCents: "int",
      completedDate: "text",
      completedYear: "int",
      isDiy: "bool",
      status: "text",
      verified: "bool",
      warrantyMonths: "int",
      costCategory: "text",
      permitStatus: "text",
    });
    for (const f of jobs.fields) expect(f.role).toBe("payload");
    // no principals leave the canister through OQL
    expect(fields).not.toHaveProperty("homeowner");
    expect(fields).not.toHaveProperty("contractor");
  });

  it("OQL.2 execute is a composite query", async () => {
    expect(svcs.job._fields.find(([n]) => n === "execute")?.[1].annotations).toEqual(["composite_query"]);
  });

  it("OQL.3 lets the owner filter, sort, page and add up their homes' jobs", async () => {
    const all = await rows(owner, { start: "jobs", select: ["id", "propertyId"], orderBy: [{ field: "id" }] });
    expect(all.map((r) => r.id).sort()).toEqual([hvac2022, hvac2024, roof2023].sort());

    const recent = await rows(owner, {
      start: "jobs",
      where: {
        and: [{ eq: { field: "serviceType", value: "HVAC" } }, { ge: { field: "completedDate", value: "2023-01-01" } }],
      },
      select: [
        "title",
        "amountCents",
        "completedDate",
        "completedYear",
        "costCategory",
        "permitStatus",
        "warrantyMonths",
      ],
    });
    expect(recent).toEqual([
      {
        title: "New condenser",
        amountCents: 480_000,
        completedDate: "2024-07-01",
        completedYear: 2024,
        costCategory: "Improvement",
        permitStatus: "Closed",
        warrantyMonths: 12,
      },
    ]);

    const byType = await rows(owner, {
      start: "jobs",
      groupBy: ["serviceType"],
      aggregate: [
        { fn: "sum", field: "amountCents", as: "spent" },
        { fn: "count", as: "jobs" },
      ],
      orderBy: [{ field: "spent", dir: "desc" }],
    });
    expect(byType).toEqual([
      { serviceType: "HVAC", spent: 500_000, jobs: 2 },
      { serviceType: "Roofing", spent: 125_000, jobs: 1 },
    ]);

    const page = await exec(owner, { start: "jobs", orderBy: [{ field: "completedDate" }], limit: 2 });
    expect(page.hasMore).toBe(true);
    expect(page.rows.map(plain).map((r) => r.id)).toEqual([hvac2022, roof2023]);
    const rest = await exec(owner, { start: "jobs", orderBy: [{ field: "completedDate" }], offset: 2, limit: 2 });
    expect(rest.hasMore).toBe(false);
    expect(rest.rows.map(plain).map((r) => r.id)).toEqual([hvac2024]);
  });

  it("OQL.4 shows strangers and anonymous callers nothing, and a manager the home they name", async () => {
    expect(await rows(stranger, { start: "jobs", where: { eq: { field: "propertyId", value: homeA } } })).toEqual([]);
    expect(
      (
        await rows(stranger, {
          start: "jobs",
          where: { in: { field: "propertyId", value: [homeA, homeB, otherHome] } },
        })
      ).map((r) => r.propertyId),
    ).toEqual([otherHome]);
    expect(await exec(new AnonymousIdentity(), { start: "jobs" })).toEqual({ hasMore: false, rows: [] });

    // a manager's homes aren't theirs, so they name the one they manage
    expect(await rows(manager, { start: "jobs" })).toEqual([]);
    const managed = await rows(manager, {
      start: "jobs",
      where: { eq: { field: "propertyId", value: homeB } },
      select: ["id"],
    });
    expect(managed).toEqual([{ id: roof2023 }]);
    expect(await rows(manager, { start: "jobs", where: { eq: { field: "propertyId", value: homeA } } })).toEqual([]);
  });

  it("OQL.5 rejects malformed and oversized queries with a message", async () => {
    await expect(exec(owner, "not json")).rejects.toThrow(/OQL/);
    await expect(exec(owner, { start: "people" })).rejects.toThrow(/OQL.*people/);
    await expect(
      exec(owner, { start: "jobs", where: { eq: { field: "amountCents", value: "lots" } } }),
    ).rejects.toThrow(/OQL/);
    await expect(exec(owner, { start: "jobs", select: ["homeowner"] })).rejects.toThrow(/OQL/);
    await expect(exec(owner, "x".repeat(5000))).rejects.toThrow(/OQL/);
    // nothing changed
    expect((await rows(owner, { start: "jobs", aggregate: [{ fn: "count", as: "n" }] }))[0].n).toBe(3);
  });
});
