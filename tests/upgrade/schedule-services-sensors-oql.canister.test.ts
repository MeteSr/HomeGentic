/**
 * OQL on the maintenance, recurring and sensor canisters: `schema()` and
 * `execute(oql)` let an assistant (the in-app query_home_records tool; ICP MCP
 * for maintenance and recurring) answer "what's due this month?", "when is the
 * pest service next due?" and "any leak alerts this week?" in one read that
 * filters and adds up inside the canister. Real property, payment,
 * maintenance, recurring and sensor canisters, wired as deploy.sh wires them.
 *
 *  SOQL.1 each schema() is a query describing its entities, with no principals,
 *         no vendor device ids and no raw sensor payloads
 *  SOQL.2 each execute is a composite query
 *  SOQL.3 maintenance: the owner filters planned tasks by month and adds up
 *         open costs
 *  SOQL.4 recurring: services carry their last visit, visit count and an
 *         estimated next visit; visits carry the provider
 *  SOQL.5 sensor: devices and events by severity and date, newest first
 *  SOQL.6 strangers and anonymous callers get nothing, even when they name the
 *         home; a manager sees the home they name
 *  SOQL.7 malformed and too-many-homes queries are rejected with a message
 *
 * Run: cd tests/upgrade && npx vitest run schedule-services-sensors-oql
 * (needs .dfx/local/canisters/{property,payment,maintenance,recurring,sensor}/*.wasm)
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

const CANISTERS = ["property", "payment", "maintenance", "recurring", "sensor"] as const;
type Name = (typeof CANISTERS)[number];
const OQL = ["maintenance", "recurring", "sensor"] as const;
const NOW = Date.UTC(2026, 10, 14, 12); // 2026-11-14

describe("maintenance, recurring and sensor OQL (schema + execute)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let homeA = "";
  let homeB = "";
  let otherHome = "";
  let pest = "";
  let leakSensor = "";

  const admin = createIdentity("soql-admin");
  const owner = createIdentity("soql-owner");
  const manager = createIdentity("soql-manager");
  const stranger = createIdentity("soql-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const exec = async (c: Name, who: Identity, q: object | string): Promise<Result> =>
    as(c, who).execute(typeof q === "string" ? q : JSON.stringify(q));
  const rows = async (c: Name, who: Identity, q: object) => (await exec(c, who, q)).rows.map(plain);

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
  const plan = async (
    who: Identity,
    home: string,
    system: string,
    task: string,
    year: bigint,
    month: bigint | null,
    cents: bigint | null,
  ) =>
    ok<any>(
      await as("maintenance", who).createScheduleEntry(
        home,
        system,
        task,
        year,
        month === null ? [] : [month],
        cents === null ? [] : [cents],
      ),
    ).id as string;
  const service = async (
    who: Identity,
    home: string,
    type: object,
    provider: string,
    frequency: object,
    start: string,
  ) =>
    ok<any>(
      await as("recurring", who).createRecurringService(
        home,
        type,
        provider,
        [],
        ["407-555-0100"],
        frequency,
        start,
        [],
        ["Gate code 1234"],
      ),
    ).id as string;
  const device = async (who: Identity, home: string, ext: string, name: string) =>
    ok<any>(await as("sensor", who).registerDevice(home, ext, { Manual: null }, name)).id as string;
  const event = async (ext: string, type: object, value: number, unit: string) => {
    ok(await as("sensor", admin).recordEvent(ext, type, value, unit, '{"secret":"raw-payload"}'));
  };

  beforeAll(async () => {
    pic = await createPic();
    await pic.setTime(NOW);
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
    ok(await as("maintenance", admin).setPropertyCanisterId(ids.property));
    ok(await as("recurring", admin).setPropertyCanisterId(ids.property));
    ok(await as("sensor", admin).setPropertyCanisterId(ids.property.toText()));

    for (const who of [owner, stranger])
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));
    homeA = await register(owner, "1 Plan Way");
    homeB = await register(owner, "2 Plan Way");
    otherHome = await register(stranger, "3 Elsewhere Rd");
    const invite = ok<any>(await as("property", owner).inviteManager(homeA, { Manager: null }, "Manager", []));
    ok(await as("property", manager).claimManagerRole(invite.token));

    // Planned maintenance
    await plan(owner, homeA, "HVAC", "Spring tune-up", 2026n, 11n, 12_000n);
    await plan(owner, homeA, "Gutters", "Clean gutters", 2026n, 11n, 15_000n);
    const done = await plan(owner, homeA, "Roofing", "Roof inspection", 2026n, 3n, 20_000n);
    ok(await as("maintenance", owner).markCompleted(done));
    await plan(owner, homeB, "Water Heater", "Flush tank", 2027n, null, null);
    await plan(stranger, otherHome, "HVAC", "Their tune-up", 2026n, 11n, 99_000n);

    // Recurring services and visits
    pest = await service(owner, homeA, { PestControl: null }, "BugAway", { Quarterly: null }, "2026-01-10");
    ok(await as("recurring", owner).addVisitLog(pest, "2026-04-12", ["Treated perimeter"]));
    ok(await as("recurring", owner).addVisitLog(pest, "2026-07-15", []));
    await service(owner, homeA, { LawnCare: null }, "GreenCo", { Weekly: null }, "2026-11-10");
    const pool = await service(owner, homeB, { PoolMaintenance: null }, "BluePool", { Monthly: null }, "2026-01-31");
    ok(await as("recurring", owner).updateStatus(pool, { Cancelled: null }));
    await service(stranger, otherHome, { PestControl: null }, "TheirBugs", { Monthly: null }, "2026-02-01");

    // Sensors
    leakSensor = await device(owner, homeA, "ext-leak-1", "Kitchen leak sensor");
    await device(owner, homeA, "ext-thermo-1", "Hall thermostat");
    await device(stranger, otherHome, "ext-their-1", "Their sensor");
    await event("ext-thermo-1", { HighHumidity: null }, 74, "%RH");
    await pic.advanceTime(3 * 86_400_000);
    await pic.tick();
    await event("ext-leak-1", { WaterLeak: null }, 2.5, "L/min"); // 2026-11-17
    await event("ext-their-1", { WaterLeak: null }, 9, "L/min");
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("SOQL.1 each schema() describes its entities as JSON, with nothing private in it", async () => {
    const want: Record<(typeof OQL)[number], Record<string, Record<string, string>>> = {
      maintenance: {
        planned_tasks: {
          id: "text",
          propertyId: "text",
          systemName: "text",
          task: "text",
          plannedYear: "int",
          plannedMonth: "int",
          plannedPeriod: "text",
          estimatedCostCents: "int",
          completed: "bool",
          createdDate: "text",
        },
      },
      recurring: {
        services: {
          id: "text",
          propertyId: "text",
          serviceType: "text",
          providerName: "text",
          providerPhone: "text",
          frequency: "text",
          startDate: "text",
          contractEndDate: "text",
          status: "text",
          notes: "text",
          hasContract: "bool",
          visitCount: "int",
          lastVisitDate: "text",
          nextVisitEstimate: "text",
        },
        visits: {
          id: "text",
          serviceId: "text",
          propertyId: "text",
          visitDate: "text",
          note: "text",
          serviceType: "text",
          providerName: "text",
        },
      },
      sensor: {
        devices: {
          id: "text",
          propertyId: "text",
          name: "text",
          source: "text",
          registeredDate: "text",
          active: "bool",
        },
        events: {
          id: "text",
          propertyId: "text",
          deviceId: "text",
          deviceName: "text",
          eventType: "text",
          severity: "text",
          value: "float",
          unit: "text",
          date: "text",
          time: "text",
          jobId: "text",
        },
      },
    };
    for (const c of OQL) {
      expect(svcs[c]._fields.find(([n]) => n === "schema")?.[1].annotations, c).toEqual(["query"]);
      const schema = JSON.parse(await as(c, stranger).schema());
      const got = Object.fromEntries(
        schema.entities.map((e: any) => [e.name, Object.fromEntries(e.fields.map((f: any) => [f.name, f.typeName]))]),
      );
      expect(got, c).toEqual(want[c]);
      for (const e of schema.entities) {
        expect(e.primaryKey).toBe("id");
        for (const f of e.fields)
          expect(f.name, `${c}.${e.name}`).not.toMatch(/homeowner|createdBy|externalDeviceId|rawPayload|license/i);
      }
    }
  });

  it("SOQL.2 each execute is a composite query", () => {
    for (const c of OQL)
      expect(svcs[c]._fields.find(([n]) => n === "execute")?.[1].annotations, c).toEqual(["composite_query"]);
  });

  it("SOQL.3 maintenance: what's due this month, and what open tasks add up to", async () => {
    const due = await rows("maintenance", owner, {
      start: "planned_tasks",
      where: {
        and: [{ eq: { field: "plannedPeriod", value: "2026-11" } }, { eq: { field: "completed", value: false } }],
      },
      select: ["systemName", "task", "estimatedCostCents"],
      orderBy: [{ field: "systemName", dir: "asc" }],
    });
    expect(due).toEqual([
      { systemName: "Gutters", task: "Clean gutters", estimatedCostCents: 15_000 },
      { systemName: "HVAC", task: "Spring tune-up", estimatedCostCents: 12_000 },
    ]);

    const open = await rows("maintenance", owner, {
      start: "planned_tasks",
      where: { eq: { field: "completed", value: false } },
      aggregate: [
        { fn: "count", as: "n" },
        { fn: "sum", field: "estimatedCostCents", as: "cents" },
      ],
    });
    expect(open).toEqual([{ n: 3, cents: 27_000 }]);

    const yearOnly = await rows("maintenance", owner, {
      start: "planned_tasks",
      where: { eq: { field: "propertyId", value: homeB } },
      select: ["plannedYear", "plannedMonth", "plannedPeriod", "estimatedCostCents", "createdDate"],
    });
    expect(yearOnly).toEqual([
      {
        plannedYear: 2027,
        plannedMonth: null,
        plannedPeriod: "2027",
        estimatedCostCents: null,
        createdDate: "2026-11-14",
      },
    ]);
  });

  it("SOQL.4 recurring: services with last visit and an estimated next one; visits with the provider", async () => {
    const services = await rows("recurring", owner, {
      start: "services",
      select: [
        "providerName",
        "serviceType",
        "frequency",
        "status",
        "visitCount",
        "lastVisitDate",
        "nextVisitEstimate",
        "hasContract",
        "providerPhone",
        "notes",
      ],
      orderBy: [{ field: "providerName", dir: "asc" }],
    });
    expect(services).toEqual([
      // Cancelled: no next visit
      {
        providerName: "BluePool",
        serviceType: "PoolMaintenance",
        frequency: "Monthly",
        status: "Cancelled",
        visitCount: 0,
        lastVisitDate: null,
        nextVisitEstimate: null,
        hasContract: false,
        providerPhone: "407-555-0100",
        notes: "Gate code 1234",
      },
      // Quarterly from the last visit, 2026-07-15
      {
        providerName: "BugAway",
        serviceType: "PestControl",
        frequency: "Quarterly",
        status: "Active",
        visitCount: 2,
        lastVisitDate: "2026-07-15",
        nextVisitEstimate: "2026-10-15",
        hasContract: false,
        providerPhone: "407-555-0100",
        notes: "Gate code 1234",
      },
      // No visit logged yet: counted from the start date; weekly = 7 days
      {
        providerName: "GreenCo",
        serviceType: "LawnCare",
        frequency: "Weekly",
        status: "Active",
        visitCount: 0,
        lastVisitDate: null,
        nextVisitEstimate: "2026-11-17",
        hasContract: false,
        providerPhone: "407-555-0100",
        notes: "Gate code 1234",
      },
    ]);

    const active = await rows("recurring", owner, {
      start: "services",
      where: { eq: { field: "status", value: "Active" } },
      aggregate: [{ fn: "count", as: "n" }],
    });
    expect(active).toEqual([{ n: 2 }]);

    const visits = await rows("recurring", owner, {
      start: "visits",
      select: ["serviceId", "visitDate", "note", "providerName", "serviceType"],
      orderBy: [{ field: "visitDate", dir: "desc" }],
    });
    expect(visits).toEqual([
      { serviceId: pest, visitDate: "2026-07-15", note: null, providerName: "BugAway", serviceType: "PestControl" },
      {
        serviceId: pest,
        visitDate: "2026-04-12",
        note: "Treated perimeter",
        providerName: "BugAway",
        serviceType: "PestControl",
      },
    ]);
  });

  it("SOQL.4b recurring: a month-end start keeps to the month's last day", async () => {
    const id = await service(owner, homeB, { Other: null }, "MonthEnd", { Monthly: null }, "2027-01-31");
    const r = await rows("recurring", owner, {
      start: "services",
      where: { eq: { field: "id", value: id } },
      select: ["nextVisitEstimate"],
    });
    expect(r).toEqual([{ nextVisitEstimate: "2027-02-28" }]);
    ok(await as("recurring", owner).updateStatus(id, { Cancelled: null }));
  });

  it("SOQL.5 sensor: devices, and alerts by severity and date", async () => {
    const devices = await rows("sensor", owner, {
      start: "devices",
      select: ["name", "source", "active", "registeredDate"],
      orderBy: [{ field: "name", dir: "asc" }],
    });
    expect(devices).toEqual([
      { name: "Hall thermostat", source: "Manual", active: true, registeredDate: "2026-11-14" },
      { name: "Kitchen leak sensor", source: "Manual", active: true, registeredDate: "2026-11-14" },
    ]);

    const leaks = await rows("sensor", owner, {
      start: "events",
      where: {
        and: [{ eq: { field: "severity", value: "Critical" } }, { ge: { field: "date", value: "2026-11-15" } }],
      },
      select: ["deviceId", "deviceName", "eventType", "severity", "value", "unit", "date"],
    });
    expect(leaks).toEqual([
      {
        deviceId: leakSensor,
        deviceName: "Kitchen leak sensor",
        eventType: "WaterLeak",
        severity: "Critical",
        value: 2.5,
        unit: "L/min",
        date: "2026-11-17",
      },
    ]);

    const all = await rows("sensor", owner, {
      start: "events",
      select: ["eventType", "time"],
      orderBy: [{ field: "time", dir: "desc" }],
    });
    expect(all.map((r) => r.eventType)).toEqual(["WaterLeak", "HighHumidity"]);
    expect(String(all[1].time)).toMatch(/^2026-11-14T12:\d\d:\d\dZ$/);

    const bySeverity = await rows("sensor", owner, {
      start: "events",
      groupBy: ["severity"],
      aggregate: [{ fn: "count", as: "n" }],
      orderBy: [{ field: "severity", dir: "asc" }],
    });
    expect(bySeverity).toEqual([
      { severity: "Critical", n: 1 },
      { severity: "Warning", n: 1 },
    ]);
  });

  it("SOQL.6 strangers and anonymous callers see nothing of the home; a manager sees the home they name", async () => {
    const starts: Record<(typeof OQL)[number], string[]> = {
      maintenance: ["planned_tasks"],
      recurring: ["services", "visits"],
      sensor: ["devices", "events"],
    };
    const pinned = { eq: { field: "propertyId", value: homeA } };
    for (const c of OQL) {
      for (const start of starts[c]) {
        const tag = `${c}.${start}`;
        expect(await rows(c, stranger, { start, where: pinned }), tag).toEqual([]);
        const theirs = await rows(c, stranger, {
          start,
          where: { in: { field: "propertyId", value: [homeA, homeB, otherHome] } },
          select: ["propertyId"],
        });
        for (const r of theirs) expect(r.propertyId, tag).toBe(otherHome);
        const unpinned = await rows(c, stranger, { start, select: ["propertyId"] });
        for (const r of unpinned) expect(r.propertyId, tag).toBe(otherHome);
        expect(await exec(c, new AnonymousIdentity(), { start }), tag).toEqual({ hasMore: false, rows: [] });

        // The manager entered nothing, so an unpinned query is empty; naming the home shows it.
        expect(await rows(c, manager, { start }), tag).toEqual([]);
        expect(await rows(c, manager, { start, where: { eq: { field: "propertyId", value: homeB } } }), tag).toEqual(
          [],
        );
      }
    }
    expect((await rows("maintenance", manager, { start: "planned_tasks", where: pinned })).length).toBe(3);
    expect((await rows("recurring", manager, { start: "services", where: pinned })).length).toBe(2);
    expect((await rows("recurring", manager, { start: "visits", where: pinned })).length).toBe(2);
    expect((await rows("sensor", manager, { start: "devices", where: pinned })).length).toBe(2);
    expect((await rows("sensor", manager, { start: "events", where: pinned })).length).toBe(2);
    // The stranger's own records are theirs to read.
    expect(await rows("sensor", stranger, { start: "events", select: ["value"] })).toEqual([{ value: 9 }]);
  });

  it("SOQL.7 rejects malformed and too-many-homes queries with a message", async () => {
    const first: Record<(typeof OQL)[number], string> = {
      maintenance: "planned_tasks",
      recurring: "services",
      sensor: "events",
    };
    const many = Array.from({ length: 21 }, (_, i) => `HOME_${i}`);
    for (const c of OQL) {
      await expect(exec(c, owner, "not json"), c).rejects.toThrow(/OQL/);
      await expect(exec(c, owner, { start: "people" }), c).rejects.toThrow(/OQL.*people/);
      await expect(exec(c, owner, { start: first[c], select: ["homeowner"] }), c).rejects.toThrow(/OQL/);
      await expect(
        exec(c, owner, { start: first[c], where: { in: { field: "propertyId", value: many } } }),
        c,
      ).rejects.toThrow(/OQL.*20 homes/);
    }
  });
});
