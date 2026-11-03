/**
 * packages/shared agentSession: the token cache clients use and the resolver
 * the Node relays use (test-gap audit 2026-11-03, L4).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SESSION_HEADER,
  isSessionToken,
  createSessionTokenCache,
  createRequestPrincipalResolver,
} from "@homegentic/shared/agentSession";

const TOKEN = `hgs_${"a".repeat(64)}`;
const OTHER = `hgs_${"b".repeat(64)}`;
const MIN = 60_000;

afterEach(() => vi.useRealTimers());

describe("isSessionToken", () => {
  it("accepts only hgs_ plus 64 lowercase hex characters", () => {
    expect(isSessionToken(TOKEN)).toBe(true);
    expect(isSessionToken(`hgs_${"A".repeat(64)}`)).toBe(false);
    expect(isSessionToken(`hgs_${"a".repeat(63)}`)).toBe(false);
    expect(isSessionToken(`xx_${"a".repeat(64)}`)).toBe(false);
    expect(isSessionToken(undefined)).toBe(false);
    expect(isSessionToken(42)).toBe(false);
  });
});

describe("createSessionTokenCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000_000);
  });

  it("issues once and reuses the token until the refresh margin", async () => {
    const issue = vi.fn().mockResolvedValue({ token: TOKEN, expiresAtMs: Date.now() + 60 * MIN });
    const cache = createSessionTokenCache({ issue, refreshMarginMs: 5 * MIN });
    expect(await cache.get()).toBe(TOKEN);
    vi.advanceTimersByTime(54 * MIN);
    expect(await cache.get()).toBe(TOKEN);
    expect(issue).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * MIN); // inside the 5-minute margin
    await cache.get();
    expect(issue).toHaveBeenCalledTimes(2);
  });

  it("re-issues when the owner changes", async () => {
    let owner = "alice";
    const issue = vi.fn().mockImplementation(async () => ({
      token: owner === "alice" ? TOKEN : OTHER,
      expiresAtMs: Date.now() + 60 * MIN,
    }));
    const cache = createSessionTokenCache({ issue, owner: () => owner });
    expect(await cache.get()).toBe(TOKEN);
    owner = "bob";
    expect(await cache.get()).toBe(OTHER);
    expect(issue).toHaveBeenCalledTimes(2);
  });

  it("shares one issue between concurrent callers", async () => {
    let release!: (v: unknown) => void;
    const issue = vi.fn().mockReturnValue(new Promise((r) => (release = r)));
    const cache = createSessionTokenCache({ issue });
    const both = Promise.all([cache.get(), cache.get()]);
    release({ token: TOKEN, expiresAtMs: Date.now() + 60 * MIN });
    expect(await both).toEqual([TOKEN, TOKEN]);
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("returns null and reports when issuing throws, sync or async", async () => {
    const onError = vi.fn();
    const sync = createSessionTokenCache({
      issue: () => {
        throw new Error("boom");
      },
      onError,
    });
    expect(await sync.get()).toBeNull();
    const async_ = createSessionTokenCache({ issue: () => Promise.reject(new Error("later")), onError });
    expect(await async_.get()).toBeNull();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("caches nothing when the issuer returns null, and clear() forces a new issue", async () => {
    const issue = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ token: TOKEN, expiresAtMs: Date.now() + 60 * MIN });
    const cache = createSessionTokenCache({ issue });
    expect(await cache.get()).toBeNull();
    expect(await cache.get()).toBe(TOKEN);
    cache.clear();
    await cache.get();
    expect(issue).toHaveBeenCalledTimes(3);
  });
});

describe("createRequestPrincipalResolver", () => {
  const req = (token?: string, body?: unknown) => ({
    header: (name: string) => (name === SESSION_HEADER ? token : undefined),
    body,
  });
  const make = (over: Partial<Parameters<typeof createRequestPrincipalResolver>[0]> = {}) =>
    createRequestPrincipalResolver({
      resolve: vi.fn().mockResolvedValue("principal-a"),
      hash: (t) => `h:${t.slice(-4)}`,
      trustBodyPrincipal: () => false,
      ...over,
    });

  it("fails closed on a missing or malformed token without calling the canister", async () => {
    const resolve = vi.fn();
    const r = make({ resolve });
    expect(await r.requestPrincipal(req())).toBeNull();
    expect(await r.requestPrincipal(req("hgs_short"))).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("ignores a principal in the body unless trustBodyPrincipal() says so", async () => {
    expect(await make().requestPrincipal(req(undefined, { principal: "mallory" }))).toBeNull();
    const local = make({ trustBodyPrincipal: () => true });
    expect(await local.requestPrincipal(req(undefined, { principal: "dev-user" }))).toBe("dev-user");
    expect(await local.requestPrincipal(req(undefined, { principal: "" }))).toBeNull();
    expect(await local.requestPrincipal(req(undefined, {}))).toBeNull();
  });

  it("caches a positive lookup under the token's hash until the TTL", async () => {
    vi.useFakeTimers();
    const resolve = vi.fn().mockResolvedValue("principal-a");
    const hash = vi.fn((t: string) => `h:${t.slice(-4)}`);
    const r = make({ resolve, hash, ttlMs: MIN });
    expect(await r.requestPrincipal(req(TOKEN))).toBe("principal-a");
    expect(await r.requestPrincipal(req(TOKEN))).toBe("principal-a");
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(hash).toHaveBeenCalledWith(TOKEN);
    vi.advanceTimersByTime(MIN + 1);
    await r.requestPrincipal(req(TOKEN));
    expect(resolve).toHaveBeenCalledTimes(2);
    r.clearCache();
    await r.requestPrincipal(req(TOKEN));
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it("doesn't cache misses or errors, and reports errors", async () => {
    const onError = vi.fn();
    const resolve = vi.fn().mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("down")).mockResolvedValue("p");
    const r = make({ resolve, onError });
    expect(await r.requestPrincipal(req(TOKEN))).toBeNull();
    expect(await r.requestPrincipal(req(TOKEN))).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(await r.requestPrincipal(req(TOKEN))).toBe("p");
  });

  it("empties the cache rather than growing past maxEntries", async () => {
    const resolve = vi.fn().mockResolvedValue("p");
    const r = make({ resolve, maxEntries: 1 });
    await r.requestPrincipal(req(TOKEN));
    await r.requestPrincipal(req(OTHER)); // clears, then caches OTHER
    await r.requestPrincipal(req(TOKEN));
    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it("uses a per-call resolver when one is passed", async () => {
    const own = vi.fn().mockResolvedValue("from-call");
    expect(await make().requestPrincipal(req(TOKEN), own)).toBe("from-call");
  });
});
