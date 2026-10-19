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
 * Usage:
 *   cd agents/voice && MOCK_ANTHROPIC=1 npm run dev
 *   k6 run tests/k6/voice-chat.js
 *
 * Note: Set MOCK_ANTHROPIC=1 to skip real Anthropic API calls.
 *       A valid VITE_VOICE_AGENT_API_KEY is not required when running against
 *       a local dev server — the dev server accepts unauthenticated requests.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.VOICE_AGENT_URL || "http://localhost:8787";

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

const MOCK_CONTEXT = JSON.stringify({
  properties: [
    {
      id: 1,
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      yearBuilt: 2000,
      squareFeet: 2000,
    },
  ],
  jobs: [
    {
      id: "j1",
      serviceType: "HVAC",
      amount: 250000,
      date: "2022-06-01",
      isDiy: false,
      verified: true,
    },
  ],
});

const CHAT_MESSAGES = [
  "What is the maintenance score for my home?",
  "When is my HVAC due for replacement?",
  "Are there any critical maintenance issues?",
  "What upgrades would add the most value?",
];

const HEADERS = { "Content-Type": "application/json" };

// ── Virtual user logic ─────────────────────────────────────────────────────────

export default function () {
  const message = CHAT_MESSAGES[Math.floor(Math.random() * CHAT_MESSAGES.length)];
  const payload = JSON.stringify({ message, context: MOCK_CONTEXT });

  const res = http.post(`${BASE_URL}/api/chat`, payload, {
    headers: HEADERS,
    tags:    { endpoint: "chat" },
    timeout: "10s",
  });

  chatDuration.add(res.timings.duration);

  if (res.status === 429) {
    rateLimited429.add(1);
  } else {
    check(res, {
      "chat 200":             (r) => r.status === 200,
      "chat no server error": (r) => r.status !== 500,
    });
  }

  sleep(0.5 + Math.random() * 0.5);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

export function setup() {
  console.log("[voice-chat] k6 voice chat throughput test");
  console.log(`  Target: ${BASE_URL}`);

  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
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
