/**
 * Sign-in bridge for the mobile app (/mobile-auth).
 *
 * Internet Identity only talks to web pages, so the app opens this page in the
 * system's auth browser with the public half of a session key it generated.
 * The page asks II for a delegation to that key (II never sees the private
 * key, and neither does this page), then hands the chain back to the app by
 * redirecting to its URL scheme. Because the request comes from this origin,
 * the app's principal is the same one the person has on the website.
 *
 * The redirect target is fixed: a URL parameter can't send a delegation
 * anywhere else.
 */
import type { DelegationChain } from "@icp-sdk/core/identity";

export const MOBILE_REDIRECT_URI = "homegentic://auth";

/** Longest session the app may ask for (II's own cap is 30 days). */
export const MAX_MOBILE_TTL_NS = BigInt(30 * 24 * 60 * 60) * BigInt(1_000_000_000);
const DEFAULT_MOBILE_TTL_NS = BigInt(8 * 60 * 60) * BigInt(1_000_000_000);

export interface MobileAuthRequest {
  /** DER-encoded Ed25519 public key of the app's session key. */
  publicKeyDer:  Uint8Array;
  maxTimeToLive: bigint;
}

// DER prefix of an Ed25519 SubjectPublicKeyInfo: SEQUENCE, AlgorithmIdentifier(1.3.101.112), BIT STRING.
const ED25519_DER_PREFIX = "302a300506032b6570032100";

/** Reads ?pubkey=<hex DER>&maxTimeToLive=<ns>; null when the key isn't an Ed25519 key. */
export function parseMobileAuthRequest(search: string): MobileAuthRequest | null {
  const params = new URLSearchParams(search);
  const hex = (params.get("pubkey") ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length !== 88 || !hex.startsWith(ED25519_DER_PREFIX)) return null;
  const publicKeyDer = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));

  let maxTimeToLive = DEFAULT_MOBILE_TTL_NS;
  const ttl = params.get("maxTimeToLive");
  if (ttl && /^\d+$/.test(ttl)) {
    const n = BigInt(ttl);
    if (n > BigInt(0)) maxTimeToLive = n < MAX_MOBILE_TTL_NS ? n : MAX_MOBILE_TTL_NS;
  }
  return { publicKeyDer, maxTimeToLive };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The app URL carrying the chain: base64 of DelegationChain.toJSON(), plus the user's public key. */
export function mobileRedirectUrl(chain: Pick<DelegationChain, "toJSON" | "publicKey">): string {
  const json = JSON.stringify(chain.toJSON());
  const url = new URL(MOBILE_REDIRECT_URI);
  url.searchParams.set("delegation", btoa(json));
  url.searchParams.set("pubkey", toHex(new Uint8Array(chain.publicKey)));
  return url.toString();
}
