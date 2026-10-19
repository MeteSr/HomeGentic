/**
 * k6 load test — Voice Agent chat throughput (agents/voice, port 8787)
 *
 * Focused single-scenario load test for POST /api/chat.
 * Intended for CI gates and quick smoke runs.  For the full multi-scenario
 * suite (ramp + spike + soak), use voice-agent-load.js instead.
 *
 * Stages:
 *   30 s ramp  0 → 20 VU
 *   1 min hold 20 VU
 *   10 s ramp  20 → 0 VU
 *
 * Thresholds:
 *   http_req_duration  p95 < 2000 ms
 *   http_req_failed    rate < 1 %
 *
 * Usage (see tests/k6/README.md for the full setup):
 *   node tests/k6/mock-anthropic.mjs &
 *   cd agents/voice && npx wrangler dev src/index.ts --var NODE_ENV:development \
 *     --var ANTHROPIC_API_KEY:mock --var ANTHROPIC_BASE_URL:http://localhost:8788
 *   k6 run tests/k6/voice-chat.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { BASE_URL, CONTEXT, voiceHeaders, health } from "./lib/voice.js";

// ── Custom metrics ─────────────────────────────────────────────────────────────

const chatDuration   = new Trend("chat_duration_ms",  true);
const rateLimited429 = new Counter("rate_limit_429");

// ── Options ───────────────────────────────────────────────────────────────────

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "1m",  target: 20 },
    { duration: "10s", target: 0  },
  ],
  thresholds: {
    "http_req_duration": ["p(95)<2000"],
    "http_req_failed":   ["rate<0.01"],
    "chat_duration_ms":  ["p(95)<2000"],
  },
};

// ── Payloads ──────────────────────────────────────────────────────────────────

const CHAT_MESSAGES = [
  "What is the maintenance score for my home?",
  "When is my HVAC due for replacement?",
  "Are there any critical maintenance issues?",
  "What upgrades would add the most value?",
];

// ── Virtual user logic ─────────────────────────────────────────────────────────

export default function () {
  const message = CHAT_MESSAGES[Math.floor(Math.random() * CHAT_MESSAGES.length)];
  const payload = JSON.stringify({ message, context: CONTEXT });

  const res = http.post(`${BASE_URL}/api/chat`, payload, {
    headers: voiceHeaders(),
    tags:    { endpoint: "chat" },
    timeout: "10s",
  });

  chatDuration.add(res.timings.duration);

  if (res.status === 429) {
    rateLimited429.add(1);
  } else {
    check(res, {
      "chat 200":             (r) => r.status === 200,
      "chat streams text":    (r) => typeof r.body === "string" && r.body.includes('"text"'),
      "chat no server error": (r) => r.status !== 500,
    });
  }

  sleep(0.5 + Math.random() * 0.5);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

export function setup() {
  console.log("[voice-chat] k6 voice chat throughput test");
  console.log(`  Target: ${BASE_URL}`);

  const res = health();
  if (res.status !== 200 && res.status !== 503) {
    console.warn(
      `  ⚠ Health check returned ${res.status} — is the voice agent running at ${BASE_URL}?`
    );
  }
  return { startTime: Date.now() };
}

export function teardown(data) {
  const elapsed = ((Date.now() - data.startTime) / 1000).toFixed(0);
  console.log(`[voice-chat] test complete in ${elapsed}s`);
}
