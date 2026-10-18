/**
 * Shared types for the HomeGentic IoT Gateway.
 *
 * Webhook payloads from Nest, Ecobee, and Moen Flo are all normalized into a
 * SensorReading before being forwarded to the sensor canister.
 */

// ── Canister-aligned event types ─────────────────────────────────────────────
export type SensorEventType =
  | { WaterLeak: null }
  | { LeakDetected: null }
  | { FloodRisk: null }
  | { LowTemperature: null }
  | { HvacAlert: null }
  | { HvacFilterDue: null }
  | { HighHumidity: null }
  | { HighTemperature: null }
  | { SolarFault: null }
  | { LowProduction: null }
  | { BatteryLow: null }
  | { GridOutage: null }
  | { ApplianceFault: null }
  | { ApplianceMaintenance: null };

// ── Canister DeviceSource variant names ──────────────────────────────────────
export type DeviceSourceName =
  | "Nest" | "Ecobee" | "MoenFlo" | "Manual"
  | "RingAlarm" | "HoneywellHome" | "RheemEcoNet" | "Sense"
  | "EmporiaVue" | "Rachio" | "SmartThings" | "HomeAssistant"
  | "EnphaseEnvoy" | "TeslaPowerwall" | "LGThinQ" | "GESmartHQ"
  | "SolarEdge";

// ── Normalized internal representation ───────────────────────────────────────
export interface SensorReading {
  /** External device ID as assigned by the cloud platform */
  externalDeviceId: string;
  eventType: SensorEventType;
  /** Numeric measurement value (temperature °C, humidity %, flow L/min …) */
  value: number;
  unit: string;
  /** Original raw JSON string for audit trail */
  rawPayload: string;
}

// ── Nest (Google Smart Device Management) ─────────────────────────────────────
export interface NestWebhookEvent {
  eventId: string;
  timestamp: string;
  resourceUpdate: {
    name: string; // projects/{projectId}/devices/{deviceId}
    traits?: {
      "sdm.devices.traits.Temperature"?: {
        ambientTemperatureCelsius: number;
      };
      "sdm.devices.traits.Humidity"?: {
        ambientHumidityPercent: number;
      };
      "sdm.devices.traits.ThermostatHvac"?: {
        status: "HEATING" | "COOLING" | "OFF";
      };
    };
    events?: {
      "sdm.devices.events.ThermostatMode.ThermostatModeEvent"?: {
        thermostatMode: string;
      };
    };
  };
  userId?: string;
}

// ── Ecobee ────────────────────────────────────────────────────────────────────
export interface EcobeeAlert {
  alertType:
    | "lowTemp"
    | "highTemp"
    | "hvacError"
    | "filterChange"
    | "humidity"
    | string;
  severity: "low" | "medium" | "high";
  message: string;
  value?: number; // temperature °F or humidity %
}

export interface EcobeeRuntime {
  /** 10ths of °F — e.g. 680 = 68.0 °F */
  actualTemperature: number;
  /** Relative humidity % */
  actualHumidity: number;
}

export interface EcobeeWebhookEvent {
  thermostatId: string;
  alerts?: EcobeeAlert[];
  /** Populated by the poller from the REST API runtime object. */
  runtime?: EcobeeRuntime;
  runtimeSensorData?: {
    columns: string[];
    data: string[][];
  };
}

// ── Honeywell Home / Resideo ─────────────────────────────────────────────────

/** Normalized device shape shared between Honeywell thermostats and WLD units. */
export interface HoneywellDevice {
  deviceID: string;
  userDefinedDeviceName: string;
  deviceType: string; // "Thermostat" | "Water Leak Detector"
  /** Indoor temperature in °F (thermostats only) */
  indoorTemperature?: number;
  /** Indoor relative humidity % (thermostats only) */
  indoorHumidity?: number;
  operationStatus?: {
    /** "Heating" | "Cooling" | "Off" | "Fan Only" | "Fault" */
    equipmentStatus: string;
  };
  /** True when a Water Leak Detector reports water presence */
  waterPresent?: boolean;
}

// ── Enphase Solar ─────────────────────────────────────────────────────────────

/** Normalized event built by the Enphase poller from production + inverter data. */
export interface EnphaseSystemEvent {
  /** Envoy serial number — used as externalDeviceId */
  systemSerial:     string;
  /** Current system-level production in watts */
  wNow:             number;
  /** Number of inverters that haven't reported within the stale threshold */
  faultedInverters: number;
  /** True when it is daylight hours (heuristic: 7am–7pm local time) */
  isDaylight:       boolean;
}

// ── Tesla Powerwall ───────────────────────────────────────────────────────────

/** Normalized event built by the Tesla poller from SOE + grid status data. */
export interface TeslaPowerwallEvent {
  /** Gateway serial number — used as externalDeviceId */
  gatewaySerial:    string;
  /** Battery state of energy 0–100 % */
  chargePercent:    number;
  /** Raw grid status string from the gateway (e.g. "SystemGridConnected") */
  gridStatus:       string;
  /** True when the gateway reports any non-informational battery alert */
  hasBatteryAlerts: boolean;
}

// ── SmartThings ──────────────────────────────────────────────────────────────

/** A single capability state-change event from the SmartThings webhook payload. */
export interface SmartThingsDeviceEvent {
  deviceId:     string;
  componentId?: string;
  capability:   string; // e.g. "temperatureMeasurement", "waterSensor"
  attribute:    string; // e.g. "temperature", "water"
  value:        unknown; // number for temp/humidity, string for water/filter/hvac state
  unit?:        string; // "C" | "F" | "%" — present on temperature events
  stateChange?: boolean;
}

export interface SmartThingsWebhookBody {
  lifecycle:        "CONFIRMATION" | "EVENT" | "INSTALL" | "UPDATE" | "UNINSTALL" | "PING";
  executionId?:     string;
  confirmationData?: {
    appId:           string;
    confirmationUrl: string;
  };
  eventData?: {
    installedApp?: { installedAppId: string };
    events: Array<{ deviceEvent?: SmartThingsDeviceEvent }>;
  };
}

// ── LG ThinQ ─────────────────────────────────────────────────────────────────

/** PCC (Proactive Customer Care) callback payload from LG ThinQ. */
export interface LGThinQPCCEvent {
  deviceId:    string;
  deviceType?: string;
  /** "FAIL_CODE" | "FAULT" | "MAINTENANCE" — upper-cased by LG */
  type:        string;
  /** Platform-specific fault or maintenance code, e.g. "0F", "FILTER_REPLACE" */
  code:        string;
  /** "HIGH" | "MEDIUM" | "LOW" — present on fault events */
  severity?:   string;
  message?:    string;
}

// ── GE SmartHQ ───────────────────────────────────────────────────────────────

export interface GEAppliance {
  applianceId:   string;
  applianceType?: string;
  nickName?:     string;
}

export interface GEAttributeValue {
  value:      string;
  timestamp?: string;
}

export interface GEApplianceAttributes {
  applianceId: string;
  attributes:  Record<string, GEAttributeValue>;
}

// ── SolarEdge ─────────────────────────────────────────────────────────────────

/** Normalized event built by the SolarEdge poller from overview + alerts data. */
export interface SolarEdgeEvent {
  /** Numeric site ID — used as externalDeviceId */
  siteId:          string;
  /** Current site power in watts (from overview.currentPower.power) */
  currentPowerW:   number;
  /** True when a CRITICAL alert is present in the site's active alerts */
  hasCriticalAlert: boolean;
  /** True when it is expected sun hours (7am–7pm heuristic) */
  isDaylight:      boolean;
}

// ── Moen Flo ─────────────────────────────────────────────────────────────────
export type MoenFloAlertType =
  | "LEAK"
  | "SHUTOFF"
  | "LOW_PRESSURE"
  | "HIGH_FLOW"
  | "FLOOD_RISK"
  | string;

export interface MoenFloWebhookEvent {
  deviceId: string;
  alertType: MoenFloAlertType;
  severity: "critical" | "warning" | "info";
  flowRateLpm?: number;
  pressurePsi?: number;
  message?: string;
  timestamp: string;
}
