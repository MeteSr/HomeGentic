import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { fromProfile, UserProfile } from "./authTypes";
import { idlFactory } from "@homegentic/shared/declarations/auth";
import type { IssuedSession } from "@homegentic/shared/agentSession";

export type { UserRole, UserProfile } from "./authTypes";
export { fromProfile } from "./authTypes";

const AUTH_CANISTER_ID = process.env.EXPO_PUBLIC_AUTH_CANISTER_ID ?? "";


function unwrap(result: any): UserProfile {
  if ("ok" in result) return fromProfile(result.ok);
  const key = Object.keys(result.err)[0];
  const val  = result.err[key];
  throw new Error(typeof val === "string" ? val : key);
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
  const actor = Actor.createActor(idlFactory, {
    agent,
    canisterId: AUTH_CANISTER_ID,
  });
  const result = await (actor as any).getProfile();
  return unwrap(result);
}

/**
 * Get a short-lived session token proving who this app is signed in as.
 * The notification relay accepts it (x-agent-session) in place of a principal
 * the app asserts itself. Returns null when no canister ID is configured or
 * the caller isn't a registered user.
 */
export async function issueAgentSession(agent: HttpAgent): Promise<IssuedSession | null> {
  if (!AUTH_CANISTER_ID) return null;
  const actor = Actor.createActor(idlFactory, { agent, canisterId: AUTH_CANISTER_ID });
  const result = await (actor as any).issueAgentSession();
  if (!("ok" in result)) return null;
  return { token: result.ok.token as string, expiresAtMs: Number(BigInt(result.ok.expiresAt) / 1_000_000n) };
}
