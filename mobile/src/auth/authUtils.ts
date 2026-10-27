// Pure utility functions for Internet Identity auth.
// No side effects — safe to unit-test without native modules.

/**
 * Sign-in runs on the web app's /mobile-auth page, opened in the system's
 * auth browser. Internet Identity only talks to web pages (postMessage), so
 * the page asks it for a delegation to this app's session key, then redirects
 * to REDIRECT_URI with the chain. Signing in through the web app's origin
 * also means the app gets the same principal as the website.
 */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "https://homegentic.app").replace(/\/$/, "");
export const AUTH_BRIDGE_URL = `${WEB_URL}/mobile-auth`;
export const REDIRECT_URI = "homegentic://auth";

// 8 hours expressed in nanoseconds (ICP delegation TTL unit)
const DEFAULT_TTL_NS = BigInt(8 * 60 * 60) * BigInt(1_000_000_000);

/**
 * The sign-in page URL for this login's session key (hex DER). The page only
 * ever redirects to REDIRECT_URI.
 */
export function buildIIAuthUrl(sessionPublicKeyHex: string, bridgeUrl: string = AUTH_BRIDGE_URL): string {
  // Built by hand: React Native's URL can't edit search params reliably.
  return `${bridgeUrl}?pubkey=${encodeURIComponent(sessionPublicKeyHex)}&maxTimeToLive=${DEFAULT_TTL_NS.toString()}`;
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
 * When the chain stops working (ms): the earliest expiration in it. The JSON
 * form (DelegationChain.toJSON) writes expirations as hex nanoseconds without
 * a 0x prefix. Null when the chain can't be read.
 */
export function delegationExpiryMs(delegationChainJSON: string): number | null {
  try {
    const chain = JSON.parse(delegationChainJSON) as {
      delegations: Array<{ delegation: { expiration: string } }>;
    };
    if (!chain.delegations?.length) return null;
    let earliest: bigint | null = null;
    for (const d of chain.delegations) {
      const raw = String(d.delegation.expiration);
      const ns = BigInt(raw.startsWith("0x") ? raw : `0x${raw}`);
      if (earliest === null || ns < earliest) earliest = ns;
    }
    return earliest === null ? null : Number(earliest / BigInt(1_000_000));
  } catch {
    return null;
  }
}

/**
 * Whether the chain has expired (or expires within `marginMs`). Treats an
 * unreadable chain as expired so callers always re-authenticate on bad state.
 */
export function isDelegationExpired(delegationChainJSON: string, now = Date.now(), marginMs = 0): boolean {
  const expiry = delegationExpiryMs(delegationChainJSON);
  return expiry === null || expiry <= now + marginMs;
}

/**
 * True when the chain's final delegation targets `sessionPublicKeyHex` (the
 * DER-encoded Ed25519 session key this app generated for the login). A chain
 * delegated to any other key is rejected rather than stored.
 */
export function delegationTargetsKey(delegationChainJSON: string, sessionPublicKeyHex: string): boolean {
  try {
    const chain = JSON.parse(delegationChainJSON) as {
      delegations?: Array<{ delegation?: { pubkey?: string } }>;
    };
    const last = chain.delegations?.[chain.delegations.length - 1];
    const target = last?.delegation?.pubkey;
    if (typeof target !== "string" || !target) return false;
    return target.toLowerCase() === sessionPublicKeyHex.toLowerCase();
  } catch {
    return false;
  }
}
