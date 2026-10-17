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

import { TIER_LIMITS, TIER_PERIOD, CHAT_LIMITS, agentPeriodKey, nextResetUtc, type SubscriptionTier } from "../agentLimiter";

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

// ── Agent usage (read-only) ─────────────────────────────────────────────────

export interface AgentUsage {
  used:     number;
  limit:    number;
  period:   "day" | "week";
  resetsAt: string;
}

/**
 * How many agent calls the principal has used in the current period. Reads
 * the same counter checkAgentRateLimit increments, without touching it —
 * backs the mobile app's "6 of 10 AI calls left this week" meter.
 */
export async function getAgentUsage(
  principal: string,
  tier: string,
  env: KVEnv,
): Promise<AgentUsage> {
  const t      = tier as SubscriptionTier;
  const limit  = TIER_LIMITS[t] ?? 0;
  const period = TIER_PERIOD[t] ?? "day";
  const raw    = limit > 0 ? await env.RATE_LIMIT.get(`agent:${principal}:${agentPeriodKey(t)}`) : null;
  return { used: raw ? Number(raw) : 0, limit, period, resetsAt: nextResetUtc(period) };
}

// ── Chat limit per principal (daily; -1 = unlimited) ────────────────────────

export async function checkChatRateLimit(
  principal: string,
  tier: string,
  env: KVEnv,
): Promise<AgentLimitResult> {
  const limit    = CHAT_LIMITS[tier as SubscriptionTier] ?? CHAT_LIMITS.Free;
  const resetsAt = nextResetUtc("day");
  if (limit < 0) return { allowed: true, count: 0, limit, resetsAt };

  const key   = `chat:${principal}:${new Date().toISOString().slice(0, 10)}`;
  const raw   = await env.RATE_LIMIT.get(key);
  const count = raw ? Number(raw) : 0;
  if (count >= limit) return { allowed: false, count, limit, resetsAt };

  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 2 * 86_400 });
  return { allowed: true, count: count + 1, limit, resetsAt };
}

// ── Other AI / paid-API routes: per-principal daily cap (F-4) ───────────────
//
// /api/classify, /api/extract-*, /api/pulse, /api/negotiate, /api/rentcast/…
// each cost Anthropic or Rentcast money. They used to be gated only by the
// public x-api-key; now they need a session, and each principal gets a daily
// budget. Note (F-10): KV get→put is not atomic and replicates eventually, so
// a parallel burst can overshoot these soft limits; making them exact needs a
// Durable Object or the Workers Rate Limiting binding, neither of which is
// configured for this Worker yet.

export const AUX_AI_DAILY_LIMITS: Record<string, number> = {
  Free:           25,
  ContractorFree: 25,
  Pro:            200,
  ContractorPro:  200,
};

export async function checkAuxAiRateLimit(
  principal: string,
  tier: string,
  env: KVEnv,
): Promise<AgentLimitResult> {
  const limit    = AUX_AI_DAILY_LIMITS[tier] ?? AUX_AI_DAILY_LIMITS.Free;
  const resetsAt = nextResetUtc("day");
  const key      = `aux:${principal}:${new Date().toISOString().slice(0, 10)}`;
  const raw      = await env.RATE_LIMIT.get(key);
  const count    = raw ? Number(raw) : 0;
  if (count >= limit) return { allowed: false, count, limit, resetsAt };
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: 2 * 86_400 });
  return { allowed: true, count: count + 1, limit, resetsAt };
}
