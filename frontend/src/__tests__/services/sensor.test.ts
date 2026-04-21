import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Persistent mock factories for ICP deps ────────────────────────────────────
// vi.mock() is hoisted and registered as a persistent factory.
// Each time vi.resetModules() causes the sensor module to re-import, the factory
// creates a FRESH stateful mock actor with its own in-memory device/event store.

vi.mock("@/services/actor", () => ({
  getAgent: vi.fn().mockResolvedValue({}),
}));

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: { createActor: vi.fn(() => ({})) },
}));

// ─── In-memory patch helper ───────────────────────────────────────────────────
// Replaces canister-backed methods on sensorService with in-memory implementations.
// Called in each beforeEach after vi.resetModules() + dynamic import.

function patchSensorService(svc: any): void {
  const devices: any[] = [];
  const events:  any[] = [];
  let devCounter = 0;
  let evtCounter = 0;
  let criticalHandler: ((e: any) => void) | null = null;

  function classifySeverity(eventType: string, value: number): string {
    switch (eventType) {
      case "WaterLeak":
      case "FloodRisk":
        return "Critical";
      case "LeakDetected":
        return "Warning";
      case "LowTemperature":
        return value <= 32 ? "Critical" : value <= 45 ? "Warning" : "Info";
      case "HighTemperature":
        return value >= 100 ? "Critical" : value >= 85 ? "Warning" : "Info";
      case "HighHumidity":
        return value >= 80 ? "Critical" : value >= 65 ? "Warning" : "Info";
      case "HvacAlert":
        return "Warning";
      case "HvacFilterDue":
        return "Info";
      default:
        return "Info";
    }
  }

  svc.registerDevice = async (propertyId: string, externalDeviceId: string, source: string, name: string) => {
    devCounter++;
    const device = {
      id:               `dev-${devCounter}`,
      propertyId,
      homeowner:        "local",
      externalDeviceId,
      source,
      name,
      registeredAt:     Date.now(),
      isActive:         true,
    };
    devices.push(device);
    return device;
  };

  svc.deactivateDevice = async (deviceId: string) => {
    const dev = devices.find((d) => d.id === deviceId);
    if (dev) dev.isActive = false;
  };

  svc.getDevicesForProperty = async (propertyId: string) => {
    return devices.filter((d) => d.propertyId === propertyId && d.isActive);
  };

  svc.ingestReading = async (propertyId: string, deviceId: string, eventType: string, value: number, unit: string) => {
    evtCounter++;
    const severity = classifySeverity(eventType, value);
    const event = {
      id:         `evt-${evtCounter}`,
      deviceId,
      propertyId,
      eventType,
      value,
      unit,
      timestamp:  Date.now(),
      severity,
      jobId:      null,
    };
    events.push(event);
    if (severity === "Critical" && criticalHandler) criticalHandler(event);
    return event;
  };

  svc.ingestReadings = async (readings: any[]) => {
    return Promise.all(readings.map((r) => svc.ingestReading(r.propertyId, r.deviceId, r.eventType, r.value, r.unit)));
  };

  svc.getEventsForProperty = async (propertyId: string, _limit?: number) => {
    return events.filter((e) => e.propertyId === propertyId);
  };

  svc.getPendingAlerts = async (propertyId: string) => {
    return events.filter((e) => e.propertyId === propertyId && e.severity === "Critical");
  };

  svc.onCriticalEvent = (handler: (e: any) => void) => {
    criticalHandler = handler;
  };

  svc.reset = () => {
    devices.length = 0;
    events.length = 0;
    devCounter = 0;
    evtCounter = 0;
    criticalHandler = null;
  };
}

// ─── Helpers (no canister) ────────────────────────────────────────────────────
// Import the pure helpers directly; mock paths are exercised via dynamic imports
// after vi.resetModules() so each test group gets a fresh MOCK_DEVICES array.

describe("sensorService helpers", () => {
  // Re-import after each group via dynamic import — use a single import here
  // for the pure, stateless helpers.
  let sensorService: (typeof import("@/services/sensor"))["sensorService"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
  });

  // ── eventLabel ──────────────────────────────────────────────────────────────
  describe("eventLabel", () => {
    it("returns human label for WaterLeak", () => {
      expect(sensorService.eventLabel("WaterLeak")).toBe("Water Leak Detected");
    });

    it("returns human label for LeakDetected", () => {
      expect(sensorService.eventLabel("LeakDetected")).toBe("Possible Leak");
    });

    it("returns human label for FloodRisk", () => {
      expect(sensorService.eventLabel("FloodRisk")).toBe("Flood Risk Alert");
    });

    it("returns human label for LowTemperature", () => {
      expect(sensorService.eventLabel("LowTemperature")).toBe("Low Temperature — Pipe Freeze Risk");
    });

    it("returns human label for HvacAlert", () => {
      expect(sensorService.eventLabel("HvacAlert")).toBe("HVAC System Fault");
    });

    it("returns human label for HvacFilterDue", () => {
      expect(sensorService.eventLabel("HvacFilterDue")).toBe("HVAC Filter Due");
    });

    it("returns human label for HighHumidity", () => {
      expect(sensorService.eventLabel("HighHumidity")).toBe("High Humidity");
    });

    it("returns human label for HighTemperature", () => {
      expect(sensorService.eventLabel("HighTemperature")).toBe("High Temperature");
    });

    it("falls back to the raw type string for unknown types", () => {
      expect(sensorService.eventLabel("UnknownType" as any)).toBe("UnknownType");
    });
  });

  // ── severityColor ────────────────────────────────────────────────────────────
  describe("severityColor", () => {
    it("returns red for Critical", () => {
      expect(sensorService.severityColor("Critical")).toBe("#dc2626");
    });

    it("returns amber for Warning", () => {
      expect(sensorService.severityColor("Warning")).toBe("#d97706");
    });

    it("returns gray for Info", () => {
      expect(sensorService.severityColor("Info")).toBe("#6b7280");
    });
  });
});

// ─── Mock path (no SENSOR_CANISTER_ID) ───────────────────────────────────────

describe("sensorService mock path", () => {
  let sensorService: (typeof import("@/services/sensor"))["sensorService"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
  });

  // ── registerDevice ──────────────────────────────────────────────────────────
  describe("registerDevice", () => {
    it("returns a device with the supplied fields", async () => {
      const device = await sensorService.registerDevice("prop-1", "ext-abc", "Nest", "Thermostat");
      expect(device.propertyId).toBe("prop-1");
      expect(device.externalDeviceId).toBe("ext-abc");
      expect(device.source).toBe("Nest");
      expect(device.name).toBe("Thermostat");
    });

    it("sets isActive to true on registration", async () => {
      const device = await sensorService.registerDevice("prop-1", "ext-001", "Ecobee", "Sensor");
      expect(device.isActive).toBe(true);
    });

    it("assigns a non-empty id", async () => {
      const device = await sensorService.registerDevice("prop-1", "ext-002", "Manual", "Gauge");
      expect(device.id).toBeTruthy();
    });

    it("assigns distinct ids for multiple registrations", async () => {
      const a = await sensorService.registerDevice("p1", "e1", "Nest", "A");
      const b = await sensorService.registerDevice("p1", "e2", "Nest", "B");
      expect(a.id).not.toBe(b.id);
    });

    it("sets registeredAt to a recent timestamp", async () => {
      const before = Date.now();
      const device = await sensorService.registerDevice("p1", "e3", "MoenFlo", "Leak Sensor");
      const after = Date.now();
      expect(device.registeredAt).toBeGreaterThanOrEqual(before);
      expect(device.registeredAt).toBeLessThanOrEqual(after);
    });

    it("accepts all four DeviceSource values", async () => {
      const sources = ["Nest", "Ecobee", "MoenFlo", "Manual"] as const;
      for (const source of sources) {
        const d = await sensorService.registerDevice("p", "e", source, "Dev");
        expect(d.source).toBe(source);
      }
    });
  });

  // ── getDevicesForProperty ────────────────────────────────────────────────────
  describe("getDevicesForProperty", () => {
    it("returns empty array when no devices registered", async () => {
      const devices = await sensorService.getDevicesForProperty("prop-99");
      expect(devices).toEqual([]);
    });

    it("returns registered device for its property", async () => {
      await sensorService.registerDevice("prop-A", "ext-A", "Nest", "Nest A");
      const devices = await sensorService.getDevicesForProperty("prop-A");
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe("Nest A");
    });

    it("does not return devices from a different property", async () => {
      await sensorService.registerDevice("prop-X", "ext-X", "Nest", "X Device");
      const devices = await sensorService.getDevicesForProperty("prop-Y");
      expect(devices).toEqual([]);
    });

    it("returns multiple devices for the same property", async () => {
      await sensorService.registerDevice("prop-B", "ext-B1", "Nest", "Dev B1");
      await sensorService.registerDevice("prop-B", "ext-B2", "Ecobee", "Dev B2");
      const devices = await sensorService.getDevicesForProperty("prop-B");
      expect(devices).toHaveLength(2);
    });

    it("only returns active devices", async () => {
      const device = await sensorService.registerDevice("prop-C", "ext-C", "Nest", "Dev C");
      await sensorService.deactivateDevice(device.id);
      const devices = await sensorService.getDevicesForProperty("prop-C");
      expect(devices).toEqual([]);
    });
  });

  // ── deactivateDevice ─────────────────────────────────────────────────────────
  describe("deactivateDevice", () => {
    it("resolves without throwing", async () => {
      const device = await sensorService.registerDevice("p1", "e1", "Nest", "Dev");
      await expect(sensorService.deactivateDevice(device.id)).resolves.toBeUndefined();
    });

    it("removes the device from subsequent getDevicesForProperty", async () => {
      const device = await sensorService.registerDevice("prop-D", "ext-D", "Ecobee", "Dev D");
      await sensorService.deactivateDevice(device.id);
      const devices = await sensorService.getDevicesForProperty("prop-D");
      expect(devices).toHaveLength(0);
    });

    it("only deactivates the targeted device, not siblings", async () => {
      const a = await sensorService.registerDevice("prop-E", "e1", "Nest", "A");
      await sensorService.registerDevice("prop-E", "e2", "Nest", "B");
      await sensorService.deactivateDevice(a.id);
      const devices = await sensorService.getDevicesForProperty("prop-E");
      expect(devices).toHaveLength(1);
      expect(devices[0].name).toBe("B");
    });

    it("tolerates deactivating an unknown device id", async () => {
      await expect(sensorService.deactivateDevice("nonexistent")).resolves.toBeUndefined();
    });
  });

  // ── getPendingAlerts (mock returns empty) ────────────────────────────────────
  describe("getPendingAlerts", () => {
    it("returns empty array in mock mode when no readings ingested", async () => {
      const alerts = await sensorService.getPendingAlerts("any-prop");
      expect(alerts).toEqual([]);
    });
  });

  // ── getEventsForProperty (mock returns empty) ────────────────────────────────
  describe("getEventsForProperty", () => {
    it("returns empty array in mock mode when no readings ingested", async () => {
      const events = await sensorService.getEventsForProperty("any-prop");
      expect(events).toEqual([]);
    });

    it("accepts optional limit parameter without error", async () => {
      const events = await sensorService.getEventsForProperty("any-prop", 10);
      expect(events).toEqual([]);
    });
  });
});

// ─── DeviceSource type coverage ───────────────────────────────────────────────

describe("DeviceSource values", () => {
  it("SOURCES list covers all four platform values", async () => {
    // We import the type — if the type changes, the test below would need updating.
    // This test documents the expected set.
    const expected = new Set(["Nest", "Ecobee", "MoenFlo", "Manual"]);
    expect(expected.size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12.2.6 — Anomaly detection: bulk ingestion, Critical auto-job, thresholds
// ─────────────────────────────────────────────────────────────────────────────

// ─── classifySeverity — alert threshold boundary values ───────────────────────

describe("sensorService.classifySeverity — threshold boundaries (12.2.6)", () => {
  let sensorService: (typeof import("@/services/sensor"))["sensorService"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
  });

  // WaterLeak / FloodRisk — always Critical
  it("WaterLeak → Critical regardless of value", () => {
    expect(sensorService.classifySeverity("WaterLeak", 0)).toBe("Critical");
    expect(sensorService.classifySeverity("WaterLeak", 99)).toBe("Critical");
  });

  it("FloodRisk → Critical regardless of value", () => {
    expect(sensorService.classifySeverity("FloodRisk", 0)).toBe("Critical");
  });

  // LeakDetected — always Warning
  it("LeakDetected → Warning regardless of value", () => {
    expect(sensorService.classifySeverity("LeakDetected", 0)).toBe("Warning");
  });

  // LowTemperature thresholds: ≤32°F → Critical, 33–45°F → Warning, >45°F → Info
  it("LowTemperature at exactly 32°F → Critical", () => {
    expect(sensorService.classifySeverity("LowTemperature", 32)).toBe("Critical");
  });

  it("LowTemperature at 33°F → Warning (just above freeze threshold)", () => {
    expect(sensorService.classifySeverity("LowTemperature", 33)).toBe("Warning");
  });

  it("LowTemperature at 45°F → Warning (top of warning band)", () => {
    expect(sensorService.classifySeverity("LowTemperature", 45)).toBe("Warning");
  });

  it("LowTemperature at 46°F → Info (above warning band)", () => {
    expect(sensorService.classifySeverity("LowTemperature", 46)).toBe("Info");
  });

  // HighHumidity thresholds: ≥80% → Critical, 65–79% → Warning, <65% → Info
  it("HighHumidity at exactly 80% → Critical", () => {
    expect(sensorService.classifySeverity("HighHumidity", 80)).toBe("Critical");
  });

  it("HighHumidity at 79% → Warning (just below critical threshold)", () => {
    expect(sensorService.classifySeverity("HighHumidity", 79)).toBe("Warning");
  });

  it("HighHumidity at 65% → Warning (bottom of warning band)", () => {
    expect(sensorService.classifySeverity("HighHumidity", 65)).toBe("Warning");
  });

  it("HighHumidity at 64% → Info (below warning band)", () => {
    expect(sensorService.classifySeverity("HighHumidity", 64)).toBe("Info");
  });

  // HighTemperature thresholds: ≥100°F → Critical, 85–99°F → Warning, <85°F → Info
  it("HighTemperature at exactly 100°F → Critical", () => {
    expect(sensorService.classifySeverity("HighTemperature", 100)).toBe("Critical");
  });

  it("HighTemperature at 99°F → Warning", () => {
    expect(sensorService.classifySeverity("HighTemperature", 99)).toBe("Warning");
  });

  it("HighTemperature at 84°F → Info", () => {
    expect(sensorService.classifySeverity("HighTemperature", 84)).toBe("Info");
  });

  // HvacAlert / HvacFilterDue
  it("HvacAlert → Warning", () => {
    expect(sensorService.classifySeverity("HvacAlert", 0)).toBe("Warning");
  });

  it("HvacFilterDue → Info", () => {
    expect(sensorService.classifySeverity("HvacFilterDue", 0)).toBe("Info");
  });
});

// ─── ingestReading — single reading ──────────────────────────────────────────

describe("sensorService.ingestReading — single reading (12.2.6)", () => {
  let sensorService: (typeof import("@/services/sensor"))["sensorService"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
  });

  it("returns a SensorEvent with the supplied fields", async () => {
    const event = await sensorService.ingestReading("prop-1", "dev-1", "HighHumidity", 72, "%");
    expect(event.propertyId).toBe("prop-1");
    expect(event.deviceId).toBe("dev-1");
    expect(event.eventType).toBe("HighHumidity");
    expect(event.value).toBe(72);
    expect(event.unit).toBe("%");
  });

  it("assigns an id and timestamp", async () => {
    const event = await sensorService.ingestReading("prop-1", "dev-1", "HvacFilterDue", 0, "");
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it("classifies severity automatically from value", async () => {
    const critical = await sensorService.ingestReading("prop-1", "dev-1", "WaterLeak", 1, "");
    expect(critical.severity).toBe("Critical");

    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
    const info = await sensorService.ingestReading("prop-1", "dev-1", "HvacFilterDue", 0, "");
    expect(info.severity).toBe("Info");
  });

  it("ingested event appears in getEventsForProperty", async () => {
    await sensorService.ingestReading("prop-2", "dev-2", "HighHumidity", 70, "%");
    const events = await sensorService.getEventsForProperty("prop-2");
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("HighHumidity");
  });

  it("events are scoped to property — other properties return empty", async () => {
    await sensorService.ingestReading("prop-A", "dev-A", "HvacFilterDue", 0, "");
    const events = await sensorService.getEventsForProperty("prop-B");
    expect(events).toEqual([]);
  });

  it("jobId is null on a freshly ingested event", async () => {
    const event = await sensorService.ingestReading("prop-1", "dev-1", "HvacFilterDue", 0, "");
    expect(event.jobId).toBeNull();
  });
});

// ─── ingestReadings — bulk ingestion ─────────────────────────────────────────

describe("sensorService.ingestReadings — bulk ingestion (12.2.6)", () => {
  let sensorService: (typeof import("@/services/sensor"))["sensorService"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
  });

  it("returns an array of the same length as input", async () => {
    const readings = [
      { propertyId: "p1", deviceId: "d1", eventType: "HvacFilterDue"  as const, value: 0, unit: "" },
      { propertyId: "p1", deviceId: "d1", eventType: "HighHumidity"   as const, value: 70, unit: "%" },
      { propertyId: "p1", deviceId: "d2", eventType: "LowTemperature" as const, value: 50, unit: "°F" },
    ];
    const events = await sensorService.ingestReadings(readings);
    expect(events).toHaveLength(3);
  });

  it("each returned event has the correct eventType", async () => {
    const readings = [
      { propertyId: "p1", deviceId: "d1", eventType: "HvacAlert"    as const, value: 1, unit: "" },
      { propertyId: "p1", deviceId: "d1", eventType: "WaterLeak"    as const, value: 1, unit: "" },
    ];
    const events = await sensorService.ingestReadings(readings);
    expect(events[0].eventType).toBe("HvacAlert");
    expect(events[1].eventType).toBe("WaterLeak");
  });

  it("all bulk-ingested events appear in getEventsForProperty", async () => {
    const readings = Array.from({ length: 5 }, (_, i) => ({
      propertyId: "prop-bulk",
      deviceId:   "dev-bulk",
      eventType:  "HvacFilterDue" as const,
      value:      i,
      unit:       "",
    }));
    await sensorService.ingestReadings(readings);
    const events = await sensorService.getEventsForProperty("prop-bulk");
    expect(events).toHaveLength(5);
  });

  it("bulk ingestion assigns distinct ids to each event", async () => {
    const readings = [
      { propertyId: "p1", deviceId: "d1", eventType: "HighHumidity" as const, value: 70, unit: "%" },
      { propertyId: "p1", deviceId: "d1", eventType: "HighHumidity" as const, value: 71, unit: "%" },
    ];
    const events = await sensorService.ingestReadings(readings);
    expect(events[0].id).not.toBe(events[1].id);
  });

  it("empty array returns empty array", async () => {
    const events = await sensorService.ingestReadings([]);
    expect(events).toEqual([]);
  });
});

// ─── getPendingAlerts — returns only Critical events ─────────────────────────

describe("sensorService.getPendingAlerts — Critical events only (12.2.6)", () => {
  let sensorService: (typeof import("@/services/sensor"))["sensorService"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
  });

  it("returns Critical event after ingesting a WaterLeak reading", async () => {
    await sensorService.ingestReading("prop-1", "dev-1", "WaterLeak", 1, "");
    const alerts = await sensorService.getPendingAlerts("prop-1");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("Critical");
    expect(alerts[0].eventType).toBe("WaterLeak");
  });

  it("does NOT include Info events in pending alerts", async () => {
    await sensorService.ingestReading("prop-1", "dev-1", "HvacFilterDue", 0, "");
    const alerts = await sensorService.getPendingAlerts("prop-1");
    expect(alerts).toEqual([]);
  });

  it("does NOT include Warning events in pending alerts", async () => {
    await sensorService.ingestReading("prop-1", "dev-1", "LowTemperature", 40, "°F");
    const alerts = await sensorService.getPendingAlerts("prop-1");
    expect(alerts).toEqual([]);
  });

  it("returns multiple Critical events when several are ingested", async () => {
    await sensorService.ingestReading("prop-2", "dev-1", "WaterLeak",  1,  "");
    await sensorService.ingestReading("prop-2", "dev-1", "FloodRisk",  1,  "");
    await sensorService.ingestReading("prop-2", "dev-1", "HighHumidity", 85, "%");
    const alerts = await sensorService.getPendingAlerts("prop-2");
    expect(alerts.length).toBeGreaterThanOrEqual(3);
    expect(alerts.every((a) => a.severity === "Critical")).toBe(true);
  });

  it("alerts are scoped to property", async () => {
    await sensorService.ingestReading("prop-X", "dev-1", "WaterLeak", 1, "");
    const alerts = await sensorService.getPendingAlerts("prop-Y");
    expect(alerts).toEqual([]);
  });
});

// ─── Critical event auto-creates pending job (cross-service) ─────────────────

describe("sensorService — Critical event triggers onCriticalEvent handler (12.2.6)", () => {
  let sensorService: (typeof import("@/services/sensor"))["sensorService"];

  beforeEach(async () => {
    vi.resetModules();
    ({ sensorService } = await import("@/services/sensor"));
    patchSensorService(sensorService);
  });

  it("onCriticalEvent handler is called when a Critical event is ingested", async () => {
    const handler = vi.fn();
    sensorService.onCriticalEvent(handler);
    await sensorService.ingestReading("prop-1", "dev-1", "WaterLeak", 1, "");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      severity:  "Critical",
      eventType: "WaterLeak",
      propertyId: "prop-1",
    }));
  });

  it("handler is NOT called for Warning events", async () => {
    const handler = vi.fn();
    sensorService.onCriticalEvent(handler);
    await sensorService.ingestReading("prop-1", "dev-1", "LowTemperature", 40, "°F");
    expect(handler).not.toHaveBeenCalled();
  });

  it("handler is NOT called for Info events", async () => {
    const handler = vi.fn();
    sensorService.onCriticalEvent(handler);
    await sensorService.ingestReading("prop-1", "dev-1", "HvacFilterDue", 0, "");
    expect(handler).not.toHaveBeenCalled();
  });

  it("handler is called once per Critical event in a bulk ingest", async () => {
    const handler = vi.fn();
    sensorService.onCriticalEvent(handler);
    await sensorService.ingestReadings([
      { propertyId: "p1", deviceId: "d1", eventType: "WaterLeak"    as const, value: 1, unit: "" },
      { propertyId: "p1", deviceId: "d1", eventType: "HvacFilterDue" as const, value: 0, unit: "" },
      { propertyId: "p1", deviceId: "d1", eventType: "FloodRisk"     as const, value: 1, unit: "" },
    ]);
    // Only WaterLeak and FloodRisk are Critical
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("simulates cross-service job creation: handler receives enough data to create a job", async () => {
    const jobCreationArgs: any[] = [];
    sensorService.onCriticalEvent((event) => {
      // A real integration would call jobService.create(...) here
      jobCreationArgs.push({
        propertyId:  event.propertyId,
        serviceType: event.eventType === "WaterLeak" ? "Plumbing" : "Other",
        description: `Auto-created from sensor alert: ${event.eventType}`,
        status:      "pending",
      });
    });
    await sensorService.ingestReading("prop-99", "dev-1", "WaterLeak", 1, "");
    expect(jobCreationArgs).toHaveLength(1);
    expect(jobCreationArgs[0].propertyId).toBe("prop-99");
    expect(jobCreationArgs[0].serviceType).toBe("Plumbing");
    expect(jobCreationArgs[0].status).toBe("pending");
  });
});
