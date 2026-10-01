/**
 * Voice-agent session token.
 *
 * The voice Worker no longer trusts a principal the browser simply asserts.
 * Instead the browser asks the auth canister for a session token —
 * issueAgentSession(), a call the IC authenticates with the user's identity
 * — and sends it as `x-agent-session`; the Worker resolves it back to the
 * principal. The token is kept in memory only, reused until shortly before it
 * expires, and re-issued when the signed-in principal changes.
 */
import { authService } from "./auth";
import { useAuthStore } from "@/store/authStore";

export const AGENT_SESSION_HEADER = "x-agent-session";
const REFRESH_MARGIN_MS = 5 * 60_000;

let cached: { token: string; expiresAtMs: number; principal: string | null } | null = null;
let inflight: Promise<string | null> | null = null;

/** A live session token for the signed-in user, or null (not signed in, no auth canister, or issue failed). */
export async function getAgentSessionToken(): Promise<string | null> {
  if (!(process.env as any).AUTH_CANISTER_ID) return null;   // mock/dev mode: no canister to issue from
  const principal = useAuthStore.getState().principal ?? null;
  if (!principal) return null;
  if (cached && cached.principal === principal && cached.expiresAtMs - REFRESH_MARGIN_MS > Date.now()) {
    return cached.token;
  }
  if (!inflight) {
    inflight = authService.issueAgentSession()
      .then((s) => { cached = { ...s, principal }; return s.token; })
      .catch((err) => { console.warn("[agentSession] could not issue a voice-agent session:", err); return null; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Forget the cached token (on logout, or after the Worker rejects it). */
export function clearAgentSession(): void {
  cached = null;
}

/**
 * fetch() with the session header attached. If the Worker answers 401 (token
 * unknown or expired, e.g. after a canister reinstall), get a fresh token and
 * retry once.
 */
export async function fetchWithAgentSession(url: string, init: RequestInit): Promise<Response> {
  const send = async () => {
    const token = await getAgentSessionToken();
    return fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), ...(token ? { [AGENT_SESSION_HEADER]: token } : {}) },
    });
  };
  const res = await send();
  if (res.status !== 401) return res;
  clearAgentSession();
  return send();
}
