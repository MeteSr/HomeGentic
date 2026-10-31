import type { AuthClient } from "@icp-sdk/auth/client";
import { HttpAgent } from "@icp-sdk/core/agent";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";

const DFX_NETWORK = (process.env as any).DFX_NETWORK || "local";
// IS_LOCAL is true only when running against a local replica (dfx start).
// testnet / ic / any other named IC network all use the production II URL.
const IS_LOCAL = DFX_NETWORK === "local";
// The local replica's address. LOCAL_IC_HOST overrides it for the live
// browser tests, whose PocketIC gateway listens on a random port.
const LOCAL_HOST = (process.env as any).LOCAL_IC_HOST || "http://localhost:4943";
// ii: true in icp.yaml deploys II automatically on icp network start.
// Skill-documented local URL — port matches our icp.yaml gateway port.
// @icp-sdk/auth default is https://id.ai/authorize — /authorize is where the
// ICRC-29 heartbeat listener lives. Opening the root URL lands on the II
// dashboard which doesn't respond to icrc29_status, causing a 120-second
// establish-timeout while the popup stays open.
export const II_URL = IS_LOCAL
  ? "http://id.ai.localhost:4943/authorize"
  : "https://id.ai/authorize";
// II's backend canister id, the same on mainnet and on a local network.
const II_CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai";

let _authClient: AuthClient | null = null;
let _agent: HttpAgent | null = null;

// @icp-sdk/auth is loaded on first use rather than with the entry chunk, which
// keeps it out of the first-load JS budget (perf/bundleSize1344).
export async function getAuthClient(): Promise<AuthClient> {
  if (!_authClient) {
    const { AuthClient } = await import("@icp-sdk/auth/client");
    // identityProvider is { authorizeUrl, canisterId } since @icp-sdk/auth 9
    // (a plain URL string throws).
    _authClient ??= new AuthClient({
      identityProvider: { authorizeUrl: II_URL, canisterId: II_CANISTER_ID },
    });
  }
  return _authClient;
}

export async function getAgent(): Promise<HttpAgent> {
  if (!_agent) {
    const client = await getAuthClient();
    // getIdentity() is async
    const identity = await client.getIdentity();
    // Do NOT pass shouldFetchRootKey to HttpAgent.create() — on @icp-sdk/core/agent
    // that flag triggers an eager synchronous root-key fetch that hangs when no
    // replica is reachable (e.g. E2E mock mode, CI without dfx).  Instead, fetch
    // explicitly with a timeout, matching the pattern in loginWithLocalIdentity().
    _agent = await HttpAgent.create({
      identity,
      host: IS_LOCAL ? LOCAL_HOST : "https://ic0.app",
    });
    if (IS_LOCAL) {
      await Promise.race([
        _agent.fetchRootKey(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error("fetchRootKey timeout")), 2000)
        ),
      ]).catch((err: unknown) => {
        console.warn("[actor] getAgent fetchRootKey failed — running in mock mode:", err);
      });
    }
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
  // Fixed seed → same principal every time, survives hot-reload. The live
  // browser tests sign in a second person (e.g. the contractor) by setting
  // window.__e2e_local_seed before the page loads.
  const seed = new Uint8Array(32);
  const override = typeof window !== "undefined" ? (window as any).__e2e_local_seed : undefined;
  seed[0] = typeof override === "number" ? override : 42;
  const identity = Ed25519KeyIdentity.generate(seed);
  _agent = await HttpAgent.create({ identity, host: LOCAL_HOST });
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
  // The II popup has to open while the click's user activation is live, so use
  // the client loaded by the startup isAuthenticated() check without awaiting.
  const client = _authClient ?? (await getAuthClient());
  // signIn() opens the popup at identityProvider.authorizeUrl (set in the constructor),
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
  const client = await getAuthClient();
  await client.signOut();
  resetAgent();
  _authClient = null;
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    // isAuthenticated() is synchronous
    return (await getAuthClient()).isAuthenticated();
  } catch {
    return false;
  }
}

export async function getPrincipal(): Promise<string> {
  const client = await getAuthClient();
  // getIdentity() is async
  const identity = await client.getIdentity();
  return identity.getPrincipal().toText();
}
