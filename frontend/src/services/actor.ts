import { AuthClient } from "@dfinity/auth-client";
import { HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";

const DFX_NETWORK = (process.env as any).DFX_NETWORK || "local";
const IS_LOCAL = DFX_NETWORK !== "ic";
export const II_URL = IS_LOCAL
  ? "http://rdmx6-jaaaa-aaaaa-aaadq-cai.localhost:4943/"
  : "https://identity.ic0.app";

let _authClient: AuthClient | null = null;
let _agent: HttpAgent | null = null;

export async function getAuthClient(): Promise<AuthClient> {
  if (!_authClient) {
    _authClient = await AuthClient.create();
  }
  return _authClient;
}

export async function getAgent(): Promise<HttpAgent> {
  if (!_agent) {
    const client = await getAuthClient();
    const identity = client.getIdentity();
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
 * Local-dev bypass — creates a deterministic Ed25519 identity without Internet Identity.
 * Only used in development; production always goes through II.
 * Returns the principal text so callers can update auth state.
 */
export async function loginWithLocalIdentity(): Promise<string> {
  // Fixed seed → same principal every time, survives hot-reload
  const seed = new Uint8Array(32);
  seed[0] = 42;
  const identity = Ed25519KeyIdentity.generate(seed);
  _agent = await HttpAgent.create({
    identity,
    host: "http://localhost:4943",
    shouldFetchRootKey: true,
  });
  return identity.getPrincipal().toText();
}

export async function login(): Promise<void> {
  const client = await getAuthClient();
  return new Promise((resolve, reject) => {
    client.login({
      identityProvider: II_URL,
      maxTimeToLive: BigInt(7 * 24 * 60 * 60 * 1_000_000_000),
      onSuccess: () => {
        resetAgent();
        resolve();
      },
      onError: reject,
    });
  });
}

export async function logout(): Promise<void> {
  const client = await getAuthClient();
  await client.logout();
  resetAgent();
  _authClient = null;
}

export async function isAuthenticated(): Promise<boolean> {
  const client = await getAuthClient();
  return client.isAuthenticated();
}

export async function getPrincipal(): Promise<string> {
  const client = await getAuthClient();
  return client.getIdentity().getPrincipal().toText();
}
