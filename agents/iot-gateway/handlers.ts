/**
 * Webhook payload normalizers for Nest, Ecobee, and Moen Flo.
 *
 * Each handler validates the incoming payload and returns a SensorReading
 * (or null if the event is not actionable for HomeFax).
 */

import type {
  SensorReading,
  SensorEventType,
  NestWebhookEvent,
  EcobeeWebhookEvent,
  MoenFloWebhookEvent,
} from "./types";

// ── Nest ─────────────────────────────────────────────────────────────────────

const PIPE_FREEZE_THRESHOLD_C = 4; // °C — risk of pipe freeze below this

export function handleNestEvent(
  body: NestWebhookEvent,
  raw: string
): SensorReading | null {
  const traits = body.resourceUpdate?.traits;
  if (!traits) return null;

  // Extract device ID from resource name:
  //   "projects/{projectId}/devices/{deviceId}"
  const nameParts = (body.resourceUpdate.name ?? "").split("/");
  const externalDeviceId = nameParts[nameParts.length - 1] || body.resourceUpdate.name;
  if (!externalDeviceId) return null;

  const tempTrait = traits["sdm.devices.traits.Temperature"];
  const humidityTrait = traits["sdm.devices.traits.Humidity"];

  // Low-temperature pipe-freeze alert
  if (tempTrait) {
    const celsius = tempTrait.ambientTemperatureCelsius;
    if (celsius <= PIPE_FREEZE_THRESHOLD_C) {
      return {
        externalDeviceId,
        eventType: { LowTemperature: null } as SensorEventType,
        value: celsius,
        unit: "°C",
        rawPayload: raw,
      };
    }
    if (celsius > 35) {
      return {
        externalDeviceId,
        eventType: { HighTemperature: null } as SensorEventType,
        value: celsius,
        unit: "°C",
        rawPayload: raw,
      };
    }
  }

  // High-humidity alert
  if (humidityTrait && humidityTrait.ambientHumidityPercent > 70) {
    return {
      externalDeviceId,
      eventType: { HighHumidity: null } as SensorEventType,
      value: humidityTrait.ambientHumidityPercent,
      unit: "%RH",
      rawPayload: raw,
    };
  }

  return null; // no actionable reading
}

// ── Ecobee ───────────────────────────────────────────────────────────────────

// Ecobee reports temperature in °F — convert for the canister
function fahrenheitToCelsius(f: number): number {
  return parseFloat(((f - 32) * (5 / 9)).toFixed(1));
}

export function handleEcobeeEvent(
  body: EcobeeWebhookEvent,
  raw: string
): SensorReading | null {
  const { thermostatId, alerts } = body;
  if (!thermostatId || !alerts?.length) return null;

  for (const alert of alerts) {
    switch (alert.alertType) {
      case "lowTemp": {
        const celsius =
          alert.value !== undefined ? fahrenheitToCelsius(alert.value) : 2;
        if (celsius <= PIPE_FREEZE_THRESHOLD_C) {
          return {
            externalDeviceId: thermostatId,
            eventType: { LowTemperature: null } as SensorEventType,
            value: celsius,
            unit: "°C",
            rawPayload: raw,
          };
        }
        break;
      }
      case "highTemp": {
        const celsius =
          alert.value !== undefined ? fahrenheitToCelsius(alert.value) : 38;
        return {
          externalDeviceId: thermostatId,
          eventType: { HighTemperature: null } as SensorEventType,
          value: celsius,
          unit: "°C",
          rawPayload: raw,
        };
      }
      case "hvacError":
        return {
          externalDeviceId: thermostatId,
          eventType: { HvacAlert: null } as SensorEventType,
          value: 0,
          unit: "",
          rawPayload: raw,
        };
      case "filterChange":
        return {
          externalDeviceId: thermostatId,
          eventType: { HvacFilterDue: null } as SensorEventType,
          value: 0,
          unit: "",
          rawPayload: raw,
        };
      case "humidity":
        if (alert.value !== undefined && alert.value > 70) {
          return {
            externalDeviceId: thermostatId,
            eventType: { HighHumidity: null } as SensorEventType,
            value: alert.value,
            unit: "%RH",
            rawPayload: raw,
          };
        }
        break;
    }
  }

  return null;
}

// ── Moen Flo ─────────────────────────────────────────────────────────────────

export function handleMoenFloEvent(
  body: MoenFloWebhookEvent,
  raw: string
): SensorReading | null {
  const { deviceId, alertType } = body;
  if (!deviceId || !alertType) return null;

  const flowValue = body.flowRateLpm ?? 0;

  switch (alertType) {
    case "LEAK":
      return {
        externalDeviceId: deviceId,
        eventType: { WaterLeak: null } as SensorEventType,
        value: flowValue,
        unit: "L/min",
        rawPayload: raw,
      };
    case "FLOOD_RISK":
      return {
        externalDeviceId: deviceId,
        eventType: { FloodRisk: null } as SensorEventType,
        value: flowValue,
        unit: "L/min",
        rawPayload: raw,
      };
    case "SHUTOFF":
    case "HIGH_FLOW":
    case "LOW_PRESSURE":
      return {
        externalDeviceId: deviceId,
        eventType: { LeakDetected: null } as SensorEventType,
        value: flowValue,
        unit: "L/min",
        rawPayload: raw,
      };
  }

  return null;
}
