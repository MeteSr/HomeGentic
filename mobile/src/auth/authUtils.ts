// Pure utility functions for Internet Identity auth.
// No side effects — safe to unit-test without native modules.

export const II_URL = "https://identity.ic0.app";
export const REDIRECT_URI = "homegentic://auth";

// 8 hours expressed in nanoseconds (ICP delegation TTL unit)
const DEFAULT_TTL_NS = BigInt(8 * 60 * 60) * BigInt(1_000_000_000);

/**
 * Build the Internet Identity authorization URL.
 * After the user authenticates, II redirects to:
 *   {redirectUri}?delegation=<base64-delegation-chain-JSON>&pubkey=<hex-user-public-key>
 */
export function buildIIAuthUrl(
  sessionPublicKeyHex: string,
  redirectUri: string = REDIRECT_URI,
): string {
  const url = new URL(`${II_URL}/#authorize`);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("pubkey", sessionPublicKeyHex);
  url.searchParams.set("maxTimeToLive", DEFAULT_TTL_NS.toString());
  return url.toString();
}

export interface ParsedAuthCallback {
  /** Raw JSON string of the DelegationChain */
  delegationChainJSON: string;
  /** Hex-encoded user public key returned by II */
  userPublicKey: string;
}

/**
 * Parse the deep-link callback from Internet Identity.
 * Returns null on any parse failure — caller should treat null as auth error.
 */
export function parseAuthCallback(url: string): ParsedAuthCallback | null {
  try {
    if (!url) return null;

    // Handle both query-string and hash-fragment delivery
    const urlObj = new URL(url);
    const params = urlObj.searchParams;

    const delegationB64 = params.get("delegation");
    const userPublicKey  = params.get("pubkey");

    if (!delegationB64 || !userPublicKey) return null;

    // Decode base64 → JSON string
    const delegationChainJSON = atob(delegationB64);

    // Validate it's parseable JSON before storing
    JSON.parse(delegationChainJSON);

    return { delegationChainJSON, userPublicKey };
  } catch {
    return null;
  }
}

/**
 * Check whether the first delegation in the chain has expired.
 * Returns true (treat as expired) on any parse failure so callers
 * always re-authenticate on bad state.
 */
export function isDelegationExpired(delegationChainJSON: string): boolean {
  try {
    const chain = JSON.parse(delegationChainJSON) as {
      delegations: Array<{ delegation: { expiration: string } }>;
    };

    if (!chain.delegations?.length) return true;

    const expirationNs = BigInt(chain.delegations[0].delegation.expiration);
    // ICP expiration is in nanoseconds; Date.now() is milliseconds
    const nowNs = BigInt(Date.now()) * BigInt(1_000_000);
    return expirationNs <= nowNs;
  } catch {
    return true;
  }
}
