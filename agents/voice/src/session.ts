/**
 * Who is calling? — resolved from a canister-issued session token.
 *
 * The browser gets a token from auth.issueAgentSession(), a call the IC
 * authenticates with the user's Internet Identity, and sends it as
 * `x-agent-session`. The Worker asks the auth canister which principal owns
 * it. Unlike the old `x-icp-principal` header (and its HMAC, whose key ships
 * in the browser bundle), a caller can't use this to claim someone else's
 * principal — and with it their AI quota or agent credits.
 */

import { resolveAgentSessionOwner } from "../authCanister";
import type { KVEnv } from "./rateLimiter";

export const SESSION_HEADER = "x-agent-session";
/** Also bounds how long a revoked token keeps working. */
export const SESSION_CACHE_TTL_SECONDS = 120;
const TOKEN_RE = /^hgs_[0-9a-f]{64}$/;

async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The verified principal behind a session token, or null when the token is
 * missing, malformed, unknown, expired, or can't be checked right now (fail
 * closed). Lookups are cached in KV under the token's hash, never the token.
 */
export async function resolveSessionPrincipal(
  token: string | null,
  env: KVEnv,
  lookup: (token: string) => Promise<string | null> = resolveAgentSessionOwner,
): Promise<string | null> {
  if (!token || !TOKEN_RE.test(token)) return null;

  const key    = `sess:${await sha256Hex(token)}`;
  const cached = await env.RATE_LIMIT.get(key);
  if (cached) return cached;

  let owner: string | null;
  try {
    owner = await lookup(token);
  } catch {
    return null;
  }
  if (owner) await env.RATE_LIMIT.put(key, owner, { expirationTtl: SESSION_CACHE_TTL_SECONDS });
  return owner;
}
