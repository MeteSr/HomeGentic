/**
 * Who is linking a device (security audit M9 / F-14).
 *
 * The browser sends a session token issued for this gateway only:
 * auth.issueServiceSession({ iotGateway }) by the signed-in caller, sent in the
 * x-agent-session header, and resolved here with auth.resolveServiceSession().
 * Voice Worker and relay tokens are refused (security review 2026-11-11, X-7).
 * A principal in the request body is never trusted.
 *
 * Positive lookups are cached briefly; failures aren't cached and fail closed.
 * Without CANISTER_ID_AUTH outside production (local dev with no canisters),
 * the body principal is accepted, as in the notifications relay.
 */
import { createHash } from "crypto";
import { createRequestPrincipalResolver, type SessionRequest } from "../../packages/shared/src/agentSession";
import { resolveServiceSession } from "./icp";

export { SESSION_HEADER } from "../../packages/shared/src/agentSession";

const resolver = createRequestPrincipalResolver({
  resolve: (token) => resolveServiceSession(token),
  hash: (token) => createHash("sha256").update(token).digest("hex"),
  trustBodyPrincipal: () => !process.env.CANISTER_ID_AUTH && process.env.NODE_ENV !== "production",
  // The resolver hands over the error with the token already taken out.
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
