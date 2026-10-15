/**
 * src/rateLimiter.ts — getAgentUsage (the mobile app's AI-call meter).
 *
 * USAGE.1  reports the count checkAgentRateLimit recorded, with the tier's limit and period
 * USAGE.2  reading usage never increments the counter
 * USAGE.3  tiers with no agent access report 0 of 0 without reading KV
 */

import { describe, it, expect } from "@jest/globals";
import { checkAgentRateLimit, getAgentUsage } from "../src/rateLimiter";
import { TIER_LIMITS, TIER_PERIOD } from "../agentLimiter";

function fakeKV() {
  const store = new Map<string, string>();
  let reads = 0;
  const kv = {
    get: async (k: string) => { reads++; return store.get(k) ?? null; },
    put: async (k: string, v: string) => { store.set(k, v); },
  };
  return { env: { RATE_LIMIT: kv as unknown as KVNamespace }, reads: () => reads };
}

describe("getAgentUsage", () => {
  it("USAGE.1 reports recorded calls with the tier's limit and period", async () => {
    const { env } = fakeKV();
    await checkAgentRateLimit("p1", "Free", env);
    await checkAgentRateLimit("p1", "Free", env);
    const u = await getAgentUsage("p1", "Free", env);
    expect(u).toMatchObject({ used: 2, limit: TIER_LIMITS.Free, period: TIER_PERIOD.Free });
    expect(new Date(u.resetsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("USAGE.2 reading usage does not consume a call", async () => {
    const { env } = fakeKV();
    await checkAgentRateLimit("p1", "Pro", env);
    for (let i = 0; i < 3; i++) await getAgentUsage("p1", "Pro", env);
    expect((await getAgentUsage("p1", "Pro", env)).used).toBe(1);
  });

  it("USAGE.3 tiers without agent access report 0 of 0", async () => {
    const { env, reads } = fakeKV();
    expect(TIER_LIMITS.ContractorFree).toBe(0);
    expect(await getAgentUsage("p1", "ContractorFree", env)).toMatchObject({ used: 0, limit: 0 });
    expect(reads()).toBe(0);
  });
});
