/**
 * Who is registering a device or browser for pushes.
 *
 * Clients send the same agent session token the voice Worker uses (#558):
 * issued by auth.issueAgentSession() to the signed-in caller, sent in the
 * x-agent-session header, and resolved here with auth.resolveAgentSession().
 * The principal in the request body is never trusted — otherwise anyone could
 * subscribe to someone else's notifications.
 *
 * Positive lookups are cached briefly to spare the canister; failures aren't
 * cached and fail closed. Without CANISTER_ID_AUTH outside production (local
 * dev with no canisters), the body principal is accepted as before.
 */
import { createHash } from "crypto";
import { createRequestPrincipalResolver, type SessionRequest } from "../../packages/shared/src/agentSession";
import { resolveAgentSession } from "./icp";

export { SESSION_HEADER } from "../../packages/shared/src/agentSession";

const resolver = createRequestPrincipalResolver({
  resolve: (token) => resolveAgentSession(token),
  hash: (token) => createHash("sha256").update(token).digest("hex"),
  trustBodyPrincipal: () => !process.env.CANISTER_ID_AUTH && process.env.NODE_ENV !== "production",
  onError: (err) => console.error("[session] resolveAgentSession failed:", err instanceof Error ? err.message : err),
});

export function clearSessionCache(): void {
  resolver.clearCache();
}

export function requestPrincipal(
  req: SessionRequest,
  resolve?: (token: string) => Promise<string | null>,
): Promise<string | null> {
  return resolver.requestPrincipal(req, resolve);
}
