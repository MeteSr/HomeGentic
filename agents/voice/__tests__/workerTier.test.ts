/**
 * src/tier.ts — the Worker resolves a caller's tier from the payment canister
 *
 * TIER.1  anonymous callers are Free without a lookup
 * TIER.2  the looked-up tier is used, and cached in KV for TIER_CACHE_TTL_SECONDS
 * TIER.3  a cached tier is served without a canister lookup
 * TIER.4  a lookup failure falls back to Free and is NOT cached
 * TIER.5  tiers the agent limiter doesn't know (e.g. legacy Realtor*) map to Free
 */

import { describe, it, expect, jest } from "@jest/globals";
import { resolveTier, TIER_CACHE_TTL_SECONDS } from "../src/tier";

function fakeKV(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const puts: Array<{ key: string; value: string; ttl?: number }> = [];
  const kv = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, opts?: { expirationTtl?: number }) => {
      store.set(key, value);
      puts.push({ key, value, ttl: opts?.expirationTtl });
    },
  };
  return { env: { RATE_LIMIT: kv as unknown as KVNamespace }, puts, store };
}

const P = "2vxsx-fae";

describe("resolveTier (Worker)", () => {
  it("TIER.1 anonymous callers are Free without a lookup", async () => {
    const lookup = jest.fn(async () => "Pro");
    const { env } = fakeKV();
    expect(await resolveTier("anon", env, lookup)).toBe("Free");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("TIER.2 uses the canister's tier and caches it", async () => {
    const lookup = jest.fn(async () => "Pro");
    const { env, puts } = fakeKV();
    expect(await resolveTier(P, env, lookup)).toBe("Pro");
    expect(lookup).toHaveBeenCalledWith(P);
    expect(puts).toEqual([{ key: `tier:${P}`, value: "Pro", ttl: TIER_CACHE_TTL_SECONDS }]);
  });

  it("TIER.3 serves a cached tier without a lookup", async () => {
    const lookup = jest.fn(async () => "Free");
    const { env } = fakeKV({ [`tier:${P}`]: "ContractorPro" });
    expect(await resolveTier(P, env, lookup)).toBe("ContractorPro");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("TIER.4 falls back to Free on lookup failure and does not cache it", async () => {
    const lookup = jest.fn(async () => { throw new Error("canister unreachable"); });
    const { env, puts } = fakeKV();
    expect(await resolveTier(P, env, lookup)).toBe("Free");
    expect(puts).toEqual([]);
  });

  it("TIER.5 maps tiers the limiter doesn't know to Free", async () => {
    const { env } = fakeKV();
    expect(await resolveTier(P, env, async () => "RealtorPro")).toBe("Free");
  });
});
