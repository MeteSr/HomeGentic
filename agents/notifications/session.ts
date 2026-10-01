/**
 * Who is registering a device or browser for pushes.
 *
 * Clients send the same agent session token the voice Worker uses (#558):
 * issued by auth.issueAgentSession() to the signed-in caller, sent in the
 * x-agent-session header, and resolved here with auth.resolveAgentSession().
 * The principal in the request body is never trusted — otherwise anyone could
 * subscribe to someone else's notifications.
 *
 * Positive lookups are cached briefly to spare the canister; failures aren't
 * cached and fail closed. Without CANISTER_ID_AUTH outside production (local
 * dev with no canisters), the body principal is accepted as before.
 */
import { createHash } from "crypto";
import type { Request } from "express";
import { resolveAgentSession } from "./icp";

export const SESSION_HEADER = "x-agent-session";
const TOKEN_RE = /^hgs_[0-9a-f]{64}$/;
const CACHE_TTL_MS = 120_000;
const CACHE_MAX = 10_000;

const cache = new Map<string, { principal: string; expiresAt: number }>();

const keyOf = (token: string) => createHash("sha256").update(token).digest("hex");

export function clearSessionCache(): void {
  cache.clear();
}

export async function requestPrincipal(
  req: Request,
  resolve: (token: string) => Promise<string | null> = resolveAgentSession,
): Promise<string | null> {
  if (!process.env.CANISTER_ID_AUTH && process.env.NODE_ENV !== "production") {
    const p = (req.body as { principal?: unknown })?.principal;
    return typeof p === "string" && p.length > 0 ? p : null;
  }

  const token = req.header(SESSION_HEADER) ?? "";
  if (!TOKEN_RE.test(token)) return null;

  const key = keyOf(token);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.principal;

  let principal: string | null;
  try {
    principal = await resolve(token);
  } catch (err) {
    console.error("[session] resolveAgentSession failed:", err instanceof Error ? err.message : err);
    return null;
  }
  if (principal) {
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { principal, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return principal;
}
