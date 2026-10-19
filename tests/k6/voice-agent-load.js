/**
 * 13.6.2 — k6 load test suite: HomeGentic voice agent Worker
 *
 * Targets the voice agent server running at http://localhost:8787
 * (agents/voice/src/index.ts via wrangler dev, port 8787).
 *
 * Scenarios:
 *   ramp     — 0 → 50 VU over 2 minutes, then 50 VU for 3 minutes
 *   spike    — burst to 200 VU for 30 seconds (simulates viral share event)
 *   soak     — 25 VU sustained for 10 minutes (steady-state leak detection)
 *
 * Endpoints exercised:
 *   POST /api/chat    — SSE streaming chat (short voice responses)
 *   POST /api/agent   — Agentic tool-use loop (one turn)
 *   GET  /health      — Liveness probe (cheap, used to measure base overhead)
 *
 * Thresholds (all must pass for the test to succeed):
 *   http_req_duration{endpoint:chat}   p95 < 3000ms
 *   http_req_duration{endpoint:agent}  p95 < 5000ms  (tool-use adds latency)
 *   http_req_duration{endpoint:health} p99 < 50ms
 *   http_req_failed                    rate < 0.05   (< 5% errors)
 *   rate_limit_429                     rate < 0.01   (< 1% rate-limit hits)
 *
 * Usage: start the mock Anthropic API and wrangler dev as in tests/k6/README.md, then
 *   k6 run tests/k6/voice-agent-load.js
 *
 * Local only: a deployed Worker needs a real session token per request and
 * rate-limits by the real client IP (see lib/voice.js).
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";
import { BASE_URL, CONTEXT, voiceHeaders, health } from "./lib/voice.js";

// ─── Configuration ────────────────────────────────────────────────────────────


// ─── Custom metrics ───────────────────────────────────────────────────────────

const rateLimitHits  = new Counter("rate_limit_429");
const chatDuration   = new Trend("chat_duration_ms",   true);
const agentDuration  = new Trend("agent_duration_ms",  true);
const healthDuration = new Trend("health_duration_ms", true);

// ─── Thresholds ───────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Scenario 1: Ramp 1 → 50 VU, hold 3 min
    ramp: {
      executor:  "ramping-vus",
      startVUs:  1,
      stages: [
        { duration: "2m",  target: 50  },   // ramp up
        { duration: "3m",  target: 50  },   // hold
        { duration: "30s", target: 0   },   // ramp down
      ],
      gracefulRampDown: "30s",
      tags: { scenario: "ramp" },
    },

    // Scenario 2: Spike to 200 VU for 30s
    spike: {
      executor:  "ramping-vus",
      startTime: "6m",   // starts after ramp finishes
      startVUs:  0,
      stages: [
        { duration: "10s", target: 200 },   // instant spike
        { duration: "30s", target: 200 },   // hold spike
        { duration: "20s", target: 0   },   // recover
      ],
      tags: { scenario: "spike" },
    },

    // Scenario 3: Soak test — 25 VU for 10 min (memory leak / degradation detection)
    soak: {
      executor:  "constant-vus",
      startTime: "7m30s",
      vus:       25,
      duration:  "10m",
      tags:      { scenario: "soak" },
    },
  },

  thresholds: {
    // chat endpoint: p95 < 3s  (voice response latency budget)
    "chat_duration_ms":                 ["p(95)<3000"],
    // agent endpoint: p95 < 5s  (tool-use adds Claude API round-trip)
    "agent_duration_ms":                ["p(95)<5000"],
    // health: p99 < 50ms  (no overhead)
    "health_duration_ms":               ["p(99)<50"],
    // overall: < 5% of all requests fail
    "http_req_failed":                  ["rate<0.05"],
    // rate limiter should almost never fire under normal load
    "rate_limit_429":                   ["count<10"],
  },
};

// ─── Payloads ─────────────────────────────────────────────────────────────────


const CHAT_PAYLOADS = [
  { message: "What is the maintenance score for my home?",    context: CONTEXT },
  { message: "When is my HVAC due for replacement?",          context: CONTEXT },
  { message: "What is the estimated value of my home improvements?", context: CONTEXT },
  { message: "Are there any critical maintenance issues?",    context: CONTEXT },
];

const AGENT_PAYLOADS = [
  { messages: [{ role: "user", content: "Summarise the maintenance history" }],      context: CONTEXT },
  { messages: [{ role: "user", content: "What upgrades would add the most value?" }], context: CONTEXT },
];

// ─── VU behaviour ─────────────────────────────────────────────────────────────

export default function () {
  const headers = voiceHeaders();

  // ── Health check (every VU, every iteration) ──────────────────────────────
  {
    const t0  = Date.now();
    const res = health({ tags: { endpoint: "health" } });
    healthDuration.add(Date.now() - t0);

    check(res, {
      "health responds": (r) => r.status === 200 || r.status === 503,
    });

    if (res.status === 429) rateLimitHits.add(1);
  }

  sleep(0.1);

  // ── POST /api/chat ────────────────────────────────────────────────────────
  {
    const payload = CHAT_PAYLOADS[Math.floor(Math.random() * CHAT_PAYLOADS.length)];
    const t0      = Date.now();
    const res     = http.post(
      `${BASE_URL}/api/chat`,
      JSON.stringify(payload),
      { headers, tags: { endpoint: "chat" }, timeout: "10s" }
    );
    chatDuration.add(Date.now() - t0);

    if (res.status === 429) {
      rateLimitHits.add(1);
    } else {
      check(res, {
        "chat 200":             (r) => r.status === 200,
        "chat streams text":    (r) => typeof r.body === "string" && r.body.includes('"text"'),
        "chat no server error": (r) => r.status !== 500,
      });
    }
  }

  sleep(0.5 + Math.random() * 0.5);   // realistic think time between voice utterances

  // ── POST /api/agent (every 3rd iteration to avoid exhausting token budget) ─
  if (Math.random() < 0.33) {
    const payload = AGENT_PAYLOADS[Math.floor(Math.random() * AGENT_PAYLOADS.length)];
    const t0      = Date.now();
    const res     = http.post(
      `${BASE_URL}/api/agent`,
      JSON.stringify(payload),
      { headers, tags: { endpoint: "agent" }, timeout: "15s" }
    );
    agentDuration.add(Date.now() - t0);

    if (res.status === 429) {
      rateLimitHits.add(1);
    } else {
      check(res, {
        "agent 200":            (r) => r.status === 200,
        "agent no server error": (r) => r.status !== 500,
      });
    }
  }

  sleep(1 + Math.random());   // longer think time after agentic turn
}

// ─── Setup / teardown (printed to k6 output) ─────────────────────────────────

export function setup() {
  console.log(`[13.6.2] k6 voice-agent load test`);
  console.log(`  Target: ${BASE_URL}`);

  // Verify server is reachable before starting load
  const res = health();
  if (res.status !== 200 && res.status !== 503) {
    console.warn(`  ⚠ Health check failed (${res.status}) — server may not be running`);
  }
  return { startTime: Date.now() };
}

export function teardown(data) {
  const elapsed = ((Date.now() - data.startTime) / 1000).toFixed(0);
  console.log(`[13.6.2] Test complete in ${elapsed}s`);
}
