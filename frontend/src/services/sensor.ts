import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";

const SENSOR_CANISTER_ID = (process.env as any).SENSOR_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

export const idlFactory = ({ IDL }: any) => {
  const DeviceSource = IDL.Variant({
    Nest: IDL.Null, Ecobee: IDL.Null, MoenFlo: IDL.Null, Manual: IDL.Null,
  });
  const SensorEventType = IDL.Variant({
    WaterLeak:       IDL.Null,
    LeakDetected:    IDL.Null,
    FloodRisk:       IDL.Null,
    LowTemperature:  IDL.Null,
    HvacAlert:       IDL.Null,
    HvacFilterDue:   IDL.Null,
    HighHumidity:    IDL.Null,
    HighTemperature: IDL.Null,
  });
  const Severity = IDL.Variant({ Info: IDL.Null, Warning: IDL.Null, Critical: IDL.Null });
  const SensorDevice = IDL.Record({
    id:               IDL.Text,
    propertyId:       IDL.Text,
    homeowner:        IDL.Principal,
    externalDeviceId: IDL.Text,
    source:           DeviceSource,
    name:             IDL.Text,
    registeredAt:     IDL.Int,
    isActive:         IDL.Bool,
  });
  const SensorEvent = IDL.Record({
    id:         IDL.Text,
    deviceId:   IDL.Text,
    propertyId: IDL.Text,
    homeowner:  IDL.Principal,
    eventType:  SensorEventType,
    value:      IDL.Float64,
    unit:       IDL.Text,
    rawPayload: IDL.Text,
    timestamp:  IDL.Int,
    severity:   Severity,
    jobId:      IDL.Opt(IDL.Text),
  });
  const Error = IDL.Variant({
    NotFound:     IDL.Null,
    Unauthorized: IDL.Null,
    InvalidInput: IDL.Text,
    AlreadyExists: IDL.Null,
  });
  return IDL.Service({
    registerDevice: IDL.Func(
      [IDL.Text, IDL.Text, DeviceSource, IDL.Text],
      [IDL.Variant({ ok: SensorDevice, err: Error })],
      []
    ),
    deactivateDevice: IDL.Func(
      [IDL.Text],
      [IDL.Variant({ ok: IDL.Null, err: Error })],
      []
    ),
    recordEvent: IDL.Func(
      [IDL.Text, SensorEventType, IDL.Float64, IDL.Text, IDL.Text],
      [IDL.Variant({ ok: SensorEvent, err: Error })],
      []
    ),
    getDevicesForProperty: IDL.Func([IDL.Text], [IDL.Vec(SensorDevice)], ["query"]),
    getEventsForProperty:  IDL.Func([IDL.Text, IDL.Nat], [IDL.Vec(SensorEvent)], ["query"]),
    getPendingAlerts:      IDL.Func([IDL.Text], [IDL.Vec(SensorEvent)], ["query"]),
  });
};

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type DeviceSource = "Nest" | "Ecobee" | "MoenFlo" | "Manual";
export type SensorEventType =
  | "WaterLeak" | "LeakDetected" | "FloodRisk"
  | "LowTemperature" | "HvacAlert" | "HvacFilterDue"
  | "HighHumidity" | "HighTemperature";
export type Severity = "Info" | "Warning" | "Critical";

export interface SensorDevice {
  id:               string;
  propertyId:       string;
  homeowner:        string;  // principal text
  externalDeviceId: string;
  source:           DeviceSource;
  name:             string;
  registeredAt:     number;  // ms
  isActive:         boolean;
}

export interface SensorEvent {
  id:         string;
  deviceId:   string;
  propertyId: string;
  eventType:  SensorEventType;
  value:      number;
  unit:       string;
  timestamp:  number;  // ms
  severity:   Severity;
  jobId:      string | null;
}

// ─── Converters ───────────────────────────────────────────────────────────────

function fromDevice(raw: any): SensorDevice {
  return {
    id:               raw.id,
    propertyId:       raw.propertyId,
    homeowner:        raw.homeowner.toText(),
    externalDeviceId: raw.externalDeviceId,
    source:           Object.keys(raw.source)[0] as DeviceSource,
    name:             raw.name,
    registeredAt:     Number(raw.registeredAt) / 1_000_000,
    isActive:         raw.isActive,
  };
}

function fromEvent(raw: any): SensorEvent {
  return {
    id:         raw.id,
    deviceId:   raw.deviceId,
    propertyId: raw.propertyId,
    eventType:  Object.keys(raw.eventType)[0] as SensorEventType,
    value:      Number(raw.value),
    unit:       raw.unit,
    timestamp:  Number(raw.timestamp) / 1_000_000,
    severity:   Object.keys(raw.severity)[0] as Severity,
    jobId:      raw.jobId[0] ?? null,
  };
}

// ─── Service factory ──────────────────────────────────────────────────────────

function createSensorService() {
  let _actor: any = null;
  const devices: SensorDevice[] = [];
  let deviceCounter = 0;
  const mockEvents: SensorEvent[] = [];
  let eventCounter = 0;
  let criticalHandler: ((e: SensorEvent) => void) | null = null;

  async function getActor() {
    if (!_actor) {
      const ag = await getAgent();
      _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: SENSOR_CANISTER_ID });
    }
    return _actor;
  }

  return {
  async registerDevice(
    propertyId:       string,
    externalDeviceId: string,
    source:           DeviceSource,
    name:             string
  ): Promise<SensorDevice> {
    if (import.meta.env.DEV && !SENSOR_CANISTER_ID) {
      deviceCounter += 1;
      const device: SensorDevice = {
        id:               `DEV_${deviceCounter}`,
        propertyId,
        homeowner:        "mock-principal",
        externalDeviceId,
        source,
        name,
        registeredAt:     Date.now(),
        isActive:         true,
      };
      devices.push(device);
      return device;
    }
    const a = await getActor();
    const result = await a.registerDevice(propertyId, externalDeviceId, { [source]: null }, name);
    if ("ok" in result) return fromDevice(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async deactivateDevice(deviceId: string): Promise<void> {
    if (import.meta.env.DEV && !SENSOR_CANISTER_ID) {
      const idx = devices.findIndex((d) => d.id === deviceId);
      if (idx !== -1) devices[idx] = { ...devices[idx], isActive: false };
      return;
    }
    const a = await getActor();
    const result = await a.deactivateDevice(deviceId);
    if ("err" in result) throw new Error(Object.keys(result.err)[0]);
  },

  async getDevicesForProperty(propertyId: string): Promise<SensorDevice[]> {
    if (import.meta.env.DEV && !SENSOR_CANISTER_ID) {
      return devices.filter((d) => d.propertyId === propertyId && d.isActive);
    }
    const a = await getActor();
    return (await a.getDevicesForProperty(propertyId) as any[]).map(fromDevice);
  },

  async getEventsForProperty(propertyId: string, limit = 50): Promise<SensorEvent[]> {
    if (import.meta.env.DEV && !SENSOR_CANISTER_ID) {
      return mockEvents.filter((e) => e.propertyId === propertyId).slice(0, limit);
    }
    const a = await getActor();
    return (await a.getEventsForProperty(propertyId, BigInt(limit)) as any[]).map(fromEvent);
  },

  async getPendingAlerts(propertyId: string): Promise<SensorEvent[]> {
    if (import.meta.env.DEV && !SENSOR_CANISTER_ID) {
      return mockEvents.filter((e) => e.propertyId === propertyId && e.severity === "Critical");
    }
    const a = await getActor();
    return (await a.getPendingAlerts(propertyId) as any[]).map(fromEvent);
  },

  /** Classify severity for a sensor reading based on event type and value thresholds. */
  classifySeverity(eventType: SensorEventType, value: number): Severity {
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
  },

  /** Ingest a single sensor reading, classify severity, and persist in mock store. */
  async ingestReading(
    propertyId: string,
    deviceId:   string,
    eventType:  SensorEventType,
    value:      number,
    unit:       string,
    rawPayload = ""
  ): Promise<SensorEvent> {
    if (import.meta.env.DEV && !SENSOR_CANISTER_ID) {
      const severity = this.classifySeverity(eventType, value);
      const event: SensorEvent = {
        id:         `EVT_${++eventCounter}`,
        deviceId,
        propertyId,
        eventType,
        value,
        unit,
        timestamp:  Date.now(),
        severity,
        jobId:      null,
      };
      mockEvents.push(event);
      if (severity === "Critical" && criticalHandler) {
        criticalHandler(event);
      }
      return event;
    }
    // Canister path: deviceId is used as externalDeviceId — the IoT gateway
    // always works with platform-assigned external IDs (Nest/Ecobee/Moen Flo).
    const a = await getActor();
    const result = await a.recordEvent(
      deviceId,
      { [eventType]: null },
      value,
      unit,
      rawPayload
    );
    if ("ok" in result) return fromEvent(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  /** Ingest multiple readings in one call. */
  async ingestReadings(readings: Array<{
    propertyId: string;
    deviceId:   string;
    eventType:  SensorEventType;
    value:      number;
    unit:       string;
    rawPayload?: string;
  }>): Promise<SensorEvent[]> {
    return Promise.all(
      readings.map((r) => this.ingestReading(r.propertyId, r.deviceId, r.eventType, r.value, r.unit, r.rawPayload))
    );
  },

  /** Register a handler invoked whenever a Critical event is ingested (cross-service hook). */
  onCriticalEvent(handler: (event: SensorEvent) => void): void {
    criticalHandler = handler;
  },

  /** Human-readable label for an event type. */
  eventLabel(type: SensorEventType): string {
    const labels: Record<SensorEventType, string> = {
      WaterLeak:       "Water Leak Detected",
      LeakDetected:    "Possible Leak",
      FloodRisk:       "Flood Risk Alert",
      LowTemperature:  "Low Temperature — Pipe Freeze Risk",
      HvacAlert:       "HVAC System Fault",
      HvacFilterDue:   "HVAC Filter Due",
      HighHumidity:    "High Humidity",
      HighTemperature: "High Temperature",
    };
    return labels[type] ?? type;
  },

  severityColor(severity: Severity): string {
    return severity === "Critical" ? "#dc2626"
         : severity === "Warning"  ? "#d97706"
         : "#6b7280";
  },

  reset() {
    _actor = null;
    devices.length = 0;
    deviceCounter = 0;
    mockEvents.length = 0;
    eventCounter = 0;
    criticalHandler = null;
  },
  };
}

export const sensorService = createSensorService();
