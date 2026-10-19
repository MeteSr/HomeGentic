/**
 * GE Appliances / SmartHQ REST polling script.
 *
 * Uses the official SmartHQ Platform API (api.whrcloud.com) with OAuth 2.0.
 * Access tokens are refreshed proactively 5 minutes before expiry and
 * persisted to GE_TOKENS_FILE so they survive restarts.
 *
 * Poll interval: 5 minutes (conservative — no documented rate limits).
 * Each poll fetches all registered appliances, then queries each appliance's
 * attributes for fault codes and maintenance flags.
 *
 * Required env vars (see .env.example):
 *   GE_CLIENT_ID      — SmartHQ Platform API client_id
 *   GE_CLIENT_SECRET  — SmartHQ Platform API client_secret
 *   GE_ACCESS_TOKEN   — obtained via /oauth/callback/ge on first setup
 *   GE_REFRESH_TOKEN  — obtained via /oauth/callback/ge on first setup
 *   GE_TOKENS_FILE    — optional; path to token persistence file
 */

import fs from "fs";
import path from "path";
import { recordSensorEvent } from "../icp";
import { logger } from "../../../packages/shared/src/logger";
import type { SensorEventType, SensorReading, GEAppliance, GEApplianceAttributes } from "../types";

const GE_API         = "https://api.whrcloud.com";
const REFRESH_BUFFER = 5 * 60 * 1000; // refresh 5 min before expiry

const TOKENS_FILE = process.env.GE_TOKENS_FILE
  ?? path.resolve(process.cwd(), ".ge-tokens.json");

// ── Token state ───────────────────────────────────────────────────────────────

export interface GETokenState {
  accessToken:  string;
  refreshToken: string;
  expiresAt:    number; // ms epoch
}

export function loadTokenState(): GETokenState | null {
  if (fs.existsSync(TOKENS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8")) as GETokenState;
      if (parsed.accessToken && parsed.refreshToken && parsed.expiresAt) {
        return parsed;
      }
    } catch {
      logger.warn("ge-poller", "corrupted token file — falling back to env vars");
    }
  }

  const accessToken  = process.env.GE_ACCESS_TOKEN;
  const refreshToken = process.env.GE_REFRESH_TOKEN;
  if (!accessToken || !refreshToken) return null;

  return {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + 60 * 60 * 1000, // assume 1 h if unknown
  };
}

export function persistTokenState(state: GETokenState): void {
  try {
    // Refresh tokens: owner-only file permissions (security audit F-14).
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(TOKENS_FILE, 0o600);
  } catch (err) {
    logger.warn("ge-poller", "failed to persist tokens", { error: String(err) });
  }
  process.env.GE_ACCESS_TOKEN  = state.accessToken;
  process.env.GE_REFRESH_TOKEN = state.refreshToken;
}

export async function refreshTokens(state: GETokenState): Promise<GETokenState> {
  const clientId     = process.env.GE_CLIENT_ID;
  const clientSecret = process.env.GE_CLIENT_SECRET;
  if (!clientId)     throw new Error("[ge-poller] GE_CLIENT_ID is required for token refresh");
  if (!clientSecret) throw new Error("[ge-poller] GE_CLIENT_SECRET is required for token refresh");

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type:    "refresh_token",
    refresh_token: state.refreshToken,
  });

  const resp = await fetch(`${GE_API}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type":  "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[ge-poller] token refresh failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    access_token:  string;
    refresh_token: string;
    expires_in:    number;
  };

  const newState: GETokenState = {
    accessToken:  data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:    Date.now() + data.expires_in * 1000,
  };

  persistTokenState(newState);
  logger.info("ge-poller", "tokens refreshed", { expiresInMin: Math.round(data.expires_in / 60) });
  return newState;
}

export async function ensureFreshToken(state: GETokenState): Promise<GETokenState> {
  if (Date.now() < state.expiresAt - REFRESH_BUFFER) return state;
  return refreshTokens(state);
}

// ── Fault / maintenance detection ─────────────────────────────────────────────

// GE attribute key patterns that indicate a fault (non-zero value).
const FAULT_KEY_PATTERNS  = ["ERROR_CODE", "_FAULT", "FAULT_CODE"];
// GE attribute key patterns that indicate maintenance is due (value "1").
const MAINT_KEY_PATTERNS  = ["FILTER_CHANGE", "FILTER_REPLACEMENT", "MAINTENANCE_DUE", "DESCALE"];

export function detectEventFromAttributes(
  applianceId: string,
  attrs: Record<string, { value: string }>,
  raw: string
): SensorReading | null {
  for (const [key, attr] of Object.entries(attrs)) {
    const k = key.toUpperCase();

    // Maintenance takes priority so a filter-change isn't mis-classified as a fault.
    if (MAINT_KEY_PATTERNS.some(p => k.includes(p)) && attr.value === "1") {
      return {
        externalDeviceId: applianceId,
        eventType: { ApplianceMaintenance: null } as SensorEventType,
        value: 0,
        unit: "",
        rawPayload: raw,
      };
    }

    if (FAULT_KEY_PATTERNS.some(p => k.includes(p)) && attr.value && attr.value !== "0") {
      return {
        externalDeviceId: applianceId,
        eventType: { ApplianceFault: null } as SensorEventType,
        value: 0,
        unit: "",
        rawPayload: raw,
      };
    }
  }
  return null;
}

// ── Poll ──────────────────────────────────────────────────────────────────────

export async function pollOnce(state: GETokenState): Promise<void> {
  const headers = {
    Authorization: `Bearer ${state.accessToken}`,
    "Content-Type": "application/json",
  };

  // 1. Fetch appliance list.
  const listResp = await fetch(`${GE_API}/api/v1/appliance`, { headers });
  if (!listResp.ok) {
    logger.error("ge-poller", "appliance list failed", {
      status: listResp.status,
      body:   await listResp.text(),
    });
    return;
  }

  const appliances = await listResp.json() as GEAppliance[];
  if (!Array.isArray(appliances) || appliances.length === 0) return;

  // 2. For each appliance, fetch attributes and check for faults / maintenance.
  for (const appliance of appliances) {
    const { applianceId } = appliance;
    if (!applianceId) continue;

    const attrResp = await fetch(`${GE_API}/api/v1/appliance/${encodeURIComponent(applianceId)}/attribute`, {
      headers,
    });

    if (!attrResp.ok) {
      // 404 is expected for unconfigured appliance types — suppress.
      if (attrResp.status !== 404) {
        logger.error("ge-poller", "attribute fetch failed", {
          applianceId,
          status: attrResp.status,
          body:   await attrResp.text(),
        });
      }
      continue;
    }

    const attrData = await attrResp.json() as GEApplianceAttributes;
    const attrs    = attrData.attributes ?? {};
    const raw      = JSON.stringify({ applianceId, attrs });
    const reading  = detectEventFromAttributes(applianceId, attrs, raw);

    if (!reading) continue;

    const eventName = Object.keys(reading.eventType)[0];
    const label     = appliance.nickName ?? applianceId;
    logger.info("ge-poller", eventName, { applianceId, applianceName: label });

    const result = await recordSensorEvent(reading, "GESmartHQ");
    if (result.success) {
      logger.info("ge-poller", "recorded", {
        eventId: result.eventId,
        ...(result.jobId ? { jobId: result.jobId } : {}),
      });
    } else {
      logger.error("ge-poller", "canister error", { error: result.error });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Starts the GE SmartHQ polling loop. Returns a stop function.
 * No-ops silently when tokens are absent — safe to call unconditionally.
 */
export function startGEPoller(intervalMs = 5 * 60 * 1000): () => void {
  const initial = loadTokenState();
  if (!initial) {
    logger.warn("ge-poller", "GE_ACCESS_TOKEN or GE_REFRESH_TOKEN not set — poller disabled");
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
      logger.error("ge-poller", "tick error", { error: String(err) });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  logger.info("ge-poller", "starting", { intervalSec: intervalMs / 1000 });
  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info("ge-poller", "stopped");
  };
}
