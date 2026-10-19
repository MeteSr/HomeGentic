/**
 * ICP client for the HomeGentic IoT Gateway.
 *
 * Uses @icp-sdk/core/agent (3.x) with an Ed25519 service identity to call the Sensor
 * canister's recordEvent() update method. The identity private key is loaded
 * from the GATEWAY_IDENTITY_SEED environment variable (32-byte hex string).
 *
 * In local development (NODE_ENV !== "production") the agent fetches the root
 * key from the local replica automatically.
 */

import { HttpAgent, Actor, ActorSubclass } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { Principal } from "@icp-sdk/core/principal";
import type { DeviceSourceName, SensorEventType, SensorReading } from "./types";
import { logger } from "../../packages/shared/src/logger";
import { idlFactory as sensorIdlFactory } from "../../packages/shared/src/declarations/sensor";
import { idlFactory as authIdlFactory } from "../../packages/shared/src/declarations/auth";

// ── Actor interface ───────────────────────────────────────────────────────────

interface SensorActor {
  recordEventFor(
    source: Record<string, null>,
    vendorAccountId: string,
    externalDeviceId: string,
    eventType: SensorEventType,
    value: number,
    unit: string,
    rawPayload: string
  ): Promise<{ ok: unknown } | { err: unknown }>;
  registerVerifiedDevice(
    owner: Principal,
    propertyId: string,
    externalDeviceId: string,
    source: Record<string, null>,
    vendorAccountId: string,
    name: string
  ): Promise<{ ok: unknown } | { err: unknown }>;
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
  logger.warn("iot-gateway", "GATEWAY_IDENTITY_SEED not set — using ephemeral identity; add the gateway principal to the sensor canister before recording events");
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

function errText(err: unknown): string {
  const errVariant = err as Record<string, unknown>;
  const errKey = Object.keys(errVariant)[0] ?? "Unknown";
  const errVal = errVariant[errKey];
  return errKey === "InvalidInput" ? `InvalidInput: ${errVal}` : errKey;
}

/**
 * Record a reading for the device registered for `source` (M9 / F-14: a
 * platform's events never land on another platform's or a #Manual device).
 * `vendorAccountId` is the vendor account the event was received under, or
 * "" when the receiving channel doesn't name one.
 */
export async function recordSensorEvent(
  reading: SensorReading,
  source: DeviceSourceName,
  vendorAccountId = "",
): Promise<RecordResult> {
  try {
    const actor = await getSensorActor();
    const result = await actor.recordEventFor(
      { [source]: null },
      vendorAccountId,
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
      return { success: false, error: errText(result.err) };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

// ── Verified device registration (M9 / F-14) ─────────────────────────────────

export type RegisterResult =
  | { success: true; device: { id: string; propertyId: string; homeowner: string; externalDeviceId: string; source: string; name: string; registeredAt: string; isActive: boolean } }
  | { success: false; error: string };

/**
 * Bind a device the gateway proved belongs to the homeowner's vendor account
 * (it was in the vendor API's device list for their OAuth token). The sensor
 * canister re-checks `owner`'s write access to the property.
 */
export async function registerVerifiedDevice(
  owner: string,
  propertyId: string,
  externalDeviceId: string,
  source: DeviceSourceName,
  vendorAccountId: string,
  name: string,
): Promise<RegisterResult> {
  try {
    const actor = await getSensorActor();
    const result = await actor.registerVerifiedDevice(
      Principal.fromText(owner), propertyId, externalDeviceId, { [source]: null }, vendorAccountId, name,
    );
    if ("ok" in result) {
      const d = result.ok as {
        id: string; propertyId: string; homeowner: Principal; externalDeviceId: string;
        source: Record<string, null>; name: string; registeredAt: bigint; isActive: boolean;
      };
      return {
        success: true,
        device: {
          id: d.id, propertyId: d.propertyId, homeowner: d.homeowner.toText(), externalDeviceId: d.externalDeviceId,
          source: Object.keys(d.source)[0] ?? source, name: d.name,
          registeredAt: String(d.registeredAt), isActive: d.isActive,
        },
      };
    }
    return { success: false, error: errText(result.err) };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Auth canister: agent-session resolution ──────────────────────────────────

let _authActor: ActorSubclass<{ resolveAgentSession(t: string): Promise<[] | [Principal]> }> | null = null;

/**
 * Resolve an `x-agent-session` token (issued by auth.issueAgentSession() to the
 * signed-in caller) to its HomeGentic principal, or null. Needs CANISTER_ID_AUTH.
 */
export async function resolveAgentSession(token: string): Promise<string | null> {
  if (!_authActor) {
    const canisterId = process.env.CANISTER_ID_AUTH;
    if (!canisterId) throw new Error("CANISTER_ID_AUTH environment variable is not set");
    const agent = await HttpAgent.create({
      host: process.env.ICP_HOST ?? "http://localhost:4943",
      shouldFetchRootKey: process.env.NODE_ENV !== "production",
    });
    _authActor = Actor.createActor(authIdlFactory, { agent, canisterId });
  }
  const res = await _authActor.resolveAgentSession(token);
  return res[0] ? res[0].toText() : null;
}
