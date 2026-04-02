/**
 * ICP client for the HomeFax IoT Gateway.
 *
 * Uses @dfinity/agent (3.x) with an Ed25519 service identity to call the Sensor
 * canister's recordEvent() update method. The identity private key is loaded
 * from the GATEWAY_IDENTITY_SEED environment variable (32-byte hex string).
 *
 * In local development (NODE_ENV !== "production") the agent fetches the root
 * key from the local replica automatically.
 */

import { HttpAgent, Actor, ActorSubclass } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { IDL } from "@dfinity/candid";
import type { SensorEventType, SensorReading } from "./types";

// ── IDL for the sensor canister ──────────────────────────────────────────────

const SensorEventTypeIDL = IDL.Variant({
  WaterLeak: IDL.Null,
  LeakDetected: IDL.Null,
  FloodRisk: IDL.Null,
  LowTemperature: IDL.Null,
  HvacAlert: IDL.Null,
  HvacFilterDue: IDL.Null,
  HighHumidity: IDL.Null,
  HighTemperature: IDL.Null,
});

const SensorDeviceIDL = IDL.Record({
  id: IDL.Text,
  propertyId: IDL.Text,
  homeowner: IDL.Principal,
  externalDeviceId: IDL.Text,
  source: IDL.Variant({
    Nest: IDL.Null,
    Ecobee: IDL.Null,
    MoenFlo: IDL.Null,
    Manual: IDL.Null,
  }),
  name: IDL.Text,
  registeredAt: IDL.Int,
  isActive: IDL.Bool,
});

const SeverityIDL = IDL.Variant({
  Info: IDL.Null,
  Warning: IDL.Null,
  Critical: IDL.Null,
});

const SensorEventIDL = IDL.Record({
  id: IDL.Text,
  deviceId: IDL.Text,
  propertyId: IDL.Text,
  homeowner: IDL.Principal,
  eventType: SensorEventTypeIDL,
  value: IDL.Float64,
  unit: IDL.Text,
  rawPayload: IDL.Text,
  timestamp: IDL.Int,
  severity: SeverityIDL,
  jobId: IDL.Opt(IDL.Text),
});

const ErrorIDL = IDL.Variant({
  NotFound: IDL.Null,
  Unauthorized: IDL.Null,
  InvalidInput: IDL.Text,
  AlreadyExists: IDL.Null,
});

const ResultEventIDL = IDL.Variant({
  ok: SensorEventIDL,
  err: ErrorIDL,
});

function sensorIdlFactory(): IDL.InterfaceFactory {
  return IDL.Service({
    recordEvent: IDL.Func(
      [
        IDL.Text,           // externalDeviceId
        SensorEventTypeIDL, // eventType
        IDL.Float64,        // value
        IDL.Text,           // unit
        IDL.Text,           // rawPayload
      ],
      [ResultEventIDL],
      []  // update call
    ),
  });
}

// ── Actor interface ───────────────────────────────────────────────────────────

interface SensorActor {
  recordEvent(
    externalDeviceId: string,
    eventType: SensorEventType,
    value: number,
    unit: string,
    rawPayload: string
  ): Promise<{ ok: unknown } | { err: unknown }>;
}

// ── Client setup ─────────────────────────────────────────────────────────────

let _actor: ActorSubclass<SensorActor> | null = null;

function buildIdentity(): Ed25519KeyIdentity {
  const seed = process.env.GATEWAY_IDENTITY_SEED;
  if (seed && seed.length === 64) {
    // 32-byte hex seed → Uint8Array
    const bytes = Uint8Array.from(Buffer.from(seed, "hex"));
    return Ed25519KeyIdentity.generate(bytes);
  }
  // Fallback: generate a random identity (ephemeral — dev only).
  // Always pass a cryptographically secure seed explicitly to avoid
  // CVE-2024-1631 (insecure key generation when no seed is supplied).
  console.warn(
    "[iot-gateway] GATEWAY_IDENTITY_SEED not set — using ephemeral identity. " +
    "Add the gateway principal to the sensor canister before recording events."
  );
  const secureSeed = crypto.getRandomValues(new Uint8Array(32));
  return Ed25519KeyIdentity.generate(secureSeed);
}

export async function getSensorActor(): Promise<ActorSubclass<SensorActor>> {
  if (_actor) return _actor;

  const canisterId = process.env.SENSOR_CANISTER_ID;
  if (!canisterId) {
    throw new Error("SENSOR_CANISTER_ID environment variable is not set");
  }

  const host = process.env.ICP_HOST ?? "http://localhost:4943";
  const identity = buildIdentity();
  // 14.4.7 — migrated to 3.x async HttpAgent.create() factory (was synchronous constructor in 1.x)
  const agent = await HttpAgent.create({
    identity,
    host,
    shouldFetchRootKey: process.env.NODE_ENV !== "production",
  });

  _actor = Actor.createActor<SensorActor>(sensorIdlFactory, {
    agent,
    canisterId,
  });

  return _actor;
}

/** Print the gateway's principal so it can be whitelisted on the canister. */
export function getGatewayPrincipal(): string {
  const id = buildIdentity();
  return id.getPrincipal().toText();
}

// ── Public API ────────────────────────────────────────────────────────────────

export type RecordResult =
  | { success: true; eventId: string; jobId?: string }
  | { success: false; error: string };

export async function recordSensorEvent(
  reading: SensorReading
): Promise<RecordResult> {
  try {
    const actor = await getSensorActor();
    const result = await actor.recordEvent(
      reading.externalDeviceId,
      reading.eventType,
      reading.value,
      reading.unit,
      reading.rawPayload
    );

    if ("ok" in result) {
      const ev = result.ok as {
        id: string;
        jobId: [string] | [];
      };
      return {
        success: true,
        eventId: ev.id,
        jobId: ev.jobId.length > 0 ? ev.jobId[0] : undefined,
      };
    } else {
      const errVariant = result.err as Record<string, unknown>;
      const errKey = Object.keys(errVariant)[0] ?? "Unknown";
      const errVal = errVariant[errKey];
      const errMsg =
        errKey === "InvalidInput" ? `InvalidInput: ${errVal}` : errKey;
      return { success: false, error: errMsg };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}
