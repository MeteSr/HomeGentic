/**
 * Agent call rate limiter + usage tracker.
 *
 * Counts /api/agent calls per principal per reset period. Most tiers reset
 * daily (UTC midnight); Free resets weekly (UTC Monday 00:00, ISO week) —
 * see TIER_PERIOD.
 * Emits a structured JSON-lines usage event on each call so the data is
 * available to any log aggregator (Datadog, Loki, CloudWatch, etc.).
 *
 * Storage: in-memory Map. Keys: "{principal}:{periodKey}", where periodKey
 * is "YYYY-MM-DD" for daily tiers or "YYYY-Www" (ISO week) for weekly ones.
 * In a multi-instance deployment swap the Map for a shared Redis store
 * (the interface below stays the same).
 *
 * Stale-entry cleanup runs automatically: any entry whose period key
 * differs from the caller's current period key is pruned whenever
 * checkAndRecord() is called for that principal.
 */

export type SubscriptionTier =
  | "Free"
  | "Basic"
  | "Pro"
  | "Premium"
  | "ContractorFree"
  | "ContractorPro";

export type Period = "day" | "week";

/**
 * Reset period per tier. Free resets weekly rather than daily — its
 * allowance (see TIER_LIMITS) is meant to be spread over a week, not
 * reset every 24h.
 */
export const TIER_PERIOD: Record<SubscriptionTier, Period> = {
  Free:            "week",
  Basic:           "day",
  Pro:             "day",
  Premium:         "day",
  ContractorFree:  "day",
  ContractorPro:   "day",
};

/**
 * Agent-call limits per tier, counted over each tier's TIER_PERIOD
 * (0 = no agentic access).
 *
 * Pro is the single purchasable homeowner plan. It keeps its own
 * original 10/day limit (not Premium's 20/day) — at the $59/year price,
 * 20/day would run the tier at a negative margin under the cost model in
 * docs/AI_RATE_LIMITS.md. Basic and Premium keep their original values
 * here purely so grandfathered subscribers from before the pricing
 * consolidation keep their existing limits enforced until they renew.
 * Free gets 10/week (not 10/day) — a much smaller absolute allowance
 * than Pro's, spread weekly instead of daily since Free pays nothing and
 * every call is pure cost with no revenue to offset it.
 */
export const TIER_LIMITS: Record<SubscriptionTier, number> = {
  Free:           10,
  Basic:           5,
  Pro:            10,
  Premium:        20,
  ContractorFree:  0,
  ContractorPro:  10,
};

/** Daily chat-call limits per tier (-1 = unlimited). */
export const CHAT_LIMITS: Record<SubscriptionTier, number> = {
  Free:            3,
  Basic:          -1,
  Pro:            -1,
  Premium:        -1,
  ContractorFree:  3,
  ContractorPro:  -1,
};

// ── in-memory counters ────────────────────────────────────────────────────────

const counts     = new Map<string, number>(); // agent calls
const chatCounts = new Map<string, number>(); // chat calls

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

/** ISO-8601 week string "YYYY-Www" (Monday-start weeks, per ISO 8601). */
function utcWeekString(): string {
  const now  = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // Shift to the Thursday of this ISO week — the ISO week-year is whichever
  // calendar year that Thursday falls in.
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const isoYear      = date.getUTCFullYear();
  const jan4         = new Date(Date.UTC(isoYear, 0, 4));
  const jan4DayNum   = (jan4.getUTCDay() + 6) % 7;
  const week1Monday  = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4DayNum);
  const weekNum = Math.round((date.getTime() - week1Monday.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${isoYear}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Current period key for a tier's agent-call counter: daily or weekly.
 * Exported so other rate-limiter implementations (e.g. src/rateLimiter.ts,
 * the Cloudflare Workers/KV variant) can key their own storage the same way
 * without re-deriving the ISO week math.
 */
export function agentPeriodKey(tier: SubscriptionTier): string {
  return (TIER_PERIOD[tier] ?? "day") === "week" ? utcWeekString() : utcDateString();
}

function counterKey(principal: string, periodKey: string): string {
  return `${principal}:${periodKey}`;
}

/** Remove any entries for this principal in `map` that aren't the current period. */
function pruneStale(map: Map<string, number>, principal: string, currentPeriodKey: string): void {
  for (const key of map.keys()) {
    if (key.startsWith(`${principal}:`) && !key.endsWith(`:${currentPeriodKey}`)) {
      map.delete(key);
    }
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export interface LimitCheckResult {
  /** Whether this call should be allowed. */
  allowed:    boolean;
  /** Call count *after* this check (incremented only when allowed). */
  count:      number;
  /** Limit for this tier over its reset period (0 = no access). */
  limit:      number;
  /** ISO timestamp at which the counter resets (next period boundary). */
  resetsAt:   string;
}

/**
 * Check whether a principal may make an agent call and, if so, record it.
 * Emits a structured usage log line to process.stdout in both cases.
 */
export function checkAndRecord(
  principal: string,
  tier: SubscriptionTier,
): LimitCheckResult {
  const period   = agentPeriodKey(tier);
  const key      = counterKey(principal, period);
  const limit    = TIER_LIMITS[tier] ?? 0;
  const resetsAt = nextResetUtc(TIER_PERIOD[tier] ?? "day");

  pruneStale(counts, principal, period);

  const current = counts.get(key) ?? 0;
  const allowed = limit > 0 && current < limit;

  if (allowed) {
    counts.set(key, current + 1);
  }

  const count = allowed ? current + 1 : current;

  // Structured usage event — one JSON line per call attempt.
  // Fields: ts, event, principal, tier, count, limit, allowed.
  // Omit PII: no message content, no IP (already logged in request middleware).
  const usageEvent = {
    ts:        new Date().toISOString(),
    event:     "agent_call",
    principal,
    tier,
    count,
    limit,
    allowed,
  };
  process.stdout.write(JSON.stringify(usageEvent) + "\n");

  return { allowed, count, limit, resetsAt };
}

/**
 * Check whether a principal may make a chat call and, if so, record it.
 * Free / ContractorFree tiers are limited to 3 chats/day; paid tiers are
 * unlimited. Chat always resets daily regardless of tier — only the agent
 * call quota has a per-tier reset period (see TIER_PERIOD).
 */
export function checkAndRecordChat(
  principal: string,
  tier: SubscriptionTier,
): LimitCheckResult {
  const today    = utcDateString();
  const key      = counterKey(principal, today);
  const limit    = CHAT_LIMITS[tier] ?? 3;
  const resetsAt = nextResetUtc("day");

  pruneStale(chatCounts, principal, today);

  const current = chatCounts.get(key) ?? 0;
  const allowed = limit === -1 || current < limit;

  if (allowed) {
    chatCounts.set(key, current + 1);
  }

  const count = allowed ? current + 1 : current;

  const usageEvent = {
    ts:        new Date().toISOString(),
    event:     "chat_call",
    principal,
    tier,
    count,
    limit,
    allowed,
  };
  process.stdout.write(JSON.stringify(usageEvent) + "\n");

  return { allowed, count, limit: limit === -1 ? Infinity : limit, resetsAt };
}

/**
 * Return the current agent-call count for a principal without incrementing.
 * Used for surfacing the remaining quota to the frontend. `tier` determines
 * whether the current period is a day or a week (see TIER_PERIOD).
 */
export function getCount(principal: string, tier: SubscriptionTier): number {
  const key = counterKey(principal, agentPeriodKey(tier));
  return counts.get(key) ?? 0;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function nextMidnightUtc(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}

/** Next Monday 00:00:00 UTC strictly after now. */
function nextMondayUtc(): string {
  const now     = new Date();
  const d       = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum  = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
  const daysOut = 7 - dayNum; // if today is already Monday, the next reset is 7 days out
  d.setUTCDate(d.getUTCDate() + daysOut);
  return d.toISOString();
}

/** Next reset boundary for a period, exported for the same reason as agentPeriodKey(). */
export function nextResetUtc(period: Period): string {
  return period === "week" ? nextMondayUtc() : nextMidnightUtc();
}
