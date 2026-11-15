/**
 * The sensor canister as AI assistants reach it through ICP MCP (listed in
 * frontend/scripts/icArchitecture.mjs since 2026-11-15). A connector signs
 * calls as the user's own principal, so the canister's access checks are the
 * whole privacy boundary: every read an assistant can make returns a home's
 * devices and readings only to people with a role on that home.
 *
 *  SCON.1 getApiDoc() is an anonymous query and describes the canister truthfully
 *  SCON.2 the owner reads their own home's devices, events and alerts
 *  SCON.3 a stranger and an anonymous caller get nothing from any read
 *  SCON.4 a stranger can't remove the owner's device, add one to the owner's
 *         home, or record a reading
 *
 * (execute/schema access is covered by schedule-services-sensors-oql.)
 *
 * Run: cd tests/upgrade && npx vitest run sensor-connector.canister.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { AnonymousIdentity, type Identity } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

const CANISTERS = ["property", "payment", "sensor"] as const;
type Name = (typeof CANISTERS)[number];

function ok<T>(r: any): T {
  if (r && "err" in r)
    throw new Error(`expected ok, got ${JSON.stringify(r.err, (_, v) => (typeof v === "bigint" ? `${v}` : v))}`);
  return r.ok as T;
}

describe("sensor canister through an AI connector", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let theirHome = "";
  let leak = "";

  const admin = createIdentity("scon-admin");
  const owner = createIdentity("scon-owner");
  const stranger = createIdentity("scon-stranger");
  const anon = new AnonymousIdentity();

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const register = async (who: Identity, address: string) =>
    ok<any>(
      await as("property", who).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2001n,
        squareFeet: 1500n,
        tier: { Free: null },
      }),
    ).id as string;

  beforeAll(async () => {
    pic = await createPic();
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
    ok(await as("sensor", admin).setPropertyCanisterId(ids.property.toText()));

    home = await register(owner, "10 Sensor St");
    theirHome = await register(stranger, "20 Elsewhere Ave");
    leak = ok<any>(
      await as("sensor", owner).registerDevice(home, "ext-scon-leak", { Manual: null }, "Laundry leak sensor"),
    ).id;
    ok(await as("sensor", admin).recordEvent("ext-scon-leak", { WaterLeak: null }, 3.2, "L/min", '{"raw":1}'));
    ok(await as("sensor", admin).recordEvent("ext-scon-leak", { HighHumidity: null }, 72, "%RH", "{}"));
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("SCON.1 getApiDoc() answers anyone and says what the canister really does", async () => {
    const field = new Map(svcs.sensor._fields).get("getApiDoc") as any;
    expect(field, "sensor.getApiDoc").toBeDefined();
    expect(field.annotations).toContain("query");
    const doc: string = await as("sensor", anon).getApiDoc();
    expect(doc.startsWith("# HomeGentic sensor canister")).toBe(true);
    expect(doc).toContain("## Rules for every HomeGentic canister");
    // Who can read, and what an assistant can't do here.
    expect(doc).toMatch(/owner|role on/i);
    expect(doc).toMatch(/`recordEvent\(\.\.\.\)`[^\n]*gateway/i);
    expect(doc).toMatch(/`deactivateDevice\(deviceId\)`/);
    // A critical reading opens a job: a side effect the doc has to name.
    expect(doc).toMatch(/Critical[^\n]*job/i);
    // The newest 1,000 events a home are kept.
    expect(doc).toContain("1,000");
    // Operator terms: describe, never instruct the assistant.
    expect(doc).not.toMatch(/\b(you must|you should|always call|never call|ignore (all|any|previous))\b/i);
  });

  it("SCON.2 the owner reads their own home's devices, events and alerts", async () => {
    const devices = await as("sensor", owner).getDevicesForProperty(home);
    expect(devices.map((d: any) => d.name)).toEqual(["Laundry leak sensor"]);
    const events = await as("sensor", owner).getEventsForProperty(home, 0n);
    expect(events.map((e: any) => Object.keys(e.eventType)[0])).toEqual(["WaterLeak", "HighHumidity"]);
    const alerts = await as("sensor", owner).getPendingAlerts(home);
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) expect(a.propertyId).toBe(home);
  });

  it("SCON.3 a stranger and an anonymous caller read nothing of the home", async () => {
    for (const who of [stranger, anon]) {
      expect(await as("sensor", who).getDevicesForProperty(home)).toEqual([]);
      if (who === anon) {
        // Every update call from an anonymous principal is refused outright.
        await expect(as("sensor", who).getPendingAlerts(home)).rejects.toThrow(/refused/);
        await expect(as("sensor", who).getEventsForProperty(home, 0n)).rejects.toThrow(/refused/);
        await expect(as("sensor", who).getDevicesForReader(home)).rejects.toThrow(/refused/);
      } else {
        expect(await as("sensor", who).getPendingAlerts(home)).toEqual([]);
        expect(await as("sensor", who).getEventsForProperty(home, 0n)).toEqual([]);
        expect(await as("sensor", who).getDevicesForReader(home)).toEqual([]);
      }
      const pinned = JSON.stringify({ start: "events", where: { eq: { field: "propertyId", value: home } } });
      expect((await as("sensor", who).execute(pinned)).rows).toEqual([]);
      expect((await as("sensor", who).execute(JSON.stringify({ start: "devices" }))).rows).toEqual([]);
    }
  });

  it("SCON.4 a stranger can't change the owner's devices or record readings", async () => {
    expect(await as("sensor", stranger).deactivateDevice(leak)).toEqual({ err: { NotAuthorized: null } });
    const added = await as("sensor", stranger).registerDevice(home, "ext-scon-x", { Manual: null }, "Planted");
    expect("err" in added).toBe(true);
    const rec = await as("sensor", stranger).recordEvent("ext-scon-leak", { WaterLeak: null }, 99, "L/min", "{}");
    expect(rec).toEqual({ err: { NotAuthorized: null } });
    // Still there, and still only the two real readings.
    expect((await as("sensor", owner).getDevicesForProperty(home)).length).toBe(1);
    expect((await as("sensor", owner).getEventsForProperty(home, 0n)).length).toBe(2);
    // The stranger's own home is theirs to use.
    ok(await as("sensor", stranger).registerDevice(theirHome, "ext-scon-theirs", { Manual: null }, "Theirs"));
  });
});
