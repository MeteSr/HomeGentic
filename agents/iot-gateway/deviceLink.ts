/**
 * Verified device linking (security audit M9 / F-14).
 *
 * Vendor device IDs used to be self-asserted: anyone who learned a victim's
 * thermostat ID could register it to their own property first. Now a device on
 * an OAuth-capable platform is bound only through this flow:
 *
 *   1. POST /oauth/device/link   (x-agent-session) → one-time ticket bound to
 *      the caller's HomeGentic principal, the property and the platform.
 *   2. GET  /oauth/device/start/:platform?ticket=…  → vendor OAuth; the state
 *      carries the ticket's intent and is bound to the browser by a cookie.
 *   3. GET  /oauth/device/callback/:platform       → the gateway lists the
 *      devices the vendor API returns for that OAuth token and opens a "pick
 *      session" holding exactly those devices.
 *   4. POST /oauth/device/register (x-agent-session, pickToken, deviceId) →
 *      the gateway (a trusted principal on the sensor canister) calls
 *      sensor.registerVerifiedDevice(owner, …) for a device from that list;
 *      the canister re-checks the owner's property access.
 *
 * All state is in memory with short TTLs; a gateway restart only means the
 * user restarts the link flow.
 */
import crypto from "crypto";
import type { DeviceSourceName } from "./types";

/** Gateway device-picker platform → sensor canister DeviceSource. */
export const PLATFORM_SOURCE: Record<string, DeviceSourceName> = {
  ecobee:    "Ecobee",
  honeywell: "HoneywellHome",
  lgthinq:   "LGThinQ",
  ge:        "GESmartHQ",
};

export function isLinkPlatform(platform: string): boolean {
  return Object.prototype.hasOwnProperty.call(PLATFORM_SOURCE, platform);
}

export interface LinkIntent {
  principal:  string;
  propertyId: string;
  platform:   string;
}

export interface PickedDevice {
  id:   string;
  name: string;
  type: string;
}

export interface PickSession extends LinkIntent {
  vendorAccountId: string;
  devices:         Map<string, PickedDevice>;
}

export const TICKET_TTL_MS = 5 * 60 * 1000;
export const STATE_TTL_MS  = 10 * 60 * 1000;
export const PICK_TTL_MS   = 15 * 60 * 1000;
const MAX_ENTRIES = 10_000;

type Timed<T> = { value: T; expiresAt: number };

class TtlStore<T> {
  private readonly m = new Map<string, Timed<T>>();
  constructor(private readonly ttlMs: number) {}

  put(key: string, value: T): void {
    const now = Date.now();
    if (this.m.size >= MAX_ENTRIES) {
      for (const [k, v] of this.m) if (v.expiresAt <= now) this.m.delete(k);
      if (this.m.size >= MAX_ENTRIES) this.m.clear();
    }
    this.m.set(key, { value, expiresAt: now + this.ttlMs });
  }

  get(key: string): T | null {
    const e = this.m.get(key);
    if (!e) return null;
    if (e.expiresAt <= Date.now()) { this.m.delete(key); return null; }
    return e.value;
  }

  take(key: string): T | null {
    const v = this.get(key);
    this.m.delete(key);
    return v;
  }

  clear(): void { this.m.clear(); }
}

const tickets = new TtlStore<LinkIntent>(TICKET_TTL_MS);
const states  = new TtlStore<LinkIntent>(STATE_TTL_MS);
const picks   = new TtlStore<PickSession>(PICK_TTL_MS);

const newToken = () => crypto.randomBytes(32).toString("hex");

/** Step 1: a one-time ticket the popup URL carries to /oauth/device/start. */
export function issueTicket(intent: LinkIntent): string {
  const t = newToken();
  tickets.put(t, { ...intent });
  return t;
}

/** Step 2: single use; null when unknown, expired or for another platform. */
export function consumeTicket(ticket: unknown, platform: string): LinkIntent | null {
  if (typeof ticket !== "string" || !/^[0-9a-f]{64}$/.test(ticket)) return null;
  const intent = tickets.take(ticket);
  return intent && intent.platform === platform ? intent : null;
}

/** Step 2: remember whose flow an OAuth state belongs to. */
export function bindState(state: string, intent: LinkIntent): void {
  states.put(state, intent);
}

/** Step 3: single use. */
export function takeStateIntent(state: string): LinkIntent | null {
  return states.take(state);
}

/** Step 3: open a pick session over the devices the vendor API listed. */
export function openPickSession(intent: LinkIntent, vendorAccountId: string, devices: PickedDevice[]): string {
  const t = newToken();
  picks.put(t, {
    ...intent,
    vendorAccountId,
    devices: new Map(devices.filter((d) => typeof d.id === "string" && d.id.length > 0).map((d) => [d.id, d])),
  });
  return t;
}

export type PickCheck =
  | { ok: true; session: PickSession; device: PickedDevice }
  | { ok: false; status: number; error: string };

/** Step 4: the caller must be the principal that started the flow, and the device must be one the vendor listed. */
export function checkPick(pickToken: unknown, principal: string, deviceId: unknown): PickCheck {
  if (typeof pickToken !== "string" || !/^[0-9a-f]{64}$/.test(pickToken)) {
    return { ok: false, status: 400, error: "pickToken required" };
  }
  const session = picks.get(pickToken);
  if (!session) return { ok: false, status: 410, error: "Device list expired — connect the account again" };
  if (session.principal !== principal) return { ok: false, status: 403, error: "This device list belongs to another user" };
  if (typeof deviceId !== "string") return { ok: false, status: 400, error: "deviceId required" };
  const device = session.devices.get(deviceId);
  if (!device) return { ok: false, status: 403, error: "That device is not in the connected account" };
  return { ok: true, session, device };
}

/** Test helper. */
export function resetDeviceLinkState(): void {
  tickets.clear();
  states.clear();
  picks.clear();
}
