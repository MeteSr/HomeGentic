/**
 * Honeywell Home / Resideo REST polling script.
 *
 * Honeywell uses OAuth 2.0 Authorization Code flow. Access tokens expire in
 * 10 minutes — the poller proactively refreshes 1 minute before expiry.
 * Refreshed tokens are persisted to HONEYWELL_TOKENS_FILE so they survive
 * process restarts (default: .honeywell-tokens.json in the working directory).
 *
 * Poll interval: 3 minutes (well within Honeywell's rate limits).
 * Each poll discovers all locations (unless HONEYWELL_LOCATION_ID is set),
 * then fetches thermostats and water leak detectors for each location.
 *
 * Required env vars (see .env.example):
 *   HONEYWELL_CLIENT_ID      — from developer.honeywellhome.com
 *   HONEYWELL_CLIENT_SECRET  — from developer.honeywellhome.com
 *   HONEYWELL_ACCESS_TOKEN   — obtained via OAuth flow (see README)
 *   HONEYWELL_REFRESH_TOKEN  — obtained via OAuth flow
 *   HONEYWELL_LOCATION_ID    — optional; restricts polling to a single location
 */

import fs from "fs";
import path from "path";
import { handleHoneywellHomeEvent } from "../handlers";
import { recordSensorEvent } from "../icp";
import { logger } from "../../../packages/shared/src/logger";
import type { HoneywellDevice } from "../types";

const HONEYWELL_API     = "https://api.honeywell.com";
const REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 min before expiry (10-min token)

const TOKENS_FILE = process.env.HONEYWELL_TOKENS_FILE
  ?? path.resolve(process.cwd(), ".honeywell-tokens.json");

// ── Token state ───────────────────────────────────────────────────────────────

export interface TokenState {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number; // ms epoch
}

export function loadTokenState(): TokenState | null {
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")) as TokenState;
      if (parsed.accessToken && parsed.refreshToken && parsed.expiresAt) {
        return parsed;
      }
    } catch {
      logger.warn("honeywell-poller", "corrupted token file — falling back to env vars");
    }
  }

  const accessToken  = process.env.HONEYWELL_ACCESS_TOKEN;
  const refreshToken = process.env.HONEYWELL_REFRESH_TOKEN;
  if (!accessToken || !refreshToken) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 10 * 60 * 1000, // assume 10 min if unknown
  };
}

export function persistTokenState(state: TokenState): void {
  try {
    // Refresh tokens: owner-only file permissions (security audit F-14).
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(TOKENS_FILE, 0o600);
  } catch (err) {
    logger.warn("honeywell-poller", "failed to persist tokens", { error: String(err) });
  }
  process.env.HONEYWELL_ACCESS_TOKEN  = state.accessToken;
  process.env.HONEYWELL_REFRESH_TOKEN = state.refreshToken;
}

export async function refreshTokens(state: TokenState): Promise<TokenState> {
  const clientId     = process.env.HONEYWELL_CLIENT_ID;
  const clientSecret = process.env.HONEYWELL_CLIENT_SECRET;
  if (!clientId)     throw new Error("[honeywell-poller] HONEYWELL_CLIENT_ID is required for token refresh");
  if (!clientSecret) throw new Error("[honeywell-poller] HONEYWELL_CLIENT_SECRET is required for token refresh");

  // Honeywell token endpoint uses HTTP Basic auth (client_id:client_secret).
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token: state.refreshToken,
  });

  const resp = await fetch(`${HONEYWELL_API}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[honeywell-poller] token refresh failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number; // seconds
  };

  const newState: TokenState = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000,
  };

  persistTokenState(newState);
  logger.info("honeywell-poller", "tokens refreshed", { expiresInMin: Math.round(data.expires_in / 60) });
  return newState;
}

export async function ensureFreshToken(state: TokenState): Promise<TokenState> {
  if (Date.now() < state.expiresAt - REFRESH_BUFFER_MS) return state;
  return refreshTokens(state);
}

// ── Raw Honeywell API response shapes (fields we use) ────────────────────────

interface HoneywellLocation {
  locationID: string;
  name:       string;
}

interface HoneywellThermostatApiDevice {
  deviceID:              string;
  userDefinedDeviceName: string;
  indoorTemperature?:    number; // °F
  indoorHumidity?:       number; // %
  operationStatus?:      { equipmentStatus: string };
}

interface HoneywellWldApiDevice {
  deviceID:              string;
  userDefinedDeviceName: string;
  isWaterPresent:        boolean;
}

// ── Poll ──────────────────────────────────────────────────────────────────────

export async function pollOnce(state: TokenState): Promise<void> {
  const clientId = process.env.HONEYWELL_CLIENT_ID;
  if (!clientId) {
    logger.error("honeywell-poller", "HONEYWELL_CLIENT_ID not set — skipping poll");
    return;
  }

  const fixedLocationId = process.env.HONEYWELL_LOCATION_ID;
  let locationIds: string[];

  if (fixedLocationId) {
    locationIds = [fixedLocationId];
  } else {
    const locResp = await fetch(
      `${HONEYWELL_API}/v2/locations?apikey=${encodeURIComponent(clientId)}`,
      { headers: { Authorization: `Bearer ${state.accessToken}` } }
    );
    if (!locResp.ok) {
      logger.error("honeywell-poller", "locations fetch failed", {
        status: locResp.status,
        body:   await locResp.text(),
      });
      return;
    }
    const locs = await locResp.json() as HoneywellLocation[];
    locationIds = (locs ?? []).map(l => l.locationID);
  }

  for (const locId of locationIds) {
    await pollThermostats(state, clientId, locId);
    await pollWaterLeakDetectors(state, clientId, locId);
  }
}

async function pollThermostats(
  state:      TokenState,
  clientId:   string,
  locationId: string
): Promise<void> {
  const resp = await fetch(
    `${HONEYWELL_API}/v2/devices/thermostats` +
    `?apikey=${encodeURIComponent(clientId)}&locationId=${encodeURIComponent(locationId)}`,
    { headers: { Authorization: `Bearer ${state.accessToken}` } }
  );

  if (!resp.ok) {
    logger.error("honeywell-poller", "thermostats fetch failed", {
      status:     resp.status,
      locationId,
      body:       await resp.text(),
    });
    return;
  }

  const devices = await resp.json() as HoneywellThermostatApiDevice[];
  for (const d of devices ?? []) {
    const device: HoneywellDevice = {
      deviceID:              d.deviceID,
      userDefinedDeviceName: d.userDefinedDeviceName,
      deviceType:            "Thermostat",
      indoorTemperature:     d.indoorTemperature,
      indoorHumidity:        d.indoorHumidity,
      operationStatus:       d.operationStatus,
    };
    await processDevice(device);
  }
}

async function pollWaterLeakDetectors(
  state:      TokenState,
  clientId:   string,
  locationId: string
): Promise<void> {
  const resp = await fetch(
    `${HONEYWELL_API}/v2/devices/waterLeakDetectors` +
    `?apikey=${encodeURIComponent(clientId)}&locationId=${encodeURIComponent(locationId)}`,
    { headers: { Authorization: `Bearer ${state.accessToken}` } }
  );

  if (!resp.ok) {
    // 404 is expected when the location has no WLD devices — suppress to keep logs clean.
    if (resp.status !== 404) {
      logger.error("honeywell-poller", "WLD fetch failed", {
        status:     resp.status,
        locationId,
        body:       await resp.text(),
      });
    }
    return;
  }

  const devices = await resp.json() as HoneywellWldApiDevice[];
  for (const d of devices ?? []) {
    const device: HoneywellDevice = {
      deviceID:              d.deviceID,
      userDefinedDeviceName: d.userDefinedDeviceName,
      deviceType:            "Water Leak Detector",
      waterPresent:          d.isWaterPresent,
    };
    await processDevice(device);
  }
}

async function processDevice(device: HoneywellDevice): Promise<void> {
  const raw     = JSON.stringify(device);
  const reading = handleHoneywellHomeEvent(device, raw);
  if (!reading) return;

  const eventName = Object.keys(reading.eventType)[0];
  logger.info("honeywell-poller", eventName, {
    deviceId:   device.deviceID,
    deviceName: device.userDefinedDeviceName,
  });

  const result = await recordSensorEvent(reading, "HoneywellHome");
  if (result.success) {
    logger.info("honeywell-poller", "recorded", {
      eventId: result.eventId,
      ...(result.jobId ? { jobId: result.jobId } : {}),
    });
  } else {
    logger.error("honeywell-poller", "canister error", { error: result.error });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Starts the Honeywell Home polling loop. Returns a stop function.
 *
 * No-ops (returns immediately) when tokens are absent — safe to call
 * unconditionally at gateway startup.
 */
export function startHoneywellPoller(intervalMs = 3 * 60 * 1000): () => void {
  const initial = loadTokenState();
  if (!initial) {
    logger.warn("honeywell-poller", "HONEYWELL_ACCESS_TOKEN or HONEYWELL_REFRESH_TOKEN not set — poller disabled");
    return () => {};
  }

  let currentState = initial;
  let stopped      = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      currentState = await ensureFreshToken(currentState);
      await pollOnce(currentState);
    } catch (err) {
      logger.error("honeywell-poller", "tick error", { error: String(err) });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  logger.info("honeywell-poller", "starting", { intervalSec: intervalMs / 1000 });
  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info("honeywell-poller", "stopped");
  };
}
