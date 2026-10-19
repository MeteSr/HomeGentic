/**
 * Ecobee REST polling script.
 *
 * Ecobee has no push webhook capability for consumer apps — data must be pulled.
 * Recommended interval: 3 minutes (Ecobee rate-limits at ~12 req/min).
 *
 * Token lifecycle:
 *   - access_token expires in 1 hour
 *   - Refresh is triggered when < 2 minutes remain
 *   - Refreshed tokens are persisted to ECOBEE_TOKENS_FILE so they survive
 *     process restarts (default: .ecobee-tokens.json in the working directory)
 *
 * Required env vars (see .env.example):
 *   ECOBEE_CLIENT_ID        — from developer.ecobee.com
 *   ECOBEE_ACCESS_TOKEN     — obtained via PIN flow (see README)
 *   ECOBEE_REFRESH_TOKEN    — obtained via PIN flow
 *   ECOBEE_THERMOSTAT_ID    — optional; if set, only this thermostat is polled
 */

import fs from "fs";
import path from "path";
import { handleEcobeeEvent } from "../handlers";
import { recordSensorEvent } from "../icp";
import { logger } from "../logger";
import type { EcobeeWebhookEvent, EcobeeAlert } from "../types";

const ECOBEE_API        = "https://api.ecobee.com";
const REFRESH_BUFFER_MS = 2 * 60 * 1000; // refresh 2 min before expiry

const TOKENS_FILE = process.env.ECOBEE_TOKENS_FILE
  ?? path.resolve(process.cwd(), ".ecobee-tokens.json");

// ── Token state ───────────────────────────────────────────────────────────────

export interface TokenState {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number; // ms epoch
}

export function loadTokenState(): TokenState | null {
  // Persisted file takes precedence — survives restarts with refreshed tokens.
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")) as TokenState;
      if (parsed.accessToken && parsed.refreshToken && parsed.expiresAt) {
        return parsed;
      }
    } catch {
      logger.warn("ecobee-poller", "corrupted token file — falling back to env vars");
    }
  }

  const accessToken  = process.env.ECOBEE_ACCESS_TOKEN;
  const refreshToken = process.env.ECOBEE_REFRESH_TOKEN;
  if (!accessToken || !refreshToken) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 60 * 60 * 1000, // assume 1 h if unknown
  };
}

export function persistTokenState(state: TokenState): void {
  try {
    // Refresh tokens: owner-only file permissions (security audit F-14).
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(TOKENS_FILE, 0o600);
  } catch (err) {
    logger.warn("ecobee-poller", "failed to persist tokens", { error: String(err) });
  }
  // Keep process.env in sync so other callers (e.g. tests) see current values.
  process.env.ECOBEE_ACCESS_TOKEN  = state.accessToken;
  process.env.ECOBEE_REFRESH_TOKEN = state.refreshToken;
}

export async function refreshTokens(state: TokenState): Promise<TokenState> {
  const clientId = process.env.ECOBEE_CLIENT_ID;
  if (!clientId) throw new Error("[ecobee-poller] ECOBEE_CLIENT_ID is required for token refresh");

  const url = `${ECOBEE_API}/token`
    + `?grant_type=refresh_token`
    + `&refresh_token=${encodeURIComponent(state.refreshToken)}`
    + `&client_id=${encodeURIComponent(clientId)}`;

  const resp = await fetch(url, { method: "POST" });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`[ecobee-poller] token refresh failed (${resp.status}): ${body}`);
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
  logger.info("ecobee-poller", "tokens refreshed", { expiresInMin: Math.round(data.expires_in / 60) });
  return newState;
}

export async function ensureFreshToken(state: TokenState): Promise<TokenState> {
  if (Date.now() < state.expiresAt - REFRESH_BUFFER_MS) return state;
  return refreshTokens(state);
}

// ── Ecobee REST API response shape (fields we use) ───────────────────────────

interface EcobeeApiResponse {
  thermostatList: Array<{
    identifier: string;
    name:       string;
    alerts:     EcobeeAlert[];
    runtime: {
      actualTemperature: number; // 10ths of °F
      actualHumidity:    number; // %
    };
  }>;
}

// ── Poll ──────────────────────────────────────────────────────────────────────

export async function pollOnce(state: TokenState): Promise<void> {
  const selectionMatch = process.env.ECOBEE_THERMOSTAT_ID ?? "";
  const selectionType  = selectionMatch ? "thermostats" : "registered";

  const selection = encodeURIComponent(JSON.stringify({
    selection: {
      selectionType,
      selectionMatch,
      includeAlerts:  true,
      includeRuntime: true,
    },
  }));

  const resp = await fetch(`${ECOBEE_API}/1/thermostat?json=${selection}`, {
    headers: { Authorization: `Bearer ${state.accessToken}` },
  });

  if (!resp.ok) {
    logger.error("ecobee-poller", "poll failed", { status: resp.status, body: await resp.text() });
    return;
  }

  const data = await resp.json() as EcobeeApiResponse;

  for (const therm of data.thermostatList ?? []) {
    const raw = JSON.stringify(therm);
    const event: EcobeeWebhookEvent = {
      thermostatId: therm.identifier,
      alerts:       therm.alerts ?? [],
      runtime:      therm.runtime,
    };

    const reading = handleEcobeeEvent(event, raw);
    if (!reading) continue;

    const eventName = Object.keys(reading.eventType)[0];
    logger.info("ecobee-poller", eventName, { deviceId: therm.identifier, deviceName: therm.name });

    const result = await recordSensorEvent(reading, "Ecobee");
    if (result.success) {
      logger.info("ecobee-poller", "recorded", {
        eventId: result.eventId,
        ...(result.jobId ? { jobId: result.jobId } : {}),
      });
    } else {
      logger.error("ecobee-poller", "canister error", { error: result.error });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Starts the Ecobee polling loop. Returns a stop function.
 *
 * No-ops (returns immediately) when ECOBEE_ACCESS_TOKEN / ECOBEE_REFRESH_TOKEN
 * are not set — safe to call unconditionally at gateway startup.
 */
export function startEcobeePoller(intervalMs = 3 * 60 * 1000): () => void {
  const initial = loadTokenState();
  if (!initial) {
    logger.warn("ecobee-poller", "ECOBEE_ACCESS_TOKEN or ECOBEE_REFRESH_TOKEN not set — poller disabled");
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
      logger.error("ecobee-poller", "tick error", { error: String(err) });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  logger.info("ecobee-poller", "starting", { intervalSec: intervalMs / 1000 });
  tick(); // run immediately, then on each interval

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info("ecobee-poller", "stopped");
  };
}
