/**
 * Rate limiters for the Worker.
 *
 * Replaces two Express middlewares:
 *   - express-rate-limit  → checkGlobalRateLimit (30 req/min per IP)
 *   - agentLimiter.ts     → checkAgentRateLimit  (per-principal quota,
 *     reset daily or weekly depending on tier — see TIER_PERIOD)
 *
 * F-10: counters live in the RateLimiterDO Durable Object (one instance per
 * key via idFromName), whose check-and-increment is atomic, so a parallel
 * burst can't overshoot a limit. The old Workers KV get→put path (not atomic,
 * eventually consistent) is kept only as a fallback when the RATE_LIMITER
 * binding is absent (unit tests / bare local runs).
 */

import { TIER_LIMITS, TIER_PERIOD, CHAT_LIMITS, agentPeriodKey, nextResetUtc, type SubscriptionTier } from "../agentLimiter";
import { doHit, doPeek, doRelease, type CounterNamespace } from "./rateLimiterDO";

export interface KVEnv {
  RATE_LIMIT: KVNamespace;
  /** Durable Object namespace for RateLimiterDO; preferred over KV when bound. */
  RATE_LIMITER?: DurableObjectNamespace | CounterNamespace;
}

/**
 * Atomically count one hit against `key` (fixed window of `ttlSeconds`,
 * usually encoded in the key too). Returns allowed=false, without counting,
 * once `limit` is reached.
 */
export async function hitCounter(
  env: Partial<KVEnv>,
  key: string,
  limit: number,
  ttlSeconds: number,
): Promise<{ allowed: boolean; count: number }> {
  if (env.RATE_LIMITER) return doHit(env.RATE_LIMITER as CounterNamespace, key, limit, ttlSeconds);
  if (!env.RATE_LIMIT) return { allowed: true, count: 0 };
  // Fallback: KV read-then-write (racy; only used without the DO binding).
  const raw   = await env.RATE_LIMIT.get(key);
  const count = raw ? Number(raw) : 0;
  if (count >= limit) return { allowed: false, count };
  await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: Math.max(60, ttlSeconds) });
  return { allowed: true, count: count + 1 };
}

/** Current count for `key` without incrementing it. */
export async function peekCounter(env: Partial<KVEnv>, key: string): Promise<number> {
  if (env.RATE_LIMITER) return doPeek(env.RATE_LIMITER as CounterNamespace, key);
  const raw = env.RATE_LIMIT ? await env.RATE_LIMIT.get(key) : null;
  return raw ? Number(raw) : 0;
}

/** True exactly once per `key` within `ttlSeconds` (dedupe / idempotency). */
export async function claimOnce(env: Partial<KVEnv>, key: string, ttlSeconds: number): Promise<boolean> {
  return (await hitCounter(env, key, 1, ttlSeconds)).allowed;
}

/** Undo a claimOnce (e.g. the guarded side effect failed and may be retried). */
export async function releaseClaim(env: Partial<KVEnv>, key: string): Promise<void> {
  if (env.RATE_LIMITER) return doRelease(env.RATE_LIMITER as CounterNamespace, key);
  if (env.RATE_LIMIT) await env.RATE_LIMIT.delete(key);
}

/**
 * Two-phase dedupe for side effects that must run once but may fail midway
 * (Stripe webhooks). beginOnce takes a short "busy" claim, so if the Worker
 * dies before finishOnce/abortOnce the claim lapses and a retry can run;
 * finishOnce records the long-lived "done" marker.
 *   "new"  — run it now, then call finishOnce (or abortOnce on failure)
 *   "done" — already completed
 *   "busy" — another delivery is running it right now
 */
export async function beginOnce(
  env: Partial<KVEnv>, key: string, busyTtlSeconds = 300,
): Promise<"new" | "done" | "busy"> {
  if ((await peekCounter(env, `${key}:done`)) > 0) return "done";
  return (await claimOnce(env, `${key}:busy`, busyTtlSeconds)) ? "new" : "busy";
}

export async function finishOnce(env: Partial<KVEnv>, key: string, doneTtlSeconds: number): Promise<void> {
  await hitCounter(env, `${key}:done`, 1, doneTtlSeconds);
  await releaseClaim(env, `${key}:busy`).catch(() => {});
}

export async function abortOnce(env: Partial<KVEnv>, key: string): Promise<void> {
  await releaseClaim(env, `${key}:busy`).catch(() => {});
}

// ── Global rate limit: 30 req/min per IP ────────────────────────────────────

export async function checkGlobalRateLimit(ip: string, env: KVEnv): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60_000);
  // TTL of 120 s ensures the key expires after the window closes
  return (await hitCounter(env, `rl:${ip}:${minute}`, 30, 120)).allowed;
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

  // TTL just needs to outlive the current period so the key naturally
  // expires once superseded; a day's slop past the period length is fine.
  const ttlSeconds = period === "week" ? 8 * 86_400 : 2 * 86_400;
  const r = await hitCounter(env, `agent:${principal}:${agentPeriodKey(t)}`, limit, ttlSeconds);
  return { allowed: r.allowed, count: r.count, limit, resetsAt };
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
  const used   = limit > 0 ? await peekCounter(env, `agent:${principal}:${agentPeriodKey(t)}`) : 0;
  return { used, limit, period, resetsAt: nextResetUtc(period) };
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

  const key = `chat:${principal}:${new Date().toISOString().slice(0, 10)}`;
  const r   = await hitCounter(env, key, limit, 2 * 86_400);
  return { allowed: r.allowed, count: r.count, limit, resetsAt };
}

// ── Other AI / paid-API routes: per-principal daily cap (F-4) ───────────────
//
// /api/classify, /api/extract-*, /api/pulse, /api/negotiate, /api/rentcast/…
// each cost Anthropic or Rentcast money. They used to be gated only by the
// public x-api-key; now they need a session, and each principal gets a daily
// budget, counted atomically in RateLimiterDO (F-10).

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
  const r        = await hitCounter(env, key, limit, 2 * 86_400);
  return { allowed: r.allowed, count: r.count, limit, resetsAt };
}
