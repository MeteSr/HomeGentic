import type { HttpAgent } from "@icp-sdk/core/agent";
import { fromProfile, UserProfile } from "./authTypes";
import { idlFactory } from "@homegentic/shared/declarations/auth";
import type { IssuedSession } from "@homegentic/shared/agentSession";
import { actorFor } from "./canister";
import type { _SERVICE as AuthCanister } from "@homegentic/shared/types/auth";
import type * as AuthTypes from "@homegentic/shared/types/auth";
import { canisterError } from "@homegentic/shared/canisterError";

export type { UserRole, UserProfile } from "./authTypes";
export { fromProfile } from "./authTypes";

const AUTH_CANISTER_ID = process.env.EXPO_PUBLIC_AUTH_CANISTER_ID ?? "";


function unwrap(result: any): UserProfile {
  if ("ok" in result) return fromProfile(result.ok);
  throw canisterError(result.err);
}

/**
 * Fetch the authenticated user's profile from the auth canister.
 * Takes the already-built HttpAgent (from useAuth) rather than
 * constructing its own, so the caller's identity is used.
 *
 * Returns null when no canister ID is configured (dev/test mode).
 */
export async function getProfile(agent: HttpAgent): Promise<UserProfile | null> {
  if (!AUTH_CANISTER_ID) return null;
  const actor = actorFor<AuthCanister>(idlFactory, AUTH_CANISTER_ID, agent);
  const result = await actor.getProfile();
  return unwrap(result);
}

/**
 * Get a short-lived session token proving who this app is signed in as, for
 * the voice Worker (x-agent-session) in place of a principal the app asserts
 * itself. Returns null when no canister ID is configured or
 * the caller isn't a registered user.
 */
export async function issueAgentSession(agent: HttpAgent): Promise<IssuedSession | null> {
  if (!AUTH_CANISTER_ID) return null;
  const actor = actorFor<AuthCanister>(idlFactory, AUTH_CANISTER_ID, agent);
  const result = await actor.issueAgentSession();
  if (!("ok" in result)) return null;
  return { token: result.ok.token as string, expiresAtMs: Number(BigInt(result.ok.expiresAt) / 1_000_000n) };
}

/** The off-chain services, besides the voice Worker, that take a sign-in token of their own. */
export type ServiceAudience = "notifications" | "iotGateway";

/**
 * A short-lived token for one service (the notification relay registers push
 * tokens with it). Other services, the voice Worker included, refuse it
 * (security review 2026-11-11, X-7). Null like issueAgentSession.
 */
export async function issueServiceSession(agent: HttpAgent, audience: ServiceAudience): Promise<IssuedSession | null> {
  if (!AUTH_CANISTER_ID) return null;
  const actor = actorFor<AuthCanister>(idlFactory, AUTH_CANISTER_ID, agent);
  const result = await actor.issueServiceSession({ [audience]: null } as AuthTypes.ServiceAudience);
  if (!("ok" in result)) return null;
  return { token: result.ok.token as string, expiresAtMs: Number(BigInt(result.ok.expiresAt) / 1_000_000n) };
}
