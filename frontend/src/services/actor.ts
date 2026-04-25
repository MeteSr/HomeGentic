import { AuthClient } from "@icp-sdk/auth/client";
import { HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

const DFX_NETWORK = (process.env as any).DFX_NETWORK || "local";
const IS_LOCAL = DFX_NETWORK !== "ic";
// ii: true in icp.yaml deploys II automatically on icp network start.
// Skill-documented local URL — port matches our icp.yaml gateway port.
// @icp-sdk/auth default is https://id.ai/authorize — /authorize is where the
// ICRC-29 heartbeat listener lives. Opening the root URL lands on the II
// dashboard which doesn't respond to icrc29_status, causing a 120-second
// establish-timeout while the popup stays open.
export const II_URL = IS_LOCAL
  ? "http://id.ai.localhost:4943/authorize"
  : "https://id.ai/authorize";

let _authClient: AuthClient | null = null;
let _agent: HttpAgent | null = null;

export function getAuthClient(): AuthClient {
  if (!_authClient) {
    // v6: synchronous constructor; identityProvider is set at creation time
    _authClient = new AuthClient({ identityProvider: II_URL });
  }
  return _authClient;
}

export async function getAgent(): Promise<HttpAgent> {
  if (!_agent) {
    const client = getAuthClient();
    // v6: getIdentity() is now async
    const identity = await client.getIdentity();
    _agent = await HttpAgent.create({
      identity,
      host: IS_LOCAL ? "http://localhost:4943" : "https://ic0.app",
      shouldFetchRootKey: IS_LOCAL,
    });
  }
  return _agent;
}

export function resetAgent() {
  _agent = null;
}

/**
 * Test-only: inject a pre-built HttpAgent so integration tests can bypass
 * AuthClient and Internet Identity entirely.
 * Throws in production to prevent accidental misuse.
 */
export function setAgentForTesting(agent: HttpAgent): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
    throw new Error("setAgentForTesting must not be called in production");
  }
  _agent = agent;
}

/**
 * Local-dev bypass — creates a deterministic Ed25519 identity without Internet Identity.
 * Only used in development; production always goes through II.
 * Returns the principal text so callers can update auth state.
 */
export async function loginWithLocalIdentity(): Promise<string> {
  // Hard-block on IC mainnet — this function is only valid on a local replica
  if (!IS_LOCAL) {
    throw new Error("loginWithLocalIdentity() must not be called in production");
  }
  // Fixed seed → same principal every time, survives hot-reload
  const seed = new Uint8Array(32);
  seed[0] = 42;
  const identity = Ed25519KeyIdentity.generate(seed);
  _agent = await HttpAgent.create({ identity, host: "http://localhost:4943" });
  // Fetch the local replica's root key so canister calls can be verified.
  // When no replica is running (e.g. mock-mode E2E without deploy), this fails
  // gracefully — all service calls will fall back to their mock implementations.
  // 2-second timeout prevents hanging when port 4943 is firewalled (common in CI).
  await Promise.race([
    _agent.fetchRootKey(),
    new Promise<void>((_, reject) => setTimeout(() => reject(new Error("fetchRootKey timeout")), 2000)),
  ]).catch((err: unknown) => {
    console.warn("[actor] fetchRootKey failed — running in mock mode (no replica):", err);
  });
  return identity.getPrincipal().toText();
}

export async function login(): Promise<void> {
  const client = getAuthClient();
  // v6: signIn() opens popup at identityProvider URL (set in constructor),
  // establishes ICRC-29 heartbeat, then requests delegation via ICRC-34.
  // Throws if the popup can't establish the channel (wrong URL, old II, etc.)
  try {
    await client.signIn({ maxTimeToLive: BigInt(8 * 60 * 60 * 1_000_000_000) });
  } catch (err) {
    console.error("[actor] signIn failed:", err);
    throw err;
  }
  resetAgent();
}

export async function logout(): Promise<void> {
  const client = getAuthClient();
  await client.logout();
  resetAgent();
  _authClient = null;
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    // v6: isAuthenticated() is synchronous, checks localStorage expiration flag
    return getAuthClient().isAuthenticated();
  } catch {
    return false;
  }
}

export async function getPrincipal(): Promise<string> {
  const client = getAuthClient();
  // v6: getIdentity() is async
  const identity = await client.getIdentity();
  return identity.getPrincipal().toText();
}
