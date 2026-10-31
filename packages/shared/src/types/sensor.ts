// Generated from ../declarations/sensor.ts by scripts/gen-declaration-types.mjs. Do not edit;
// change the declaration and run `npm run gen:declaration-types`.
import type { ActorMethod } from "@icp-sdk/core/agent";
import type { Principal } from "@icp-sdk/core/principal";

export type Error = { InvalidInput: string } | { NotFound: null } | { NotAuthorized: null } | { AlreadyExists: null };

export type SensorDevice = {
  id: string;
  externalDeviceId: string;
  source: DeviceSource;
  name: string;
  propertyId: string;
  isActive: boolean;
  homeowner: Principal;
  registeredAt: bigint;
};

export type DeviceSource =
  | { Sense: null }
  | { GESmartHQ: null }
  | { Nest: null }
  | { HomeAssistant: null }
  | { MoenFlo: null }
  | { SolarEdge: null }
  | { LGThinQ: null }
  | { TeslaPowerwall: null }
  | { HoneywellHome: null }
  | { SmartThings: null }
  | { EnphaseEnvoy: null }
  | { RheemEcoNet: null }
  | { RingAlarm: null }
  | { Ecobee: null }
  | { Rachio: null }
  | { Manual: null }
  | { EmporiaVue: null };

export type SensorEvent = {
  id: string;
  value: number;
  unit: string;
  jobId: [] | [string];
  propertyId: string;
  deviceId: string;
  timestamp: bigint;
  severity: Severity;
  homeowner: Principal;
  rawPayload: string;
  eventType: SensorEventType;
};

export type Severity = { Info: null } | { Critical: null } | { Warning: null };

export type SensorEventType =
  | { FloodRisk: null }
  | { GridOutage: null }
  | { LowProduction: null }
  | { WaterLeak: null }
  | { ApplianceFault: null }
  | { BatteryLow: null }
  | { HvacFilterDue: null }
  | { HighTemperature: null }
  | { LowTemperature: null }
  | { HvacAlert: null }
  | { ApplianceMaintenance: null }
  | { LeakDetected: null }
  | { HighHumidity: null }
  | { SolarFault: null };

/** The methods this declaration lists, for `lazyActor<_SERVICE>(idlFactory, canisterId)`. */
export interface _SERVICE {
  deactivateDevice: ActorMethod<[string], { ok: null } | { err: Error }>;
  deleteMyData: ActorMethod<[], { ok: bigint } | { err: Error }>;
  getDevicesForProperty: ActorMethod<[string], SensorDevice[]>;
  getEventsForProperty: ActorMethod<[string, bigint], SensorEvent[]>;
  getPendingAlerts: ActorMethod<[string], SensorEvent[]>;
  getVerifiedOnlySources: ActorMethod<[], DeviceSource[]>;
  recordEvent: ActorMethod<[string, SensorEventType, number, string, string], { ok: SensorEvent } | { err: Error }>;
  recordEventFor: ActorMethod<
    [DeviceSource, string, string, SensorEventType, number, string, string],
    { ok: SensorEvent } | { err: Error }
  >;
  registerDevice: ActorMethod<[string, string, DeviceSource, string], { ok: SensorDevice } | { err: Error }>;
  registerVerifiedDevice: ActorMethod<
    [Principal, string, string, DeviceSource, string, string],
    { ok: SensorDevice } | { err: Error }
  >;
  setVerifiedOnlySources: ActorMethod<[DeviceSource[]], { ok: null } | { err: Error }>;
}
