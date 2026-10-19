/**
 * /api/chat with a partial context. buildSystemPrompt reads expiringWarranties,
 * pendingSignatureJobIds and openQuoteCount unguarded; before sanitiseContext
 * defaulted them, a client that left one out (the k6 load test did) got a 200
 * with an empty stream.
 *
 * CTX.1  a context missing the warranty / signature / quote fields still streams
 * CTX.2  a non-object context still streams
 */

jest.mock("../paymentCanister", () => ({
  activateInCanister: jest.fn(), activateSubscriptionUntil: jest.fn(),
  consumeAgentCredit: jest.fn(), grantAgentCreditsOnce: jest.fn(),
  AlreadyConsumedError: class AlreadyConsumedError extends Error {},
  PAID_TIERS: new Set(["Pro", "ContractorPro"]), fetchSubscriptionTier: jest.fn().mockResolvedValue("Free"),
}));
jest.mock("../monitoringCanister", () => ({
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels: jest.fn().mockResolvedValue([]),
  recordFrontendError: jest.fn(),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
jest.mock("../anthropicProvider", () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({
    complete: jest.fn(), completeWithTools: jest.fn(),
    stream: async function* () { yield { text: "Looks good." }; },
  })),
}));
jest.mock("../src/tier", () => ({ resolveTier: jest.fn().mockResolvedValue("Pro") }));

import { describe, it, expect } from "@jest/globals";
import worker from "../src/index";

function fakeKV() {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
  } as unknown as KVNamespace;
}

// Local dev shape: no API key or auth canister, so the principal comes from x-icp-principal.
const env: any = { ANTHROPIC_API_KEY: "sk-ant", NODE_ENV: "development", RATE_LIMIT: fakeKV() };
const ctx: any = { waitUntil: () => {} };

async function chat(context: unknown): Promise<string> {
  const res = await worker.fetch(new Request("https://worker.test/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-icp-principal": "user-ctx" },
    body: JSON.stringify({ message: "How is my HVAC?", context }),
  }), env, ctx);
  expect(res.status).toBe(200);
  return res.text();
}

describe("/api/chat with a partial context", () => {
  it("CTX.1 streams when the warranty, signature and quote fields are missing", async () => {
    const body = await chat({ properties: [{ id: "p1", address: "1 Main St" }], recentJobs: [] });
    expect(body).toContain('"text":"Looks good."');
    expect(body).toContain("[DONE]");
  });

  it("CTX.2 streams when the context isn't an object", async () => {
    const body = await chat(JSON.stringify({ properties: [] }));
    expect(body).toContain('"text":"Looks good."');
  });
});
