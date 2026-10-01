/**
 * src/rateLimiter.ts — checkChatRateLimit (Worker parity with the Express
 * server's per-tier daily chat limit).
 *
 * CHAT.1  Free is capped at CHAT_LIMITS.Free per UTC day, then blocked
 * CHAT.2  unlimited tiers (-1) are always allowed and never touch KV
 * CHAT.3  counters are per principal
 * CHAT.4  unknown tiers get Free's limit
 */

import { describe, it, expect } from "@jest/globals";
import { checkChatRateLimit } from "../src/rateLimiter";
import { CHAT_LIMITS } from "../agentLimiter";

function fakeKV() {
  const store = new Map<string, string>();
  let writes = 0;
  const kv = {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); writes++; },
  };
  return { env: { RATE_LIMIT: kv as unknown as KVNamespace }, writes: () => writes };
}

describe("checkChatRateLimit", () => {
  it("CHAT.1 caps Free at its daily limit", async () => {
    const { env } = fakeKV();
    for (let i = 1; i <= CHAT_LIMITS.Free; i++) {
      const r = await checkChatRateLimit("p1", "Free", env);
      expect(r).toMatchObject({ allowed: true, count: i, limit: CHAT_LIMITS.Free });
    }
    const blocked = await checkChatRateLimit("p1", "Free", env);
    expect(blocked.allowed).toBe(false);
    expect(new Date(blocked.resetsAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("CHAT.2 unlimited tiers are always allowed without KV writes", async () => {
    const { env, writes } = fakeKV();
    expect(CHAT_LIMITS.Pro).toBe(-1);
    for (let i = 0; i < 20; i++) expect((await checkChatRateLimit("p1", "Pro", env)).allowed).toBe(true);
    expect(writes()).toBe(0);
  });

  it("CHAT.3 counts each principal separately", async () => {
    const { env } = fakeKV();
    for (let i = 0; i < CHAT_LIMITS.Free; i++) await checkChatRateLimit("p1", "Free", env);
    expect((await checkChatRateLimit("p1", "Free", env)).allowed).toBe(false);
    expect((await checkChatRateLimit("p2", "Free", env)).allowed).toBe(true);
  });

  it("CHAT.4 unknown tiers get Free's limit", async () => {
    const { env } = fakeKV();
    expect((await checkChatRateLimit("p1", "RealtorPro", env)).limit).toBe(CHAT_LIMITS.Free);
  });
});
