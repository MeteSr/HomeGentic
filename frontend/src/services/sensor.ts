import { Actor } from "@icp-sdk/core/agent";
import { getAgent } from "./actor";
import { idlFactory } from "@/declarations/sensor";
export { idlFactory };

const SENSOR_CANISTER_ID = (process.env as any).SENSOR_CANISTER_ID || "";

// ─── TypeScript types ─────────────────────────────────────────────────────────

export type DeviceSource =
  | "Nest" | "Ecobee" | "MoenFlo" | "Manual"
  | "RingAlarm" | "HoneywellHome" | "RheemEcoNet" | "Sense"
  | "EmporiaVue" | "Rachio" | "SmartThings" | "HomeAssistant"
  | "EnphaseEnvoy" | "TeslaPowerwall" | "LGThinQ" | "GESmartHQ"
  | "SolarEdge";
export type SensorEventType =
  | "WaterLeak" | "LeakDetected" | "FloodRisk"
  | "LowTemperature" | "HvacAlert" | "HvacFilterDue"
  | "HighHumidity" | "HighTemperature"
  | "SolarFault" | "LowProduction" | "BatteryLow" | "GridOutage"
  | "ApplianceFault" | "ApplianceMaintenance";
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
    const a = await getActor();
    const result = await a.registerDevice(propertyId, externalDeviceId, { [source]: null }, name);
    if ("ok" in result) return fromDevice(result.ok);
    const key = Object.keys(result.err)[0];
    const val = result.err[key];
    throw new Error(typeof val === "string" ? val : key);
  },

  async deactivateDevice(deviceId: string): Promise<void> {
    const a = await getActor();
    const result = await a.deactivateDevice(deviceId);
    if ("err" in result) throw new Error(Object.keys(result.err)[0]);
  },

  async getDevicesForProperty(propertyId: string): Promise<SensorDevice[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_devices) {
      const map = (window as any).__e2e_devices as Record<string, SensorDevice[]>;
      return map[propertyId] ?? [];
    }
    const a = await getActor();
    return (await a.getDevicesForProperty(propertyId) as any[]).map(fromDevice);
  },

  async getEventsForProperty(propertyId: string, limit = 50): Promise<SensorEvent[]> {
    const a = await getActor();
    return (await a.getEventsForProperty(propertyId, BigInt(limit)) as any[]).map(fromEvent);
  },

  async getPendingAlerts(propertyId: string): Promise<SensorEvent[]> {
    if (typeof window !== "undefined" && (window as any).__e2e_alerts) {
      const map = (window as any).__e2e_alerts as Record<string, SensorEvent[]>;
      return map[propertyId] ?? [];
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
    if ("ok" in result) {
      const event = fromEvent(result.ok);
      // Use the explicit propertyId (real canister resolves via device registry;
      // IoT gateway always provides it at ingestion time).
      const resolved: SensorEvent = event.propertyId ? event : { ...event, propertyId };
      if (resolved.severity === "Critical" && criticalHandler) criticalHandler(resolved);
      return resolved;
    }
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
      WaterLeak:            "Water Leak Detected",
      LeakDetected:         "Possible Leak",
      FloodRisk:            "Flood Risk Alert",
      LowTemperature:       "Low Temperature — Pipe Freeze Risk",
      HvacAlert:            "HVAC System Fault",
      HvacFilterDue:        "HVAC Filter Due",
      HighHumidity:         "High Humidity",
      HighTemperature:      "High Temperature",
      SolarFault:           "Solar Inverter Fault",
      LowProduction:        "Solar Low Production",
      BatteryLow:           "Battery Critically Low",
      GridOutage:           "Grid Outage — Battery Islanded",
      ApplianceFault:       "Appliance Fault",
      ApplianceMaintenance: "Appliance Maintenance Due",
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
