/**
 * Enphase IQ Gateway / Envoy local REST polling script.
 *
 * Polls the Envoy's LAN HTTPS API — no cloud dependency, sub-minute data.
 * The Envoy uses a self-signed TLS certificate; set NODE_TLS_REJECT_UNAUTHORIZED=0
 * in .env when using this integration (local-LAN only — acceptable security tradeoff).
 *
 * Token lifecycle:
 *   - JWT token obtained via entrez.enphaseenergy.com is valid for ~1 year.
 *   - The poller loads the token from ENPHASE_ENVOY_TOKEN and does not auto-refresh.
 *     Rotate the token manually when it expires (see README for the curl command).
 *
 * Required env vars (see .env.example):
 *   ENPHASE_ENVOY_IP     — LAN IP of the IQ Gateway (e.g. 192.168.1.42)
 *   ENPHASE_ENVOY_TOKEN  — long-lived JWT from entrez.enphaseenergy.com
 *   ENPHASE_SERIAL       — Envoy serial number (used as externalDeviceId)
 */

import { handleEnphaseEvent } from "../handlers";
import { recordSensorEvent } from "../icp";
import { logger } from "../logger";
import type { EnphaseSystemEvent } from "../types";

const ENVOY_API            = "https"; // scheme prefix — full URL built at call time
const STALE_INVERTER_SECS  = 15 * 60; // 15 minutes — inverter considered faulted if older

// ── Config ────────────────────────────────────────────────────────────────────

export interface EnphaseConfig {
  token:  string;
  ip:     string;
  serial: string;
}

export function loadConfig(): EnphaseConfig | null {
  const token  = process.env.ENPHASE_ENVOY_TOKEN;
  const ip     = process.env.ENPHASE_ENVOY_IP;
  const serial = process.env.ENPHASE_SERIAL;
  if (!token || !ip || !serial) return null;
  return { token, ip, serial };
}

// ── Envoy API response shapes ─────────────────────────────────────────────────

interface EnvoyProduction {
  wNow:        number; // current watts
  whLifetime:  number;
  readingTime: number; // Unix seconds
}

interface EnvoyInverter {
  serialNumber:    string;
  lastReportDate:  number; // Unix seconds
  lastReportWatts: number;
  maxReportWatts:  number;
}

// ── Poll ──────────────────────────────────────────────────────────────────────

function isDaylight(): boolean {
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19; // 7am–7pm heuristic
}

export async function pollOnce(config: EnphaseConfig): Promise<void> {
  const base = `${ENVOY_API}://${config.ip}`;

  // Fetch system-level production
  const prodResp = await fetch(`${base}/api/v1/production`, {
    headers: { Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!prodResp.ok) {
    logger.error("enphase-poller", "production fetch failed", {
      serial: config.serial,
      status: prodResp.status,
      body:   await prodResp.text(),
    });
    return;
  }

  const production = await prodResp.json() as EnvoyProduction;

  // Fetch per-inverter status
  const invResp = await fetch(`${base}/api/v1/production/inverters`, {
    headers: { Authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!invResp.ok) {
    logger.error("enphase-poller", "inverters fetch failed", {
      serial: config.serial,
      status: invResp.status,
      body:   await invResp.text(),
    });
    return;
  }

  const inverters = await invResp.json() as EnvoyInverter[];
  const nowSecs   = Math.floor(Date.now() / 1000);
  const daylight  = isDaylight();

  // An inverter is faulted if it hasn't reported within the stale threshold during daylight.
  const faultedInverters = daylight
    ? inverters.filter(inv => nowSecs - inv.lastReportDate > STALE_INVERTER_SECS).length
    : 0;

  const event: EnphaseSystemEvent = {
    systemSerial:     config.serial,
    wNow:             production.wNow,
    faultedInverters,
    isDaylight:       daylight,
  };

  const raw     = JSON.stringify({ production, inverterCount: inverters.length, faultedInverters });
  const reading = handleEnphaseEvent(event, raw);
  if (!reading) return;

  const eventName = Object.keys(reading.eventType)[0];
  logger.info("enphase-poller", eventName, {
    serial:           config.serial,
    powerW:           production.wNow,
    faultedInverters,
  });

  const result = await recordSensorEvent(reading, "EnphaseEnvoy");
  if (result.success) {
    logger.info("enphase-poller", "recorded", {
      eventId: result.eventId,
      ...(result.jobId ? { jobId: result.jobId } : {}),
    });
  } else {
    logger.error("enphase-poller", "canister error", { error: result.error });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Starts the Enphase polling loop. Returns a stop function.
 * No-ops silently when ENPHASE_ENVOY_IP / ENPHASE_ENVOY_TOKEN / ENPHASE_SERIAL are absent.
 */
export function startEnphasePoller(intervalMs = 60_000): () => void {
  const config = loadConfig();
  if (!config) {
    logger.warn("enphase-poller", "ENPHASE_ENVOY_IP, ENPHASE_ENVOY_TOKEN, or ENPHASE_SERIAL not set — poller disabled");
    return () => {};
  }

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  async function tick(): Promise<void> {
    if (stopped) return;
    try {
      await pollOnce(config!);
    } catch (err) {
      logger.error("enphase-poller", "tick error", { error: String(err) });
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs);
      }
    }
  }

  logger.info("enphase-poller", "starting", {
    ip:          config.ip,
    serial:      config.serial,
    intervalSec: intervalMs / 1000,
  });
  tick();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    logger.info("enphase-poller", "stopped");
  };
}
