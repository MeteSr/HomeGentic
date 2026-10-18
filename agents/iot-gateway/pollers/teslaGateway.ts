/**
 * Tesla Powerwall local LAN polling script.
 *
 * Uses the undocumented but stable Tesla Energy Gateway REST API (stable since 2019).
 * The gateway uses a self-signed TLS certificate; set NODE_TLS_REJECT_UNAUTHORIZED=0
 * in .env when using this integration (local-LAN only — acceptable security tradeoff).
 *
 * Session lifecycle:
 *   - POST /api/login/Basic → Bearer token (valid until password change)
 *   - Session cached in TESLA_SESSION_FILE (default: .tesla-session.json) with a
 *     30-day TTL for safety; re-authenticated automatically on expiry or 401.
 *
 * Required env vars (see .env.example):
 *   TESLA_GATEWAY_IP        — LAN IP of the Tesla Energy Gateway (default: 192.168.91.1)
 *   TESLA_EMAIL             — homeowner's Tesla/Powerwall account email
 *   TESLA_PASSWORD          — local gateway password
 *   TESLA_POWERWALL_SERIAL  — gateway serial number (used as externalDeviceId)
 */

import fs from "fs";
import path from "path";
import { handleTeslaEvent } from "../handlers";
import { recordSensorEvent } from "../icp";
import { logger } from "../logger";
import type { TeslaPowerwallEvent } from "../types";

const DEFAULT_GATEWAY_IP = "192.168.91.1";
const SESSION_TTL_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days

const SESSION_FILE = process.env.TESLA_SESSION_FILE
  ?? path.resolve(process.cwd(), ".tesla-session.json");

// ── Session state ─────────────────────────────────────────────────────────────

export interface TeslaSession {
  token:     string;
  expiresAt: number; // ms epoch
}

export function loadSession(): TeslaSession | null {
  if (fs.existsSync(SESSION_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8")) as TeslaSession;
      if (parsed.token && parsed.expiresAt && parsed.expiresAt > Date.now()) {
        return parsed;
      }
    } catch {
      logger.warn("tesla-poller", "corrupted session file — will re-authenticate");
    }
  }

  const token = process.env.TESLA_ACCESS_TOKEN;
  if (token) {
    return { token, expiresAt: Date.now() + SESSION_TTL_MS };
  }

  return null;
}

export function persistSession(session: TeslaSession): void {
  try {
    // Refresh tokens: owner-only file permissions (security audit F-14).
    fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), { encoding: "utf8", mode: 0o600 });
    fs.chmodSync(SESSION_FILE, 0o600);
  } catch (err) {
    logger.warn("tesla-poller", "failed to persist session", { error: String(err) });
  }
  process.env.TESLA_ACCESS_TOKEN = session.token;
}

export async function login(): Promise<TeslaSession> {
  const ip       = process.env.TESLA_GATEWAY_IP ?? DEFAULT_GATEWAY_IP;
  const email    = process.env.TESLA_EMAIL;
  const password = process.env.TESLA_PASSWORD;

  if (!email)    throw new Error("[tesla-poller] TESLA_EMAIL is required for authentication");
  if (!password) throw new Error("[tesla-poller] TESLA_PASSWORD is required for authentication");

  const resp = await fetch(`https://${ip}/api/login/Basic`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      username:      "customer",
      email,
      password,
      force_sm_off:  false,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`[tesla-poller] login failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as { token: string };
  if (!data.token) throw new Error("[tesla-poller] login response missing token");

  const session: TeslaSession = {
    token:     data.token,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  persistSession(session);
  logger.info("tesla-poller", "authenticated — session cached for 30 days");
  return session;
}

export async function ensureSession(session: TeslaSession | null): Promise<TeslaSession> {
  if (session && session.expiresAt > Date.now()) return session;
  return login();
}

// ── Tesla gateway API response shapes ────────────────────────────────────────

interface SoeResponse {
  percentage: number; // 0–100
}

interface GridStatusResponse {
  grid_status:          string; // "SystemGridConnected" | "SystemIslandedActive" | ...
  grid_services_active: boolean;
}

// ── Poll ──────────────────────────────────────────────────────────────────────

export async function pollOnce(session: TeslaSession): Promise<TeslaSession> {
  const ip     = process.env.TESLA_GATEWAY_IP ?? DEFAULT_GATEWAY_IP;
  const serial = process.env.TESLA_POWERWALL_SERIAL;

  if (!serial) {
    logger.error("tesla-poller", "TESLA_POWERWALL_SERIAL not set — skipping poll");
    return session;
  }

  const headers = {
    Authorization: `Bearer ${session.token}`,
    Cookie:        `AuthCookie=${session.token}`,
  };

  const soeResp = await fetch(`https://${ip}/api/system_status/soe`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  // On 401, signal that re-authentication is needed
  if (soeResp.status === 401) {
    logger.warn("tesla-poller", "session expired — will re-authenticate on next tick");
    return { ...session, expiresAt: 0 };
  }

  if (!soeResp.ok) {
    logger.error("tesla-poller", "SOE fetch failed", {
      serial,
      status: soeResp.status,
      body:   await soeResp.text(),
    });
    return session;
  }

  const soe = await soeResp.json() as SoeResponse;

  const gridResp = await fetch(`https://${ip}/api/system_status/grid_status`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!gridResp.ok) {
    logger.error("tesla-poller", "grid status fetch failed", {
      serial,
      status: gridResp.status,
      body:   await gridResp.text(),
    });
    return session;
  }

  const grid = await gridResp.json() as GridStatusResponse;

  const event: TeslaPowerwallEvent = {
    gatewaySerial:    serial,
    chargePercent:    soe.percentage,
    gridStatus:       grid.grid_status,
    hasBatteryAlerts: false,
  };

  const raw     = JSON.stringify({ soe, grid });
  const reading = handleTeslaEvent(event, raw);
  if (!reading) return session;

  const eventName = Object.keys(reading.eventType)[0];
  logger.info("tesla-poller", eventName, {
    serial,
    chargePercent: soe.percentage,
    gridStatus:    grid.grid_status,
  });

  const result = await recordSensorEvent(reading, "TeslaPowerwall");
  if (result.success) {
    logger.info("tesla-poller", "recorded", {
      eventId: result.eventId,
      ...(result.jobId ? { jobId: result.jobId } : {}),
    });
  } else {
    logger.error("tesla-poller", "canister error", { error: result.error });
  }

  return session;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Starts the Tesla Powerwall polling loop. Returns a stop function.
 * No-ops silently when TESLA_GATEWAY_IP / TESLA_EMAIL / TESLA_PASSWORD are absent.
 */
export function startTeslaPoller(intervalMs = 60_000): () => void {
  const ip       = process.env.TESLA_GATEWAY_IP ?? DEFAULT_GATEWAY_IP;
  const email    = process.env.TESLA_EMAIL;
  const password = process.env.TESLA_PASSWORD;
  const serial   = process.env.TESLA_POWERWALL_SERIAL;

  if (!email || !password || !serial) {
    logger.warn("tesla-poller", "TESLA_EMAIL, TESLA_PASSWORD, or TESLA_POWERWALL_SERIAL not set — poller disabled");
    return () => {};
  }

  let currentSession = loadSession();
  let stopped        = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      currentSession  = await ensureSession(currentSession);
      currentSession  = await pollOnce(currentSession);
    } catch (err) {
      logger.error("tesla-poller", "tick error", { error: String(err) });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  logger.info("tesla-poller", "starting", { ip, serial, intervalSec: intervalMs / 1000 });
  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info("tesla-poller", "stopped");
  };
}
