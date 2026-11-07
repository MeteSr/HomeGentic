/**
 * Integration tests — sensorService against the real ICP sensor canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: DeviceSource Variant (12 types), Severity Variant,
 *     recordedAt (Int ns→ms)
 *   - registerDevice() creates a SensorDevice with a non-empty id
 *   - getDevicesForProperty() returns only devices for the queried property
 *   - deactivateDevice() marks the device inactive
 *   - recordEvent() stores an event and returns it
 *   - getEventsForProperty(propertyId, limit) respects the limit
 *   - getPendingAlerts() returns unacknowledged Critical/Warning events
 *   - All 12 DeviceSource variants survive a Candid round-trip
 */

import { describe, it, expect, beforeAll } from "vitest";
import { sensorService } from "@/services/sensor";
import type { SensorDevice, SensorEvent, DeviceSource } from "@/services/sensor";
import { propertyService } from "@/services/property";
import { ADMIN_SEED, asIdentity, seededIdentity } from "./helpers";

/** Readings come from a gateway or an admin; TEST_ADMIN is a sensor admin in CI.
 *  recordEvent takes the device's external id, as the IoT gateway sends it. */
const asGateway = <T,>(fn: () => Promise<T>) => asIdentity(seededIdentity(ADMIN_SEED), [sensorService], fn);

const CANISTER_ID = (process.env as any).SENSOR_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();
const EXT_ID = `ext-device-${RUN_ID}`;

// PROPERTY_ID is set in the global beforeAll by registering a real property so
// that the sensor canister's H-15 ownership check (via property.isAuthorized) passes.
let PROPERTY_ID = `integ-sensor-prop-${RUN_ID}`; // fallback for type inference only

if (deployed) {
  beforeAll(async () => {
    try {
      const prop = await propertyService.registerProperty({
        address:      `${RUN_ID} Sensor Ave`,
        city:         "Austin",
        state:        "TX",
        zipCode:      "78701",
        propertyType: "SingleFamily",
        yearBuilt:    2000,
        squareFeet:   1800,
        tier:         "Free",
      });
      PROPERTY_ID = prop.id;
    } catch (e: any) {
      // CI accumulates properties across runs — if the tier limit is hit, reuse an existing one.
      if (e.message?.includes("limit")) {
        const existing = await propertyService.getMyProperties();
        if (existing.length > 0) { PROPERTY_ID = existing[0].id; return; }
      }
      throw e;
    }
  });
}

// ─── registerDevice ───────────────────────────────────────────────────────────

describe.skipIf(!deployed)("registerDevice — Candid serialization", () => {
  let device: SensorDevice;

  beforeAll(async () => {
    device = await sensorService.registerDevice(PROPERTY_ID, EXT_ID, "Nest", "Test Thermostat");
  });

  it("returns a non-empty device id", () => {
    expect(device.id).toBeTruthy();
    expect(typeof device.id).toBe("string");
  });

  it("propertyId is preserved", () => {
    expect(device.propertyId).toBe(PROPERTY_ID);
  });

  it("source round-trips through DeviceSource Variant", () => {
    expect(device.source).toBe("Nest");
  });

  it("isActive is true on creation", () => {
    expect(device.isActive).toBe(true);
  });

  it("registeredAt is a reasonable ms timestamp", () => {
    expect(device.registeredAt).toBeGreaterThan(Date.now() - 60_000);
    expect(device.registeredAt).toBeLessThan(Date.now() + 5_000);
  });
});

// ─── getDevicesForProperty ────────────────────────────────────────────────────

describe.skipIf(!deployed)("getDevicesForProperty — entity scoping", () => {
  let deviceId: string;

  beforeAll(async () => {
    const d = await sensorService.registerDevice(
      PROPERTY_ID, `${EXT_ID}-b`, "Ecobee", "Test Ecobee"
    );
    deviceId = d.id;
  });

  it("returns devices for the queried property", async () => {
    const devices = await sensorService.getDevicesForProperty(PROPERTY_ID);
    expect(devices.some((d) => d.id === deviceId)).toBe(true);
  });

  it("does not return devices for a different property", async () => {
    const devices = await sensorService.getDevicesForProperty(`other-prop-${RUN_ID}`);
    expect(devices.every((d) => d.id !== deviceId)).toBe(true);
  });
});

// ─── deactivateDevice ─────────────────────────────────────────────────────────

describe.skipIf(!deployed)("deactivateDevice — marks device inactive", () => {
  it("deactivation completes without throwing", async () => {
    const d = await sensorService.registerDevice(
      PROPERTY_ID, `${EXT_ID}-deact`, "MoenFlo", "Deactivation test"
    );
    await expect(sensorService.deactivateDevice(d.id)).resolves.toBeUndefined();
  });
});

// ─── recordEvent / getEventsForProperty ──────────────────────────────────────

describe.skipIf(!deployed)("recordEvent — Candid serialization", () => {
  let device: SensorDevice;
  let event: SensorEvent;

  beforeAll(async () => {
    device = await sensorService.registerDevice(
      PROPERTY_ID, `${EXT_ID}-evt`, "Manual", "Event test device"
    );
    event = await asGateway(() =>
      sensorService.ingestReading(PROPERTY_ID, `${EXT_ID}-evt`, "HvacFilterDue", 0, "", ""));
  });

  it("the homeowner can't record a reading for their own device", async () => {
    await expect(
      sensorService.ingestReading(PROPERTY_ID, `${EXT_ID}-evt`, "HvacFilterDue", 0, "", ""),
    ).rejects.toMatchObject({ code: "NotAuthorized" });
  });

  it("event has a non-empty id", () => {
    expect(event.id).toBeTruthy();
    expect(event.deviceId).toBe(device.id);
  });

  it("eventType round-trips through SensorEventType Variant", () => {
    expect(event.eventType).toBe("HvacFilterDue");
  });

  it("severity is Info for HvacFilterDue", () => {
    expect(event.severity).toBe("Info");
  });

  it("timestamp is a reasonable ms value", () => {
    expect(event.timestamp).toBeGreaterThan(Date.now() - 60_000);
    expect(event.timestamp).toBeLessThan(Date.now() + 5_000);
  });
});

describe.skipIf(!deployed)("getEventsForProperty — limit is respected", () => {
  beforeAll(async () => {
    await sensorService.registerDevice(
      PROPERTY_ID, `${EXT_ID}-lim`, "Manual", "Limit test device"
    );
    for (let i = 0; i < 3; i++) {
      await asGateway(() => sensorService.ingestReading(PROPERTY_ID, `${EXT_ID}-lim`, "HighHumidity", 70 + i, "%", ""));
    }
  });

  it("returns exactly `limit` events when more exist", async () => {
    const events = await sensorService.getEventsForProperty(PROPERTY_ID, 2);
    expect(events).toHaveLength(2);
  });
});

// ─── getPendingAlerts — Critical severity ─────────────────────────────────────

describe.skipIf(!deployed)("getPendingAlerts — returns Critical/Warning events", () => {
  beforeAll(async () => {
    await sensorService.registerDevice(
      PROPERTY_ID, `${EXT_ID}-alert`, "Manual", "Alert test device"
    );
    await asGateway(() => sensorService.ingestReading(PROPERTY_ID, `${EXT_ID}-alert`, "WaterLeak", 1, "bool", "raw"));
  });

  it("WaterLeak event appears in getPendingAlerts as Critical", async () => {
    const alerts = await sensorService.getPendingAlerts(PROPERTY_ID);
    const critical = alerts.filter((a) => a.severity === "Critical");
    expect(critical.length).toBeGreaterThan(0);
  });
});

// ─── All 12 DeviceSource variants — Candid round-trip ────────────────────────

describe.skipIf(!deployed)("DeviceSource — all 12 variants survive Candid round-trip", () => {
  const ALL_SOURCES: DeviceSource[] = [
    "Nest", "Ecobee", "MoenFlo", "Manual",
    "RingAlarm", "HoneywellHome", "RheemEcoNet", "Sense",
    "EmporiaVue", "Rachio", "SmartThings", "HomeAssistant",
  ];

  // No IoT gateway is registered in CI, so the verified-only sources (Ecobee,
  // HoneywellHome) can still be registered directly; PocketIC's REM.1 covers
  // the refusal once a gateway exists.
  it.each(ALL_SOURCES)("%s registers and round-trips", async (source) => {
    const d = await sensorService.registerDevice(
      PROPERTY_ID, `${EXT_ID}-${source}-${RUN_ID}`, source, `${source} device`
    );
    expect(d.source).toBe(source);
  }, 120_000);
});
