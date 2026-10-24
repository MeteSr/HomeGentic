/**
 * k6 load test — IoT Gateway (agents/iot-gateway, port 3002)
 *
 * Three scenarios (run sequentially, staggered via startTime):
 *   webhook_burst   — ramp 0→100 VU in 30 s, hold 1 min  (alert storm simulation)
 *   polling_steady  — 10 VU constant for 10 min             (Ecobee-style background polling)
 *   spike           — 0→500 VU in 10 s, hold 30 s          (worst-case flood alert broadcast)
 *
 * The gateway rejects unsigned webhooks, so start it with test secrets and
 * pass the same values to k6, which signs every request: Nest gets the secret
 * as a bearer token, Ecobee and Moen Flo get an HMAC-SHA256 of the body.
 * IOT_GATEWAY_DRY_RUN=1 makes the gateway skip the sensor-canister call, so
 * this measures the gateway (auth, validation, replay checks, dispatch), not
 * the canister.
 *
 * Every VU sends from one IP, so the per-IP webhook limiters (60/min Nest and
 * Ecobee, 100/15 min Moen Flo) answer most requests with 429 once warmed up.
 * 429 counts as an expected response; the rate_limit_429 counter reports how
 * many there were.
 *
 * Usage:
 *   cd agents/iot-gateway && SENSOR_CANISTER_ID=dummy IOT_GATEWAY_DRY_RUN=1 \
 *     NEST_WEBHOOK_SECRET=k6-nest ECOBEE_WEBHOOK_SECRET=k6-ecobee \
 *     MOEN_FLO_WEBHOOK_SECRET=k6-moen npm run dev
 *   k6 run tests/k6/iot-gateway-load.js
 *   k6 run --env IOT_GATEWAY_URL=http://staging:3002 tests/k6/iot-gateway-load.js
 *
 * CI mode (set automatically by GitHub Actions):
 *   CI=true k6 run tests/k6/iot-gateway-load.js
 *   polling_steady duration is reduced to 2 min; spike is capped at 100 VU.
 */

import http from "k6/http";
import crypto from "k6/crypto";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.IOT_GATEWAY_URL || "http://localhost:3002";
const IS_CI    = !!__ENV.CI;

// Must match the gateway's *_WEBHOOK_SECRET values (defaults match the README).
const NEST_SECRET   = __ENV.NEST_WEBHOOK_SECRET     || "k6-nest";
const ECOBEE_SECRET = __ENV.ECOBEE_WEBHOOK_SECRET   || "k6-ecobee";
const MOEN_SECRET   = __ENV.MOEN_FLO_WEBHOOK_SECRET || "k6-moen";

// Rate-limited requests are the gateway working as designed, not failures.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 429));

// ── Custom metrics ─────────────────────────────────────────────────────────────

const nestDuration    = new Trend("nest_duration_ms",    true);
const ecobeeDuration  = new Trend("ecobee_duration_ms",  true);
const moenFloDuration = new Trend("moen_flo_duration_ms", true);
const healthDuration  = new Trend("health_duration_ms",  true);
const rateLimited429  = new Counter("rate_limit_429");

// ── Scenarios ─────────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Many devices firing simultaneously — e.g. Nest motion events after a power restore.
    webhook_burst: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 100 },
        { duration: "1m",  target: 100 },
        { duration: "15s", target: 0   },
      ],
      gracefulRampDown: "15s",
      tags: { scenario: "webhook_burst" },
    },

    // Background polling from many properties.  Each VU represents one property
    // whose hub periodically pushes thermostat state to the gateway.
    polling_steady: {
      executor:  "constant-vus",
      vus:       10,
      duration:  IS_CI ? "2m" : "10m",
      startTime: "2m",
      tags: { scenario: "polling_steady" },
    },

    // Worst-case flood alert broadcast — all Moen Flo devices trigger LEAK simultaneously.
    spike: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: IS_CI ? 100 : 500 },
        { duration: "30s", target: IS_CI ? 100 : 500 },
        { duration: "10s", target: 0 },
      ],
      startTime: IS_CI ? "5m" : "13m",
      tags: { scenario: "spike" },
    },
  },

  thresholds: {
    // Overall request latency and failure rate
    "http_req_duration": ["p(95)<500"],
    "http_req_failed":   ["rate<0.01"],

    // Per-endpoint latency (webhook handlers must be fast — no blocking ICP calls)
    "nest_duration_ms":     ["p(95)<300"],
    "ecobee_duration_ms":   ["p(95)<300"],
    "moen_flo_duration_ms": ["p(95)<300"],
    "health_duration_ms":   ["p(99)<50"],

    // 429s are expected under spike (rate limiter working correctly).
    // No threshold here — the count is logged for review, not failed.
  },
};

// ── Minimal valid payloads ─────────────────────────────────────────────────────
//
// These mirror the shapes expected by handlers.ts.  Fields are present but
// minimal — the goal is exercising parsing, signature checks, and handler dispatch.

const JSON_HEADERS = { "Content-Type": "application/json" };

function signed(header, secret, body) {
  return { ...JSON_HEADERS, [header]: `sha256=${crypto.hmac("sha256", secret, body, "hex")}` };
}

function nestPayload() {
  return JSON.stringify({
    eventId:  `load-${__VU}-${__ITER}`,
    timestamp: new Date().toISOString(),
    resourceUpdate: {
      name: `enterprises/load-test-project/devices/load-device-${__VU}`,
      // Below the pipe-freeze threshold, so the gateway records a LowTemperature event.
      traits: {
        "sdm.devices.traits.Temperature": { ambientTemperatureCelsius: 2 },
      },
    },
  });
}

function ecobeePayload() {
  return JSON.stringify({
    thermostatId: `load-thermo-${__VU}`,
    alerts: [
      {
        alertType: "hvacError",
        severity:  "WARNING",
        message:   `Load test maintenance alert ${__VU}-${__ITER}`,
        value:     1,
      },
    ],
    runtime: {
      actualTemperature: 720, // 72.0 °F stored in 10ths of a degree
      actualHumidity:    45,
    },
  });
}

function moenFloPayload() {
  return JSON.stringify({
    deviceId:  `load-device-${__VU}`,
    alertType: "LEAK",
    severity:  "critical",
    timestamp: new Date().toISOString(),
  });
}

// ── Virtual user logic ─────────────────────────────────────────────────────────

export default function () {
  const r = Math.random();

  // ~10 % of requests probe /health (baseline latency reference)
  if (r < 0.1) {
    const res = http.get(`${BASE_URL}/health`, { tags: { endpoint: "health" } });
    healthDuration.add(res.timings.duration);
    check(res, { "health 200": (r) => r.status === 200 });
    sleep(0.1);
    return;
  }

  // Remaining 90 %: distribute evenly across the three webhook endpoints
  let res;
  if (r < 0.4) {
    res = http.post(
      `${BASE_URL}/webhooks/nest`,
      nestPayload(),
      { headers: { ...JSON_HEADERS, Authorization: `Bearer ${NEST_SECRET}` }, tags: { endpoint: "nest" } }
    );
    nestDuration.add(res.timings.duration);
  } else if (r < 0.7) {
    const body = ecobeePayload();
    res = http.post(
      `${BASE_URL}/webhooks/ecobee`,
      body,
      { headers: signed("X-Ecobee-Signature", ECOBEE_SECRET, body), tags: { endpoint: "ecobee" } }
    );
    ecobeeDuration.add(res.timings.duration);
  } else {
    const body = moenFloPayload();
    res = http.post(
      `${BASE_URL}/webhooks/moen-flo`,
      body,
      { headers: signed("X-Moen-Signature", MOEN_SECRET, body), tags: { endpoint: "moen-flo" } }
    );
    moenFloDuration.add(res.timings.duration);
  }

  if (res.status === 429) rateLimited429.add(1);

  check(res, {
    // 200 = processed; 202 = queued; 429 = rate limited (all correct gateway responses)
    "gateway accepted": (r) => r.status === 200 || r.status === 202 || r.status === 429,
  });

  // Small random think time — keeps request rate realistic and avoids thundering-herd
  // artefacts from all VUs firing simultaneously at scenario start.
  sleep(Math.random() * 0.3);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

export function setup() {
  console.log("[iot-gateway-load] k6 IoT gateway load test");
  console.log(`  Target:  ${BASE_URL}`);
  console.log(`  CI mode: ${IS_CI}`);

  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    console.warn(
      `  ⚠ Health check returned ${res.status} — is the gateway running at ${BASE_URL}?`
    );
  }
  return { startTime: Date.now() };
}

export function teardown(data) {
  const elapsed = ((Date.now() - data.startTime) / 1000).toFixed(0);
  console.log(`[iot-gateway-load] test complete in ${elapsed}s`);
}
