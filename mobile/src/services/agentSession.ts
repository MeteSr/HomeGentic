/**
 * Caches the auth canister's agent session token. The voice Worker resolves
 * it to the caller's principal (and from that, their tier and AI quota).
 */
import { issueAgentSession } from "./authService";
import { getIcpAgent } from "./icpAgent";

// Tokens live for hours on the canister; refresh well before that.
const REFRESH_MS = 30 * 60 * 1000;

let cached: { token: string; at: number } | null = null;
let inflight: Promise<string | null> | null = null;

export async function getAgentSessionToken(): Promise<string | null> {
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached.token;
  if (!inflight) {
    inflight = issueAgentSession(getIcpAgent())
      .then((token) => {
        cached = token ? { token, at: Date.now() } : null;
        return token;
      })
      .catch(() => null)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Forget the token (on sign-out). */
export function clearAgentSession(): void {
  cached = null;
}
