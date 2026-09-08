/**
 * Workers KV-based rate limiters.
 *
 * Replaces two Express middlewares:
 *   - express-rate-limit  → checkGlobalRateLimit (30 req/min per IP)
 *   - agentLimiter.ts     → checkAgentRateLimit  (per-principal quota,
 *     reset daily or weekly depending on tier — see TIER_PERIOD)
 *
 * Both use the RATE_LIMIT KV namespace.  KV has eventual consistency across
 * Workers instances, which is fine for these soft limits — the odd extra
 * request slipping through is acceptable and matches the original behaviour
 * of the single-process in-memory Map (which reset on every Railway restart).
 */

import { TIER_LIMITS, TIER_PERIOD, agentPeriodKey, nextResetUtc, type SubscriptionTier } from "../agentLimiter";

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

// ── Agent limit per principal (daily or weekly, per tier) ───────────────────

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
  const t        = tier as SubscriptionTier;
  const limit    = TIER_LIMITS[t] ?? 0;
  const period   = TIER_PERIOD[t] ?? "day";
  const resetsAt = nextResetUtc(period);

  if (limit === 0) {
    return { allowed: false, count: 0, limit, resetsAt };
  }

  const key   = `agent:${principal}:${agentPeriodKey(t)}`;
  const raw   = await env.RATE_LIMIT.get(key);
  const count = raw ? Number(raw) : 0;

  if (count >= limit) {
    return { allowed: false, count, limit, resetsAt };
  }

  // TTL just needs to outlive the current period so the key naturally
  // expires once superseded; a day's slop past the period length is fine.
  const ttlSeconds = period === "week" ? 8 * 86_400 : 2 * 86_400;
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: ttlSeconds });
  return { allowed: true, count: count + 1, limit, resetsAt };
}
