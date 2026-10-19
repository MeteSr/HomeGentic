/**
 * Who is linking a device (security audit M9 / F-14).
 *
 * The browser sends the same agent session token the voice Worker and the
 * notifications relay use: issued by auth.issueAgentSession() to the signed-in
 * caller, sent in the x-agent-session header, and resolved here with
 * auth.resolveAgentSession(). A principal in the request body is never trusted.
 *
 * Positive lookups are cached briefly; failures aren't cached and fail closed.
 * Without CANISTER_ID_AUTH outside production (local dev with no canisters),
 * the body principal is accepted, as in the notifications relay.
 */
import { createHash } from "crypto";
import { createRequestPrincipalResolver, type SessionRequest } from "../../packages/shared/src/agentSession";
import { resolveAgentSession } from "./icp";

export { SESSION_HEADER } from "../../packages/shared/src/agentSession";

const resolver = createRequestPrincipalResolver({
  resolve: (token) => resolveAgentSession(token),
  hash: (token) => createHash("sha256").update(token).digest("hex"),
  trustBodyPrincipal: () => !process.env.CANISTER_ID_AUTH && process.env.NODE_ENV !== "production",
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
