/**
 * Every route that spends Claude (or a paid API) goes through the same gate,
 * in the same order: session → aiGate (backoff, human check, free budget) →
 * per-tier limit → the model, once (test-gap audit 2026-11-03, H2; reopens
 * cycle-drain CD-1 if broken).
 *
 * ROUTES.1 the table below covers every route in AUX_AI_ROUTES, plus /api/chat
 *          and /api/agent
 * ROUTES.2 <route>: no session → 401 and the model isn't called
 * ROUTES.3 <route>: a free account without the human check → 403, no call
 * ROUTES.4 <route>: a verified free account over the shared daily budget →
 *          429, no call
 * ROUTES.5 <route>: a Pro caller under its limits → 200 and exactly one model
 *          call (one upstream request for the paid-API route)
 * ROUTES.6 <route>: a free caller over the per-tier limit → 429, no call
 * ROUTES.8 /api/buyers-truth-kit rejects a missing address, a yearBuilt
 *          before 1800 and missing claims with 400, without a model call
 * ROUTES.7 static: no route handler in src/index.ts uses `provider` unless the
 *          route is gated (AUX_AI_ROUTES, or /api/chat and /api/agent, which
 *          call aiGate themselves)
 */

jest.mock("../paymentCanister", () => ({
  activateInCanister: jest.fn(),
  activateSubscriptionUntil: jest.fn(),
  consumeAgentCredit: jest.fn().mockRejectedValue(new Error("none")),
  grantAgentCreditsOnce: jest.fn(),
  AlreadyConsumedError: class AlreadyConsumedError extends Error {},
  PAID_TIERS: new Set(["Pro", "ContractorPro"]),
  fetchSubscriptionTier: jest.fn().mockResolvedValue("Free"),
}));
jest.mock("../monitoringCanister", () => ({
  recordServiceError: jest.fn().mockResolvedValue(undefined),
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels: jest.fn().mockResolvedValue([]),
  recordFrontendError: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
const mockModelCalls = jest.fn();
jest.mock("../anthropicProvider", () => ({
  AnthropicProvider: jest.fn().mockImplementation(function (this: any) {
    this.onUsage = null;
    const usage = () => this.onUsage?.({ inputTokens: 400, outputTokens: 100 });
    this.complete = async () => {
      mockModelCalls("complete");
      usage();
      return '{"ok":true}';
    };
    this.stream = async function* () {
      mockModelCalls("stream");
      usage();
      yield { text: "hi" };
    };
    this.completeWithTools = async () => {
      mockModelCalls("completeWithTools");
      usage();
      return { type: "answer", text: "done", toolCalls: [], stopReason: "end_turn", content: [] };
    };
  }),
}));
jest.mock("../src/session", () => ({
  SESSION_HEADER: "x-agent-session",
  resolveSessionPrincipal: jest.fn(async (token: string | null) => (token?.startsWith("hgs_") ? token.slice(4) : null)),
}));
jest.mock("../src/tier", () => ({
  resolveTier: jest.fn(async (p: string) => (p.startsWith("pro") ? "Pro" : "Free")),
}));

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { readFileSync } from "fs";
import { resolve } from "path";
import { createHmac } from "crypto";
import { RateLimiterDO, type CounterNamespace, type CounterStorage } from "../src/rateLimiterDO";
import { recordFreeUsage } from "../src/aiGuard";
import { hitCounter, AUX_AI_DAILY_LIMITS } from "../src/rateLimiter";
import { CHAT_LIMITS, TIER_LIMITS } from "../agentLimiter";
import worker from "../src/index";

const SRC = readFileSync(resolve(__dirname, "../src/index.ts"), "utf8");
const AUX_AI_ROUTES = [
  ...(SRC.match(/const AUX_AI_ROUTES = new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? "").matchAll(/"([^"]+)"/g),
].map((m) => m[1]);

function fakeStorage(): CounterStorage {
  const data = new Map<string, unknown>();
  return {
    async get<T>(k: string) {
      return data.get(k) as T | undefined;
    },
    async put<T>(k: string, v: T) {
      data.set(k, v);
    },
    async deleteAll() {
      data.clear();
    },
    async setAlarm() {},
  };
}
function fakeNamespace(): CounterNamespace {
  const objects = new Map<string, RateLimiterDO>();
  return {
    idFromName: (name: string) => name,
    get: (id: string) => {
      if (!objects.has(id)) objects.set(id, new RateLimiterDO({ storage: fakeStorage() }));
      const obj = objects.get(id)!;
      return { fetch: (_u: string, init?: RequestInit) => obj.fetch(new Request("https://do/", init)) };
    },
  };
}
function fakeKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => {
      store.set(k, v);
    },
    delete: async (k: string) => {
      store.delete(k);
    },
  } as unknown as KVNamespace;
}

const API_KEY = "pubkey";
const env = (): any => ({
  ANTHROPIC_API_KEY: "sk-ant",
  VOICE_AGENT_API_KEY: API_KEY,
  FRONTEND_ORIGIN: "https://app.test",
  NODE_ENV: "production",
  CANISTER_ID_AUTH: "auth-id",
  RENTCAST_API_KEY: "rc-key",
  RATE_LIMIT: fakeKV(),
  RATE_LIMITER: fakeNamespace(),
  TURNSTILE_SECRET_KEY: "ts-secret",
  TURNSTILE_SITE_KEY: "ts-site",
});

const claim = { status: "original" };
const upload = { fileName: "r.png", mimeType: "image/png", base64Data: "aGk=" };

/** One valid request per gated route, and what it spends. */
const ROUTES: Record<string, { body: unknown; spends: "complete" | "stream" | "completeWithTools" | "upstream" }> = {
  "/api/maintenance/chat": { body: { message: "Gutters?", context: {} }, spends: "stream" },
  "/api/classify": { body: upload, spends: "complete" },
  "/api/extract-bill": { body: upload, spends: "complete" },
  "/api/extract-document": { body: upload, spends: "complete" },
  "/api/efficiency-alert": {
    body: { usageTrend: [100, 100, 300, 300].map((usageAmount) => ({ usageAmount, usageUnit: "kWh" })) },
    spends: "complete",
  },
  "/api/bills-insights": {
    body: {
      asOf: "2026-11-01",
      next12TotalCents: 120_000,
      avgMonthlyCents: 10_000,
      series: [{ key: "housing:Mortgage", method: "schedule", confidence: "high", next12Cents: 120_000 }],
      insights: [],
    },
    spends: "complete",
  },
  "/api/rebate-finder": {
    body: { state: "FL", zipCode: "32801", utilityProvider: "FPL", billType: "Electric" },
    spends: "complete",
  },
  "/api/telecom-negotiate": {
    body: { provider: "Comcast", amountCents: 8_000, mbps: 300, zipCode: "32801" },
    spends: "complete",
  },
  "/api/pulse": { body: { propertyId: "p1", zipCode: "32801" }, spends: "complete" },
  "/api/negotiate": {
    body: {
      quote: { id: "q1", amountCents: 500_000 },
      request: { serviceType: "HVAC" },
      zip: "32801",
      benchmark: { median: 450_000, p25: 400_000, p75: 500_000 },
    },
    spends: "complete",
  },
  "/api/insurer-discount": { body: { state: "FL", zipCode: "32801" }, spends: "complete" },
  "/api/buyers-truth-kit": {
    body: {
      address: "1 Main St, Orlando, FL 32801",
      yearBuilt: 1990,
      claims: {
        roof: claim,
        hvacPrimary: claim,
        hvacSecondary: { ...claim, present: false },
        waterHeater: claim,
        electrical: claim,
        plumbing: claim,
        windows: claim,
        foundation: claim,
      },
    },
    spends: "complete",
  },
  "/api/rentcast/properties": { body: { address: "1 Main St, Orlando, FL 32801" }, spends: "upstream" },
  "/api/chat": { body: { message: "Hi", context: {} }, spends: "stream" },
  "/api/agent": { body: { messages: [{ role: "user", content: "Hi" }] }, spends: "completeWithTools" },
};
const PATHS = Object.keys(ROUTES);

let ipSeq = 0;
let userSeq = 0;
const post = (path: string, session: string | null) => {
  const body = ROUTES[path].body as any;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "CF-Connecting-IP": `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
  };
  if (session) headers["x-agent-session"] = session;
  if (body.context)
    headers["x-context-hmac"] = createHmac("sha256", API_KEY).update(JSON.stringify(body.context)).digest("hex");
  return new Request(`https://worker.test${path}`, { method: "POST", headers, body: JSON.stringify(body) });
};

describe("gated AI routes", () => {
  let waits: Promise<unknown>[];
  const ctx: any = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
  const flush = async () => {
    while (waits.length) await Promise.all(waits.splice(0));
  };
  const realFetch = global.fetch;
  let upstream: jest.Mock;
  const send = async (path: string, session: string | null, e = env()) => {
    const res = await worker.fetch(post(path, session), e, ctx);
    await res.text(); // drain SSE bodies so streams run
    await flush();
    return res;
  };
  const spent = (path: string) =>
    ROUTES[path].spends === "upstream" ? upstream.mock.calls.length : mockModelCalls.mock.calls.length;
  const verifiedFree = async (e: any) => {
    const who = `free${++userSeq}`;
    await hitCounter(e, `human:${who}`, 1, 3600);
    return who;
  };

  beforeEach(() => {
    waits = [];
    mockModelCalls.mockReset();
    // Permit lookups, geocoding and Rentcast: an upstream that answers empty.
    upstream = jest.fn(
      async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    global.fetch = upstream as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("ROUTES.1 the table covers every gated route", () => {
    expect(AUX_AI_ROUTES.length).toBeGreaterThan(10);
    expect([...PATHS].sort()).toEqual([...AUX_AI_ROUTES, "/api/chat", "/api/agent"].sort());
  });

  it.each(PATHS)("ROUTES.2 %s: no session → 401, nothing spent", async (path) => {
    const res = await send(path, null);
    expect(res.status).toBe(401);
    expect(spent(path)).toBe(0);
  });

  it.each(PATHS)("ROUTES.3 %s: free account without the human check → 403, nothing spent", async (path) => {
    const res = await send(path, `hgs_free${++userSeq}`);
    expect(res.status).toBe(403);
    expect(spent(path)).toBe(0);
  });

  it.each(PATHS)("ROUTES.4 %s: verified free account over the shared budget → 429, nothing spent", async (path) => {
    const e = env();
    const who = await verifiedFree(e);
    await recordFreeUsage(e, { inputTokens: 1_000_000_000, outputTokens: 0 });
    const res = await send(path, `hgs_${who}`, e);
    expect(res.status).toBe(429);
    expect(spent(path)).toBe(0);
  });

  it.each(PATHS)("ROUTES.5 %s: Pro caller → 200 and one call", async (path) => {
    const res = await send(path, `hgs_pro${++userSeq}`);
    expect(res.status).toBe(200);
    expect(spent(path)).toBe(1);
  });

  it.each(PATHS)("ROUTES.6 %s: free caller over the tier limit → 429, nothing spent", async (path) => {
    const e = env();
    const who = await verifiedFree(e);
    const limit =
      path === "/api/chat" ? CHAT_LIMITS.Free : path === "/api/agent" ? TIER_LIMITS.Free : AUX_AI_DAILY_LIMITS.Free;
    for (let i = 0; i < limit; i++) expect((await send(path, `hgs_${who}`, e)).status).toBe(200);
    const before = spent(path);
    const res = await send(path, `hgs_${who}`, e);
    expect(res.status).toBe(429);
    expect(spent(path)).toBe(before);
  });
});

describe("ROUTES.8 /api/buyers-truth-kit input validation", () => {
  const good = ROUTES["/api/buyers-truth-kit"].body as Record<string, unknown>;
  const ask = async (body: unknown) => {
    const req = new Request("https://worker.test/api/buyers-truth-kit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": API_KEY,
        "x-agent-session": `hgs_pro${++userSeq}`,
        "CF-Connecting-IP": "10.8.0.1",
      },
      body: JSON.stringify(body),
    });
    return worker.fetch(req, env(), { waitUntil: () => {} } as any);
  };
  beforeEach(() => mockModelCalls.mockReset());

  it.each([
    ["a missing address", { ...good, address: undefined }, "address is required"],
    ["yearBuilt before 1800", { ...good, yearBuilt: 1799 }, "yearBuilt must be a valid year"],
    ["missing claims", { ...good, claims: undefined }, "claims are required"],
  ])("rejects %s with 400", async (_what, body, error) => {
    const res = await ask(body);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
    expect(mockModelCalls).not.toHaveBeenCalled();
  });
});

describe("ROUTES.7 static: provider is only used behind the gate", () => {
  it("every route handler that touches `provider` is a gated route", () => {
    const router = SRC.slice(0, SRC.indexOf("// ── Route groups"));
    // Each `if (path === "…"` and its block, matched by braces.
    const handlers = [...router.matchAll(/if \(path === "/g)].map((m) => {
      let i = router.indexOf("{", m.index!);
      for (let depth = 0; i < router.length; i++) {
        if (router[i] === "{") depth++;
        else if (router[i] === "}" && --depth === 0) break;
      }
      return router.slice(m.index!, i + 1);
    });
    const usesProvider = handlers
      .filter((h) => /\bprovider\b/.test(h.replace(/\/\/.*$/gm, "")))
      .map((h) => h.match(/^if \(path === "([^"]+)"/)![1]);
    expect(usesProvider.length).toBeGreaterThan(10);
    const gated = new Set([...AUX_AI_ROUTES, "/api/chat", "/api/agent"]);
    expect(usesProvider.filter((p) => !gated.has(p))).toEqual([]);
    // /api/chat and /api/agent aren't in AUX_AI_ROUTES, so they must call the gate themselves.
    for (const p of ["/api/chat", "/api/agent"]) {
      const h = handlers.find((x) => x.startsWith(`if (path === "${p}"`))!;
      expect(h.indexOf("aiGate(")).toBeGreaterThan(-1);
      expect(h.indexOf("aiGate(")).toBeLessThan(h.search(/provider\.(stream|completeWithTools|complete)\(/));
    }
  });
});
