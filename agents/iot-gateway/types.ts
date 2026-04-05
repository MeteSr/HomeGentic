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
  | { HighTemperature: null };

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

export interface EcobeeWebhookEvent {
  thermostatId: string;
  alerts?: EcobeeAlert[];
  runtimeSensorData?: {
    columns: string[];
    data: string[][];
  };
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
