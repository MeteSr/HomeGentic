/**
 * RateLimiterDO + rateLimiter.ts on the Durable Object path (F-10).
 *
 * RLDO.1 parallel bursts never exceed the limit (atomic check-and-increment)
 * RLDO.2 fixed-window expiry is timestamp based; alarm cleans up, never a fresh window
 * RLDO.3 peek / release / fetch protocol
 * RLDO.4 rateLimiter.ts limiters use the DO when RATE_LIMITER is bound
 * RLDO.5 KV fallback only without the binding
 */

import { describe, it, expect } from "@jest/globals";
import { RateLimiterDO, type CounterNamespace, type CounterStorage } from "../src/rateLimiterDO";
import {
  checkGlobalRateLimit, checkChatRateLimit, checkAgentRateLimit, checkAuxAiRateLimit,
  getAgentUsage, claimOnce, releaseClaim,
} from "../src/rateLimiter";

/** Fake DO storage whose ops yield to the event loop, so a non-atomic
 *  read-then-write would interleave and overshoot. */
function fakeStorage() {
  const data = new Map<string, unknown>();
  let alarm: number | null = null;
  const tick = () => new Promise((r) => setImmediate(r));
  const storage: CounterStorage = {
    async get<T>(k: string) { await tick(); return data.get(k) as T | undefined; },
    async put<T>(k: string, v: T) { await tick(); data.set(k, v); },
    async deleteAll() { await tick(); data.clear(); alarm = null; },
    async setAlarm(t: number | Date) { alarm = Number(t); },
  };
  return { storage, data, alarm: () => alarm };
}

/** Namespace that routes each name to its own in-memory RateLimiterDO. */
function fakeNamespace() {
  const objects = new Map<string, RateLimiterDO>();
  const ns: CounterNamespace = {
    idFromName: (name: string) => name,
    get: (id: string) => {
      if (!objects.has(id)) objects.set(id, new RateLimiterDO({ storage: fakeStorage().storage }));
      const obj = objects.get(id)!;
      return { fetch: (_url: string, init?: RequestInit) => obj.fetch(new Request("https://do/", init)) };
    },
  };
  return { ns, objects };
}

function fakeKV() {
  const store = new Map<string, string>();
  let gets = 0;
  const kv = {
    get: async (k: string) => { gets++; return store.get(k) ?? null; },
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
  } as unknown as KVNamespace;
  return { kv, gets: () => gets };
}

describe("RLDO.1 — atomic under parallel bursts", () => {
  it("allows exactly `limit` of 100 concurrent hits", async () => {
    const obj = new RateLimiterDO({ storage: fakeStorage().storage });
    const results = await Promise.all(Array.from({ length: 100 }, () => obj.hit(30, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(30);
    expect(Math.max(...results.map((r) => r.count))).toBe(30);
  });

  it("limit 1 acts as a once-only claim under a burst", async () => {
    const obj = new RateLimiterDO({ storage: fakeStorage().storage });
    const results = await Promise.all(Array.from({ length: 20 }, () => obj.hit(1, 60_000)));
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
  });

  it("limit 0 never allows", async () => {
    const obj = new RateLimiterDO({ storage: fakeStorage().storage });
    expect((await obj.hit(0, 60_000)).allowed).toBe(false);
  });
});

describe("RLDO.2 — window expiry", () => {
  it("resets after expiresAt and sets an alarm for the window end", async () => {
    const s = fakeStorage();
    const obj = new RateLimiterDO({ storage: s.storage });
    const t0 = 1_000_000;
    expect((await obj.hit(2, 60_000, t0)).allowed).toBe(true);
    expect(s.alarm()).toBe(t0 + 60_000);
    expect((await obj.hit(2, 60_000, t0 + 1)).allowed).toBe(true);
    expect((await obj.hit(2, 60_000, t0 + 2)).allowed).toBe(false);
    // The window does not slide on later hits.
    expect((await obj.hit(2, 60_000, t0 + 60_000)).count).toBe(1);
  });

  it("alarm deletes an expired window but keeps a live one", async () => {
    const s = fakeStorage();
    const obj = new RateLimiterDO({ storage: s.storage });
    await obj.hit(5, 3_600_000);
    await obj.alarm();
    expect((await obj.peek()).count).toBe(1);

    s.data.set("c", { count: 3, expiresAt: Date.now() - 1 });
    await obj.alarm();
    expect(s.data.size).toBe(0);
  });
});

describe("RLDO.3 — peek / release / fetch protocol", () => {
  it("peek does not increment; release clears", async () => {
    const obj = new RateLimiterDO({ storage: fakeStorage().storage });
    await obj.hit(5, 60_000);
    expect((await obj.peek()).count).toBe(1);
    expect((await obj.peek()).count).toBe(1);
    await obj.release();
    expect((await obj.peek()).count).toBe(0);
  });

  it("fetch speaks JSON and rejects unknown ops", async () => {
    const obj = new RateLimiterDO({ storage: fakeStorage().storage });
    const ok = await obj.fetch(new Request("https://do/", { method: "POST", body: JSON.stringify({ op: "hit", limit: 2, ttlMs: 1000 }) }));
    expect(await ok.json()).toEqual({ allowed: true, count: 1 });
    const bad = await obj.fetch(new Request("https://do/", { method: "POST", body: JSON.stringify({ op: "nope" }) }));
    expect(bad.status).toBe(400);
  });
});

describe("RLDO.4 — limiters on the DO path", () => {
  it("global limit: a 60-request burst from one IP lets exactly 30 through", async () => {
    const { ns } = fakeNamespace();
    const { kv, gets } = fakeKV();
    const env = { RATE_LIMIT: kv, RATE_LIMITER: ns };
    const results = await Promise.all(Array.from({ length: 60 }, () => checkGlobalRateLimit("1.2.3.4", env)));
    expect(results.filter(Boolean)).toHaveLength(30);
    expect(gets()).toBe(0);   // KV untouched when the DO is bound
  });

  it("chat limit (Free = 3/day) holds under a burst", async () => {
    const { ns } = fakeNamespace();
    const env = { RATE_LIMIT: fakeKV().kv, RATE_LIMITER: ns };
    const results = await Promise.all(Array.from({ length: 10 }, () => checkChatRateLimit("p1", "Free", env)));
    expect(results.filter((r) => r.allowed)).toHaveLength(3);
    expect(results.find((r) => !r.allowed)).toMatchObject({ count: 3, limit: 3 });
    expect((await checkChatRateLimit("p1", "Pro", env)).allowed).toBe(true);   // own 200/day count
  });

  it("agent limit counts and getAgentUsage reads the same counter", async () => {
    const { ns } = fakeNamespace();
    const env = { RATE_LIMIT: fakeKV().kv, RATE_LIMITER: ns };
    const results = await Promise.all(Array.from({ length: 15 }, () => checkAgentRateLimit("p2", "Pro", env)));
    expect(results.filter((r) => r.allowed)).toHaveLength(10);
    expect((await getAgentUsage("p2", "Pro", env)).used).toBe(10);
    expect((await checkAgentRateLimit("p3", "ContractorFree", env)).allowed).toBe(false);
  });

  it("aux AI daily cap (Free = 25) holds under a burst", async () => {
    const { ns } = fakeNamespace();
    const env = { RATE_LIMIT: fakeKV().kv, RATE_LIMITER: ns };
    const results = await Promise.all(Array.from({ length: 40 }, () => checkAuxAiRateLimit("p4", "Free", env)));
    expect(results.filter((r) => r.allowed)).toHaveLength(25);
  });

  it("claimOnce is true once; releaseClaim re-arms it", async () => {
    const { ns } = fakeNamespace();
    const env = { RATE_LIMITER: ns };
    const claims = await Promise.all(Array.from({ length: 5 }, () => claimOnce(env, "k", 60)));
    expect(claims.filter(Boolean)).toHaveLength(1);
    await releaseClaim(env, "k");
    expect(await claimOnce(env, "k", 60)).toBe(true);
  });
});

describe("RLDO.5 — KV fallback without the binding", () => {
  it("uses KV when RATE_LIMITER is absent", async () => {
    const { kv, gets } = fakeKV();
    const env = { RATE_LIMIT: kv };
    for (let i = 0; i < 3; i++) expect((await checkChatRateLimit("p5", "Free", env)).allowed).toBe(true);
    expect((await checkChatRateLimit("p5", "Free", env)).allowed).toBe(false);
    expect(gets()).toBeGreaterThan(0);
  });
});
