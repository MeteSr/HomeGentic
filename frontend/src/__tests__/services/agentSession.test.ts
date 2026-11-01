/**
 * agentSession.ts — the browser proves its identity to the voice Worker with
 * a canister-issued session token instead of an asserted principal.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const issue = vi.fn();
vi.mock("@/services/auth", () => ({ authService: { issueAgentSession: (...a: unknown[]) => issue(...a) } }));
const ensureHuman = vi.fn();
vi.mock("@/services/humanCheck", () => ({ ensureHuman: (...a: unknown[]) => ensureHuman(...a) }));

import { getAgentSessionToken, clearAgentSession, fetchWithAgentSession, aiRefusalMessage, AGENT_SESSION_HEADER } from "@/services/agentSession";
import { useAuthStore } from "@/store/authStore";

const HOUR = 3_600_000;
const setPrincipal = (p: string | null) => useAuthStore.setState({ principal: p } as any);

beforeEach(() => {
  (process.env as any).AUTH_CANISTER_ID = "aaaaa-aa";
  setPrincipal("user-a");
  clearAgentSession();
  issue.mockReset();
  ensureHuman.mockReset();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("getAgentSessionToken", () => {
  it("issues once and reuses the token while it's fresh", async () => {
    issue.mockResolvedValue({ token: "hgs_1", expiresAtMs: Date.now() + 24 * HOUR });
    expect(await getAgentSessionToken()).toBe("hgs_1");
    expect(await getAgentSessionToken()).toBe("hgs_1");
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight issue between concurrent callers", async () => {
    issue.mockResolvedValue({ token: "hgs_1", expiresAtMs: Date.now() + 24 * HOUR });
    const [a, b] = await Promise.all([getAgentSessionToken(), getAgentSessionToken()]);
    expect([a, b]).toEqual(["hgs_1", "hgs_1"]);
    expect(issue).toHaveBeenCalledTimes(1);
  });

  it("re-issues when the token is about to expire", async () => {
    issue.mockResolvedValueOnce({ token: "hgs_old", expiresAtMs: Date.now() + 60_000 })
         .mockResolvedValueOnce({ token: "hgs_new", expiresAtMs: Date.now() + 24 * HOUR });
    expect(await getAgentSessionToken()).toBe("hgs_old");
    expect(await getAgentSessionToken()).toBe("hgs_new");
  });

  it("re-issues when the signed-in principal changes", async () => {
    issue.mockResolvedValueOnce({ token: "hgs_a", expiresAtMs: Date.now() + 24 * HOUR })
         .mockResolvedValueOnce({ token: "hgs_b", expiresAtMs: Date.now() + 24 * HOUR });
    expect(await getAgentSessionToken()).toBe("hgs_a");
    setPrincipal("user-b");
    expect(await getAgentSessionToken()).toBe("hgs_b");
  });

  it("returns null when signed out, without an auth canister, or when issuing fails", async () => {
    setPrincipal(null);
    expect(await getAgentSessionToken()).toBeNull();
    setPrincipal("user-a");
    (process.env as any).AUTH_CANISTER_ID = "";
    expect(await getAgentSessionToken()).toBeNull();
    (process.env as any).AUTH_CANISTER_ID = "aaaaa-aa";
    issue.mockRejectedValue(new Error("NotFound"));
    expect(await getAgentSessionToken()).toBeNull();
  });
});

describe("fetchWithAgentSession", () => {
  it("sends the token header alongside the caller's headers", async () => {
    issue.mockResolvedValue({ token: "hgs_1", expiresAtMs: Date.now() + 24 * HOUR });
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchWithAgentSession("https://voice/api/agent", { method: "POST", headers: { "x-api-key": "k" } });
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers).toMatchObject({ "x-api-key": "k", [AGENT_SESSION_HEADER]: "hgs_1" });
  });

  it("on 401 drops the token, issues a new one and retries once", async () => {
    issue.mockResolvedValueOnce({ token: "hgs_stale", expiresAtMs: Date.now() + 24 * HOUR })
         .mockResolvedValueOnce({ token: "hgs_fresh", expiresAtMs: Date.now() + 24 * HOUR });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithAgentSession("https://voice/api/chat", { method: "POST", headers: {} });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokens = fetchMock.mock.calls.map((c) => ((c as [string, RequestInit])[1].headers as Record<string, string>)[AGENT_SESSION_HEADER]);
    expect(tokens).toEqual(["hgs_stale", "hgs_fresh"]);
  });

  const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

  it("on 403 human_verification_required runs the human check, verifies the token, and retries", async () => {
    issue.mockResolvedValue({ token: "hgs_1", expiresAtMs: Date.now() + 24 * HOUR });
    ensureHuman.mockImplementation(async (_siteKey: string, verify: (t: string) => Promise<boolean>) => verify("ts-token"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes(403, { error: "human_verification_required", siteKey: "site-1" }))
      .mockResolvedValueOnce(jsonRes(200, { verified: true }))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithAgentSession("https://voice.test/api/classify", { method: "POST", headers: { "x-api-key": "k" }, body: "{}" });
    expect(res.status).toBe(200);
    expect(ensureHuman.mock.calls[0][0]).toBe("site-1");
    const [verifyUrl, verifyInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(verifyUrl).toBe("https://voice.test/api/human/verify");
    expect(JSON.parse(verifyInit.body as string)).toEqual({ token: "ts-token" });
    expect((verifyInit.headers as Record<string, string>)[AGENT_SESSION_HEADER]).toBe("hgs_1");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns the 403 when the user closes the human check", async () => {
    issue.mockResolvedValue({ token: "hgs_1", expiresAtMs: Date.now() + 24 * HOUR });
    ensureHuman.mockResolvedValue(false);
    const fetchMock = vi.fn().mockResolvedValue(jsonRes(403, { error: "human_verification_required", siteKey: "s" }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await fetchWithAgentSession("https://voice.test/api/chat", { method: "POST" });
    expect(res.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits out a short slow_down with backoff and retries", async () => {
    vi.useFakeTimers();
    issue.mockResolvedValue({ token: "hgs_1", expiresAtMs: Date.now() + 24 * HOUR });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes(429, { error: "slow_down", retryAfterSeconds: 2 }, { "Retry-After": "2" }))
      .mockResolvedValueOnce(jsonRes(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const p = fetchWithAgentSession("https://voice.test/api/agent", { method: "POST" });
    await vi.advanceTimersByTimeAsync(1_900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(700);
    expect((await p).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();   // the shared afterEach waits on a real timer
  });

  it("doesn't retry long blocks or daily limits", async () => {
    issue.mockResolvedValue({ token: "hgs_1", expiresAtMs: Date.now() + 24 * HOUR });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonRes(429, { error: "slow_down" }, { "Retry-After": "600" }))
      .mockResolvedValueOnce(jsonRes(429, { error: "daily_ai_limit_reached" }, { "Retry-After": "1" }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchWithAgentSession("https://voice.test/api/agent", { method: "POST" })).status).toBe(429);
    expect((await fetchWithAgentSession("https://voice.test/api/agent", { method: "POST" })).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("aiRefusalMessage", () => {
  const res = (status: number, error: string, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify({ error }), { status, headers });

  it("explains each abuse-check refusal and ignores other errors", async () => {
    expect(await aiRefusalMessage(res(403, "human_verification_required"))).toMatch(/human check/);
    expect(await aiRefusalMessage(res(429, "slow_down", { "Retry-After": "120" }))).toMatch(/about 2 minutes/);
    expect(await aiRefusalMessage(res(429, "free_ai_budget_reached"))).toMatch(/tomorrow/);
    expect(await aiRefusalMessage(res(429, "daily_chat_limit_reached"))).toBeNull();
    expect(await aiRefusalMessage(res(500, "x"))).toBeNull();
  });
});
