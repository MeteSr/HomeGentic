/**
 * AI abuse protection (src/aiGuard.ts) — cycle-drain audit CD-1, 2026-10-31.
 *
 * AIG.1 RateLimiterDO add / extend / peek-with-expiry
 * AIG.2 exponential backoff: free strikes, doubling blocks, 1 h cap
 * AIG.3 the gate: paid skips, free needs the human check, free budget, new accounts
 * AIG.4 verifyHuman talks to Turnstile and marks the principal
 * AIG.5 token weighting and the free budget
 * AIG.6 input caps: PDF size, agent text total and image count
 * AIG.7 the mobile human-check page only redirects into the app
 * AIG.8 Worker: unverified free caller gets 403, verify flow, repeated 429s back off
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
  recordServiceError:     jest.fn().mockResolvedValue(undefined),
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels: jest.fn().mockResolvedValue([]),
  recordFrontendError: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
const mockComplete = jest.fn();
jest.mock("../anthropicProvider", () => ({
  AnthropicProvider: jest.fn().mockImplementation(function (this: any) {
    this.onUsage = null;
    this.complete = (p: unknown) => mockComplete(p, this);
    this.stream = jest.fn();
    this.completeWithTools = jest.fn();
  }),
}));
jest.mock("../src/session", () => ({
  SESSION_HEADER: "x-agent-session",
  resolveSessionPrincipal: jest.fn(async (token: string | null) =>
    token === "hgs_free" ? "user-free" : token === "hgs_pro" ? "user-pro" : null,
  ),
}));
jest.mock("../src/tier", () => ({
  resolveTier: jest.fn(async (p: string) => (p === "user-pro" ? "Pro" : "Free")),
}));

import { describe, it, expect, beforeEach } from "@jest/globals";
import { RateLimiterDO, type CounterNamespace, type CounterStorage } from "../src/rateLimiterDO";
import {
  blockSecondsFor,
  strike,
  blockedSeconds,
  gateAiCall,
  verifyHuman,
  recordFreeUsage,
  freeBudgetSpent,
  weightedTokens,
  allowedHumanCheckRedirect,
  humanCheckPage,
  FREE_STRIKES,
  MAX_BLOCK_S,
  DEFAULT_NEW_ACCOUNT_AUX_LIMIT,
} from "../src/aiGuard";
import { hitCounter } from "../src/rateLimiter";
import { pdfTooLarge, sanitiseAgentMessages, MAX_AI_PDF_BYTES } from "../src/security";
import worker from "../src/index";

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

const guardEnv = (over: Record<string, unknown> = {}): any => ({
  RATE_LIMIT: fakeKV(),
  RATE_LIMITER: fakeNamespace(),
  NODE_ENV: "production",
  TURNSTILE_SECRET_KEY: "ts-secret",
  TURNSTILE_SITE_KEY: "ts-site",
  ...over,
});

const okFetch = (success: boolean) =>
  jest.fn(async () => new Response(JSON.stringify({ success }), { status: 200 })) as unknown as typeof fetch;

describe("AIG.1 — RateLimiterDO add / extend", () => {
  it("add sums amounts without a limit; peek reports the window end", async () => {
    const obj = new RateLimiterDO({ storage: fakeStorage() });
    await obj.add(1_000, 60_000, 0);
    expect((await obj.add(2_500, 60_000, 10)).count).toBe(3_500);
    expect(await obj.peek(20)).toEqual({ count: 3_500, expiresAt: 60_000 });
  });

  it("extend never shortens a block", async () => {
    const obj = new RateLimiterDO({ storage: fakeStorage() });
    expect((await obj.extend(120_000, 0)).expiresAt).toBe(120_000);
    expect((await obj.extend(30_000, 1_000)).expiresAt).toBe(120_000);
    expect((await obj.extend(300_000, 1_000)).expiresAt).toBe(301_000);
  });
});

describe("AIG.2 — exponential backoff", () => {
  it("doubles after the free strikes and caps at an hour", () => {
    const seq = Array.from({ length: FREE_STRIKES + 10 }, (_, i) => blockSecondsFor(i + 1));
    expect(seq.slice(0, FREE_STRIKES)).toEqual([0, 0, 0]);
    expect(seq.slice(FREE_STRIKES, FREE_STRIKES + 4)).toEqual([30, 60, 120, 240]);
    expect(blockSecondsFor(100)).toBe(MAX_BLOCK_S);
  });

  it("blocks a key once it has more strikes than the free allowance", async () => {
    const env = guardEnv();
    for (let i = 0; i < FREE_STRIKES; i++) await strike(env, ["ip:1.2.3.4"]);
    expect(await blockedSeconds(env, ["ip:1.2.3.4"])).toBe(0);
    await strike(env, ["ip:1.2.3.4"]);
    const wait = await blockedSeconds(env, ["ip:1.2.3.4"]);
    expect(wait).toBeGreaterThan(25);
    expect(wait).toBeLessThanOrEqual(30);
    expect(await blockedSeconds(env, ["ip:5.6.7.8"])).toBe(0);
  });
});

describe("AIG.3 — the gate", () => {
  it("paid tiers skip the human check and the free budget", async () => {
    const env = guardEnv({ FREE_AI_DAILY_TOKEN_BUDGET: "1" });
    await recordFreeUsage(env, { inputTokens: 10, outputTokens: 0 });
    expect(await gateAiCall(env, "p-pro", "Pro")).toEqual({ ok: true, newAccount: false });
  });

  it("free callers need the human check, and get the site key to show it", async () => {
    const r = await gateAiCall(guardEnv(), "p-free", "Free");
    expect(r).toMatchObject({
      ok: false,
      status: 403,
      body: { error: "human_verification_required", siteKey: "ts-site" },
    });
  });

  it("production without a Turnstile secret fails closed", async () => {
    const r = await gateAiCall(guardEnv({ TURNSTILE_SECRET_KEY: undefined }), "p-free", "Free");
    expect(r).toMatchObject({ ok: false, status: 403 });
  });

  it("local dev without a secret skips the check", async () => {
    const r = await gateAiCall(guardEnv({ TURNSTILE_SECRET_KEY: undefined, NODE_ENV: "development" }), "p", "Free");
    expect(r).toEqual({ ok: true, newAccount: false });
  });

  it("a verified free caller passes and is flagged as new for a week", async () => {
    const env = guardEnv();
    await verifyHuman(env, "p-free", "tok", "1.1.1.1", okFetch(true));
    expect(await gateAiCall(env, "p-free", "Free")).toEqual({ ok: true, newAccount: true });
  });

  it("free callers stop once the shared daily budget is spent", async () => {
    const env = guardEnv({ FREE_AI_DAILY_TOKEN_BUDGET: "1000" });
    await verifyHuman(env, "p-free", "tok", "1.1.1.1", okFetch(true));
    await recordFreeUsage(env, { inputTokens: 500, outputTokens: 100 });
    expect(await freeBudgetSpent(env)).toBe(true);
    expect(await gateAiCall(env, "p-free", "Free")).toMatchObject({
      ok: false,
      status: 429,
      body: { error: "free_ai_budget_reached" },
    });
  });

  it("a blocked principal gets slow_down with a retry time, whatever its tier", async () => {
    const env = guardEnv();
    for (let i = 0; i <= FREE_STRIKES; i++) await strike(env, ["p:p-pro"]);
    const r = await gateAiCall(env, "p-pro", "Pro");
    expect(r).toMatchObject({ ok: false, status: 429, body: { error: "slow_down" } });
    expect((r as any).retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("AIG.4 — verifyHuman", () => {
  it("rejects a failed or missing token", async () => {
    const env = guardEnv();
    expect((await verifyHuman(env, "p", "tok", "ip", okFetch(false))).status).toBe(400);
    expect((await verifyHuman(env, "p", "", "ip", okFetch(true))).status).toBe(400);
    expect((await gateAiCall(env, "p", "Free")).ok).toBe(false);
  });

  it("sends the secret, token and IP to Turnstile", async () => {
    const f = okFetch(true);
    await verifyHuman(guardEnv(), "p", "tok-1", "9.9.9.9", f);
    const [url, init] = (f as any).mock.calls[0];
    expect(url).toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = new URLSearchParams(init.body);
    expect(form.get("secret")).toBe("ts-secret");
    expect(form.get("response")).toBe("tok-1");
    expect(form.get("remoteip")).toBe("9.9.9.9");
  });

  it("503 without a secret; a repeat pass doesn't restart the new-account week", async () => {
    expect((await verifyHuman(guardEnv({ TURNSTILE_SECRET_KEY: "" }), "p", "t", "ip", okFetch(true))).status).toBe(503);
    const env = guardEnv();
    await hitCounter(env, "human:p", 1, 3600); // verified earlier, week already over
    await verifyHuman(env, "p", "t", "ip", okFetch(true));
    expect(await gateAiCall(env, "p", "Free")).toEqual({ ok: true, newAccount: false });
  });
});

describe("AIG.5 — token weighting", () => {
  it("weights output tokens 5×", () => {
    expect(weightedTokens({ inputTokens: 1_000, outputTokens: 200 })).toBe(2_000);
  });
});

describe("AIG.6 — input caps", () => {
  it("refuses PDFs over the cap but not images", () => {
    const big = "A".repeat(Math.ceil((MAX_AI_PDF_BYTES * 4) / 3) + 8);
    expect(pdfTooLarge("application/pdf", big)).toBe(true);
    expect(pdfTooLarge("image/jpeg", big)).toBe(false);
    expect(pdfTooLarge("application/pdf", "AAAA")).toBe(false);
  });

  it("caps an agent request's total text and image count", () => {
    const text = "x".repeat(8_000);
    expect(sanitiseAgentMessages(Array.from({ length: 8 }, () => ({ role: "user", content: text })))).not.toBeNull();
    expect(sanitiseAgentMessages(Array.from({ length: 9 }, () => ({ role: "user", content: text })))).toBeNull();
    const img = { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } };
    expect(sanitiseAgentMessages([{ role: "user", content: [img, img, img, img] }])).not.toBeNull();
    expect(sanitiseAgentMessages([{ role: "user", content: [img, img, img, img, img] }])).toBeNull();
  });
});

describe("AIG.7 — mobile human-check page", () => {
  it("only redirects to the app's own scheme", () => {
    expect(allowedHumanCheckRedirect("homegentic://human-check")).toBe("homegentic://human-check");
    expect(allowedHumanCheckRedirect("https://evil.test/")).toBeNull();
    expect(allowedHumanCheckRedirect('homegentic://x"><script>')).toBeNull();
    expect(allowedHumanCheckRedirect(null)).toBeNull();
  });

  it("escapes the site key and tags scripts with the nonce", () => {
    const html = humanCheckPage('k"<x>', "homegentic://human-check", "abc123");
    expect(html).toContain("&#34;&#60;x&#62;");
    expect(html.match(/<script nonce="abc123"/g)?.length).toBe(2);
  });
});

// ── Worker integration ─────────────────────────────────────────────────────────

describe("AIG.8 — Worker", () => {
  let waits: Promise<unknown>[];
  const ctx: any = {
    waitUntil: (p: Promise<unknown>) => {
      waits.push(p);
    },
  };
  const flush = async () => {
    while (waits.length) await Promise.all(waits.splice(0));
  };

  const env = (over: Record<string, unknown> = {}): any => ({
    ANTHROPIC_API_KEY: "sk-ant",
    VOICE_AGENT_API_KEY: "pubkey",
    FRONTEND_ORIGIN: "https://app.test",
    NODE_ENV: "production",
    CANISTER_ID_AUTH: "auth-id",
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    RATE_LIMIT: fakeKV(),
    RATE_LIMITER: fakeNamespace(),
    TURNSTILE_SECRET_KEY: "ts-secret",
    TURNSTILE_SITE_KEY: "ts-site",
    ...over,
  });

  let ipSeq = 0;
  const post = (path: string, body: unknown, session: string, ip: string) =>
    new Request(`https://worker.test${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "pubkey",
        "x-agent-session": session,
        "CF-Connecting-IP": ip,
      },
      body: JSON.stringify(body),
    });
  const rebate = { state: "FL", zipCode: "32801", utilityProvider: "FPL", billType: "Electric" };

  beforeEach(() => {
    waits = [];
    mockComplete.mockReset();
    mockComplete.mockImplementation(async (_p: unknown, provider: any) => {
      provider.onUsage?.({ inputTokens: 400, outputTokens: 100 });
      return '{"ok":true}';
    });
  });

  it("an unverified free caller gets 403 with the site key; Claude isn't called", async () => {
    const res = await worker.fetch(post("/api/rebate-finder", rebate, "hgs_free", `10.0.0.${++ipSeq}`), env(), ctx);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "human_verification_required", siteKey: "ts-site" });
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("the paid-API routes (ATTOM, permits, invite emails) need the human check too (CD-9, CD-11)", async () => {
    for (const path of ["/api/property/details", "/api/permits/import", "/api/email/contractor-invite"]) {
      const res = await worker.fetch(post(path, {}, "hgs_free", `10.0.1.${++ipSeq}`), env(), ctx);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "human_verification_required", siteKey: "ts-site" });
    }
  });

  it("Pro callers skip the human check", async () => {
    const res = await worker.fetch(post("/api/rebate-finder", rebate, "hgs_pro", `10.0.0.${++ipSeq}`), env(), ctx);
    expect(res.status).toBe(200);
  });

  it("after /api/human/verify the free caller gets through and usage is counted", async () => {
    const e = env();
    const realFetch = global.fetch;
    global.fetch = okFetch(true);
    try {
      const v = await worker.fetch(
        post("/api/human/verify", { token: "tok" }, "hgs_free", `10.0.0.${++ipSeq}`),
        e,
        ctx,
      );
      expect(v.status).toBe(200);
    } finally {
      global.fetch = realFetch;
    }
    const res = await worker.fetch(post("/api/rebate-finder", rebate, "hgs_free", `10.0.0.${++ipSeq}`), e, ctx);
    expect(res.status).toBe(200);
    await flush();
    const day = new Date().toISOString().slice(0, 10);
    expect(
      await e.RATE_LIMITER.get(`ai-free-tokens:${day}`)
        .fetch("x", { method: "POST", body: JSON.stringify({ op: "peek" }) })
        .then((r: Response) => r.json()),
    ).toMatchObject({ count: 900 });
  });

  it("verify needs a session", async () => {
    const res = await worker.fetch(
      post("/api/human/verify", { token: "tok" }, "hgs_bad", `10.0.0.${++ipSeq}`),
      env(),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it("a new account gets the smaller document allowance, then repeated 429s back off", async () => {
    const e = env();
    const ip = `10.0.1.${++ipSeq}`;
    await hitCounter(e, "human:user-free", 1, 3600);
    await hitCounter(e, "human-new:user-free", 1, 3600);
    const statuses: number[] = [];
    for (let i = 0; i < DEFAULT_NEW_ACCOUNT_AUX_LIMIT + FREE_STRIKES + 2; i++) {
      const r = await worker.fetch(post("/api/rebate-finder", rebate, "hgs_free", ip), e, ctx);
      statuses.push(r.status);
      await flush();
    }
    expect(statuses.slice(0, DEFAULT_NEW_ACCOUNT_AUX_LIMIT)).toEqual([200, 200, 200]);
    expect(statuses.slice(DEFAULT_NEW_ACCOUNT_AUX_LIMIT).every((s) => s === 429)).toBe(true);
    const last = await worker.fetch(post("/api/rebate-finder", rebate, "hgs_free", ip), e, ctx);
    expect(last.status).toBe(429);
    expect((await last.json()).error).toBe("slow_down");
    expect(Number(last.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
