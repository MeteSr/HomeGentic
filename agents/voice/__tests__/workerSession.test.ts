/**
 * src/session.ts — the Worker learns the caller's principal from a
 * canister-issued session token, never from a client-asserted header.
 *
 * SESS.1  missing or malformed tokens resolve to null without a lookup
 * SESS.2  a valid token resolves via the auth canister and is cached by hash
 * SESS.3  a cached token is served without a lookup
 * SESS.4  an unknown/expired token (lookup → null) is null and not cached
 * SESS.5  an unreachable canister fails closed (null) and is not cached
 */

import { describe, it, expect, jest } from "@jest/globals";
import { createHash } from "node:crypto";
import { resolveSessionPrincipal, SESSION_CACHE_TTL_SECONDS } from "../src/session";

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
  return { env: { RATE_LIMIT: kv as unknown as KVNamespace }, puts };
}

const TOKEN = "hgs_" + "ab".repeat(32);
const KEY   = "sess:" + createHash("sha256").update(TOKEN).digest("hex");
const P     = "2vxsx-fae";

describe("resolveSessionPrincipal", () => {
  it("SESS.1 rejects missing or malformed tokens without a lookup", async () => {
    const lookup = jest.fn(async () => P);
    const { env } = fakeKV();
    for (const t of [null, "", "hgs_short", "abc", TOKEN.toUpperCase(), TOKEN + "0"]) {
      expect(await resolveSessionPrincipal(t, env, lookup)).toBeNull();
    }
    expect(lookup).not.toHaveBeenCalled();
  });

  it("SESS.2 resolves a valid token and caches it under the token's hash", async () => {
    const lookup = jest.fn(async () => P);
    const { env, puts } = fakeKV();
    expect(await resolveSessionPrincipal(TOKEN, env, lookup)).toBe(P);
    expect(lookup).toHaveBeenCalledWith(TOKEN);
    expect(puts).toEqual([{ key: KEY, value: P, ttl: SESSION_CACHE_TTL_SECONDS }]);
    expect(puts[0].key).not.toContain(TOKEN);
  });

  it("SESS.3 serves a cached token without a lookup", async () => {
    const lookup = jest.fn(async () => "someone-else");
    const { env } = fakeKV({ [KEY]: P });
    expect(await resolveSessionPrincipal(TOKEN, env, lookup)).toBe(P);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("SESS.4 an unknown or expired token is null and not cached", async () => {
    const { env, puts } = fakeKV();
    expect(await resolveSessionPrincipal(TOKEN, env, async () => null)).toBeNull();
    expect(puts).toEqual([]);
  });

  it("SESS.5 fails closed when the auth canister can't be reached", async () => {
    const { env, puts } = fakeKV();
    const lookup = async () => { throw new Error("unreachable"); };
    expect(await resolveSessionPrincipal(TOKEN, env, lookup)).toBeNull();
    expect(puts).toEqual([]);
  });
});
