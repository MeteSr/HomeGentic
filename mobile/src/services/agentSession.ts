/**
 * Caches the auth canister's agent session token. The voice Worker resolves
 * it to the caller's principal (and from that, their tier and AI quota).
 */
import { createSessionTokenCache } from "@homegentic/shared/agentSession";
import { issueAgentSession } from "./authService";
import { getIcpAgent } from "./icpAgent";

const sessions = createSessionTokenCache({
  issue: () => issueAgentSession(getIcpAgent()),
});

export function getAgentSessionToken(): Promise<string | null> {
  return sessions.get();
}

/** Forget the token (on sign-out). */
export function clearAgentSession(): void {
  sessions.clear();
}
