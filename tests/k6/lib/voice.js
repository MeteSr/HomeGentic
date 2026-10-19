// Shared request shape for the voice Worker load tests (voice-chat.js,
// voice-agent-load.js). Run them against a local `wrangler dev` pointed at the
// mock Anthropic API; see tests/k6/README.md.
import http from "k6/http";

export const BASE_URL = __ENV.VOICE_AGENT_URL || "http://localhost:8787";

// The context the frontend's buildContext() sends (an object, not a string).
export const CONTEXT = {
  properties: [{ id: "p1", address: "123 Main St", city: "Austin", state: "TX", yearBuilt: 2000, squareFeet: 2000 }],
  recentJobs: [{ id: "j1", serviceType: "HVAC", amount: 250000, date: "2022-06-01", status: "verified" }],
  expiringWarranties: [],
  pendingSignatureJobIds: [],
  openQuoteCount: 0,
};

// Locally (no auth canister) the Worker takes the caller from x-icp-principal,
// and wrangler dev honours a client CF-Connecting-IP. A fresh principal and IP
// per iteration keep the per-principal chat/agent quotas and the 30/min per-IP
// limit out of the way, so the test measures the Worker rather than the
// limiters (which have their own unit tests). Production overwrites
// CF-Connecting-IP and needs a real session token, so this only works locally.
export function voiceHeaders() {
  const vu = __VU, it = __ITER;
  const headers = {
    "Content-Type":     "application/json",
    "x-icp-principal":  `k6-${vu}-${it}`,
    "CF-Connecting-IP": `10.${(vu >> 8) & 255}.${vu & 255}.${(it % 250) + 1}`,
  };
  if (__ENV.VOICE_AGENT_API_KEY) headers["x-api-key"] = __ENV.VOICE_AGENT_API_KEY;
  return headers;
}

// /health answers 503 locally because production secrets are unset; that still
// proves the Worker is up, so don't count it as a failed request.
export function health(params = {}) {
  return http.get(`${BASE_URL}/health`, { ...params, responseCallback: http.expectedStatuses(200, 503) });
}
