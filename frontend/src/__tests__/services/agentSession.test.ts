/**
 * agentSession.ts — the browser proves its identity to the voice Worker with
 * a canister-issued session token instead of an asserted principal.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const issue = vi.fn();
vi.mock("@/services/auth", () => ({ authService: { issueAgentSession: (...a: unknown[]) => issue(...a) } }));

import { getAgentSessionToken, clearAgentSession, fetchWithAgentSession, AGENT_SESSION_HEADER } from "@/services/agentSession";
import { useAuthStore } from "@/store/authStore";

const HOUR = 3_600_000;
const setPrincipal = (p: string | null) => useAuthStore.setState({ principal: p } as any);

beforeEach(() => {
  (process.env as any).AUTH_CANISTER_ID = "aaaaa-aa";
  setPrincipal("user-a");
  clearAgentSession();
  issue.mockReset();
  vi.unstubAllGlobals();
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
});
