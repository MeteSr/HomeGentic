/**
 * Sensor canister — upgrade persistence tests
 *
 * Verifies that all device source variants and event type variants introduced
 * across multiple sprints (including LGThinQ, GESmartHQ, ApplianceFault,
 * ApplianceMaintenance) survive a canister upgrade without data loss.
 *
 * Run (from WSL):
 *   cd tests/upgrade && POCKET_IC_BIN=~/.local/bin/pocket-ic npm test
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, sensorIdlFactory } from "./__helpers__/setup";

const WASM = wasmPath("sensor");

interface SensorActor {
  addAdmin:              (p: object, nonce: string) => Promise<{ ok: null } | { err: object }>;
  setBootstrapNonce:     (nonce: string) => Promise<void>;
  registerDevice:        (propertyId: string, externalDeviceId: string, source: object, name: string) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  recordEvent:           (externalDeviceId: string, eventType: object, value: number, unit: string, rawPayload: string) => Promise<{ ok: Record<string, unknown> } | { err: object }>;
  getDevicesForProperty: (propertyId: string) => Promise<Record<string, unknown>[]>;
  getEventsForProperty:  (propertyId: string, limit: bigint) => Promise<Record<string, unknown>[]>;
  getMetrics:            () => Promise<Record<string, bigint | boolean>>;
}

function ok<T>(result: { ok: T } | { err: object }): T {
  if ("err" in result) throw new Error(`Expected ok, got err: ${JSON.stringify(result.err)}`);
  return result.ok;
}

describe("sensor canister — upgrade persistence", () => {
  let pic:        PocketIc;
  let actor:      SensorActor;
  let canisterId: import("@dfinity/principal").Principal;

  const PROPERTY_ID = "PROP-UPGRADE-TEST";
  const DEVICES = [
    { extId: "nest-001",   source: { Nest: null },   name: "Living Room Nest" },
    { extId: "eco-001",    source: { Ecobee: null },  name: "Upstairs Ecobee" },
    { extId: "moen-001",   source: { MoenFlo: null }, name: "Kitchen Flo" },
    { extId: "manual-001", source: { Manual: null },  name: "Basement Sensor" },
  ];
  const EVENTS = [
    { extId: "nest-001",   eventType: { LowTemperature: null },    value: 2.5,  unit: "°C"   },
    { extId: "eco-001",    eventType: { HighHumidity: null },       value: 75,   unit: "%RH"  },
    { extId: "moen-001",   eventType: { WaterLeak: null },          value: 5,    unit: "L/min"},
    { extId: "manual-001", eventType: { ApplianceMaintenance: null }, value: 0, unit: ""      },
  ];

  beforeAll(async () => {
    pic = await createPic();
    const alice = createIdentity("alice");

    const fixture = await pic.setupCanister<SensorActor>({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      idlFactory: sensorIdlFactory as any,
      wasm: WASM,
      sender: alice.getPrincipal(),
    });
    canisterId = fixture.canisterId;
    actor = fixture.actor;
    actor.setIdentity(alice);

    // Bootstrap alice as admin (H-20: nonce-gated)
    await actor.setBootstrapNonce("test-nonce");
    ok(await actor.addAdmin(alice.getPrincipal(), "test-nonce"));

    // Register 4 devices covering 4 different DeviceSource variants
    for (const d of DEVICES) {
      ok(await actor.registerDevice(PROPERTY_ID, d.extId, d.source, d.name));
    }

    // Record one event per device — covers multiple SensorEventType variants
    for (const e of EVENTS) {
      ok(await actor.recordEvent(e.extId, e.eventType, e.value, e.unit, "{}"));
    }
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("all 4 devices survive upgrade", async () => {
    const before = await actor.getDevicesForProperty(PROPERTY_ID);
    expect(before.length).toBe(4);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getDevicesForProperty(PROPERTY_ID);
    expect(after.length).toBe(4);
  });

  it("DeviceSource variants are preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const devices = await actor.getDevicesForProperty(PROPERTY_ID);
    const sourceNames = devices.map((d: any) => Object.keys(d.source)[0]).sort();
    expect(sourceNames).toEqual(["Ecobee", "Manual", "MoenFlo", "Nest"]);
  });

  it("all 4 events survive upgrade", async () => {
    const before = await actor.getEventsForProperty(PROPERTY_ID, BigInt(10));
    expect(before.length).toBe(4);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getEventsForProperty(PROPERTY_ID, BigInt(10));
    expect(after.length).toBe(4);
  });

  it("SensorEventType variants are preserved across upgrade", async () => {
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const events = await actor.getEventsForProperty(PROPERTY_ID, BigInt(10));
    const typeNames = events.map((e: any) => Object.keys(e.eventType)[0]).sort();
    expect(typeNames).toContain("LowTemperature");
    expect(typeNames).toContain("HighHumidity");
    expect(typeNames).toContain("WaterLeak");
    expect(typeNames).toContain("ApplianceMaintenance");
  });

  it("numeric values are preserved across upgrade", async () => {
    const before = await actor.getEventsForProperty(PROPERTY_ID, BigInt(10));
    const nestEvent: any = before.find((e: any) => Object.keys(e.eventType)[0] === "LowTemperature");
    expect(nestEvent.value).toBeCloseTo(2.5);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getEventsForProperty(PROPERTY_ID, BigInt(10));
    const nestAfter: any = after.find((e: any) => Object.keys(e.eventType)[0] === "LowTemperature");
    expect(nestAfter.value).toBeCloseTo(2.5);
    expect(nestAfter.unit).toBe("°C");
  });

  it("metrics counters are preserved across upgrade", async () => {
    const before = await actor.getMetrics();
    expect(Number(before.totalDevices)).toBe(4);
    expect(Number(before.totalEvents)).toBe(4);
    expect(before.isPaused).toBe(false);

    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getMetrics();
    expect(Number(after.totalDevices)).toBe(Number(before.totalDevices));
    expect(Number(after.totalEvents)).toBe(Number(before.totalEvents));
  });

  it("device names are preserved across three successive upgrades", async () => {
    const before = await actor.getDevicesForProperty(PROPERTY_ID);
    const namesBefore = before.map((d: any) => d.name as string).sort();

    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });
    await pic.upgradeCanister({ canisterId, wasm: WASM });

    const after = await actor.getDevicesForProperty(PROPERTY_ID);
    const namesAfter = after.map((d: any) => d.name as string).sort();
    expect(namesAfter).toEqual(namesBefore);
  });
});
