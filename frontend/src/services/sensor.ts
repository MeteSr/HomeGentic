import { Actor } from "@dfinity/agent";
import { getAgent } from "./actor";

const SENSOR_CANISTER_ID = (process.env as any).SENSOR_CANISTER_ID || "";

// ─── IDL ──────────────────────────────────────────────────────────────────────

const idlFactory = ({ IDL }: any) => {
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

// ─── Mock stores ──────────────────────────────────────────────────────────────

const MOCK_DEVICES: SensorDevice[] = [];
let   deviceCounter = 0;

// ─── Actor ────────────────────────────────────────────────────────────────────

let _actor: any = null;

async function getActor() {
  if (!_actor) {
    const ag = await getAgent();
    _actor = Actor.createActor(idlFactory, { agent: ag, canisterId: SENSOR_CANISTER_ID });
  }
  return _actor;
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

// ─── Service ──────────────────────────────────────────────────────────────────

export const sensorService = {
  async registerDevice(
    propertyId:       string,
    externalDeviceId: string,
    source:           DeviceSource,
    name:             string
  ): Promise<SensorDevice> {
    if (!SENSOR_CANISTER_ID) {
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
      MOCK_DEVICES.push(device);
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
    if (!SENSOR_CANISTER_ID) {
      const idx = MOCK_DEVICES.findIndex((d) => d.id === deviceId);
      if (idx !== -1) MOCK_DEVICES[idx] = { ...MOCK_DEVICES[idx], isActive: false };
      return;
    }
    const a = await getActor();
    const result = await a.deactivateDevice(deviceId);
    if ("err" in result) throw new Error(Object.keys(result.err)[0]);
  },

  async getDevicesForProperty(propertyId: string): Promise<SensorDevice[]> {
    if (!SENSOR_CANISTER_ID) {
      return MOCK_DEVICES.filter((d) => d.propertyId === propertyId && d.isActive);
    }
    const a = await getActor();
    return (await a.getDevicesForProperty(propertyId) as any[]).map(fromDevice);
  },

  async getEventsForProperty(propertyId: string, limit = 50): Promise<SensorEvent[]> {
    if (!SENSOR_CANISTER_ID) return [];
    const a = await getActor();
    return (await a.getEventsForProperty(propertyId, BigInt(limit)) as any[]).map(fromEvent);
  },

  async getPendingAlerts(propertyId: string): Promise<SensorEvent[]> {
    if (!SENSOR_CANISTER_ID) return [];
    const a = await getActor();
    return (await a.getPendingAlerts(propertyId) as any[]).map(fromEvent);
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

  reset() { _actor = null; },
};
