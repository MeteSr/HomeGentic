/**
 * Workers KV-based rate limiters.
 *
 * Replaces two Express middlewares:
 *   - express-rate-limit  → checkGlobalRateLimit (30 req/min per IP)
 *   - agentLimiter.ts     → checkAgentRateLimit  (daily per-principal quota)
 *
 * Both use the RATE_LIMIT KV namespace.  KV has eventual consistency across
 * Workers instances, which is fine for these soft limits — the odd extra
 * request slipping through is acceptable and matches the original behaviour
 * of the single-process in-memory Map (which reset on every Railway restart).
 */

import { TIER_LIMITS, type SubscriptionTier } from "../agentLimiter";

export interface KVEnv {
  RATE_LIMIT: KVNamespace;
}

// ── Global rate limit: 30 req/min per IP ────────────────────────────────────

export async function checkGlobalRateLimit(ip: string, env: KVEnv): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  const key    = `rl:${ip}:${minute}`;
  const raw    = await env.RATE_LIMIT.get(key);
  const count  = raw ? Number(raw) : 0;
  if (count >= 30) return false;
  // TTL of 120 s ensures the key expires after the window closes
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 120 });
  return true;
}

// ── Agent daily limit per principal ─────────────────────────────────────────

export interface AgentLimitResult {
  allowed:  boolean;
  count:    number;
  limit:    number;
  resetsAt: string;
}

export async function checkAgentRateLimit(
  principal: string,
  tier: string,
  env: KVEnv,
): Promise<AgentLimitResult> {
  const limit    = TIER_LIMITS[tier as SubscriptionTier] ?? 0;
  const resetsAt = nextMidnightUtc();

  if (limit === 0) {
    return { allowed: false, count: 0, limit, resetsAt };
  }

  const today = new Date().toISOString().slice(0, 10);
  const key   = `agent:${principal}:${today}`;
  const raw   = await env.RATE_LIMIT.get(key);
  const count = raw ? Number(raw) : 0;

  if (count >= limit) {
    return { allowed: false, count, limit, resetsAt };
  }

  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 86_400 });
  return { allowed: true, count: count + 1, limit, resetsAt };
}

function nextMidnightUtc(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}
