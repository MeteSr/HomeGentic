/**
 * Who is registering a device or browser for pushes.
 *
 * Clients send a session token issued for this relay only:
 * auth.issueServiceSession({ notifications }) by the signed-in caller, sent in
 * the x-agent-session header, and resolved here with
 * auth.resolveServiceSession(). Voice Worker and gateway tokens are refused
 * (security review 2026-11-11, X-7).
 * The principal in the request body is never trusted — otherwise anyone could
 * subscribe to someone else's notifications.
 *
 * Positive lookups are cached briefly to spare the canister; failures aren't
 * cached and fail closed. Without CANISTER_ID_AUTH outside production (local
 * dev with no canisters), the body principal is accepted as before.
 */
import { createHash } from "crypto";
import { createRequestPrincipalResolver, type SessionRequest } from "../../packages/shared/src/agentSession";
import { resolveServiceSession } from "./icp";

export { SESSION_HEADER } from "../../packages/shared/src/agentSession";

const resolver = createRequestPrincipalResolver({
  resolve: (token) => resolveServiceSession(token),
  hash: (token) => createHash("sha256").update(token).digest("hex"),
  trustBodyPrincipal: () => !process.env.CANISTER_ID_AUTH && process.env.NODE_ENV !== "production",
  onError: (err) => console.error("[session] resolveServiceSession failed:", err instanceof Error ? err.message : err),
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
