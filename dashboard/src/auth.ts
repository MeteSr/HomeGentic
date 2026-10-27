/**
 * Internet Identity sign-in for the admin dashboard.
 *
 * Mirrors frontend/src/services/actor.ts (same @icp-sdk/auth AuthClient, same
 * II URLs), minus the local-dev fixed-seed identity: every metrics call is
 * made as the signed-in II principal, which the auth / payment / monitoring
 * canisters check against their admin lists.
 *
 * Root key: never fetchRootKey() (canister-security skill, pitfall 7). On a
 * local network vite.config.ts reads the root key from `icp network status
 * --json` at dev/build time and injects it as process.env.IC_ROOT_KEY; on
 * mainnet nothing is injected and the agent uses its built-in mainnet key.
 */

import { AuthClient } from "@icp-sdk/auth/client";
import { HttpAgent } from "@icp-sdk/core/agent";

const DFX_NETWORK = process.env.DFX_NETWORK || "local";
const IS_LOCAL    = DFX_NETWORK === "local";

const II_URL = IS_LOCAL
  ? "http://id.ai.localhost:4943/authorize"
  : "https://id.ai/authorize";
// II's backend canister id, the same on mainnet and on a local network.
const II_CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai";

const HOST = IS_LOCAL
  ? (process.env.IC_API_URL || "http://localhost:4943")
  : "https://icp-api.io";

/** Local root key injected at build time (hex), or undefined on mainnet. */
function rootKey(): Uint8Array | undefined {
  if (!IS_LOCAL) return undefined;
  const hex = process.env.IC_ROOT_KEY || "";
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) return undefined;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** True when a local network is targeted but no root key was injected. */
export const MISSING_LOCAL_ROOT_KEY = IS_LOCAL && !rootKey();

let _client: AuthClient | null = null;

function client(): AuthClient {
  if (!_client) {
    _client = new AuthClient({
      identityProvider: { authorizeUrl: II_URL, canisterId: II_CANISTER_ID },
    });
  }
  return _client;
}

export function isSignedIn(): boolean {
  try {
    return client().isAuthenticated();
  } catch {
    return false;
  }
}

export async function signIn(): Promise<void> {
  // Admin sessions are kept short: 1 hour.
  await client().signIn({ maxTimeToLive: BigInt(60 * 60 * 1_000_000_000) });
}

export async function signOut(): Promise<void> {
  await client().signOut();
  _client = null;
}

/** An agent signed with the II identity. Call only after isSignedIn(). */
export async function makeAuthedAgent(): Promise<{ agent: HttpAgent; principal: string }> {
  const identity = await client().getIdentity();
  const principal = identity.getPrincipal();
  if (principal.isAnonymous()) throw new Error("Not signed in");
  const agent = await HttpAgent.create({ identity, host: HOST, rootKey: rootKey() });
  return { agent, principal: principal.toText() };
}
