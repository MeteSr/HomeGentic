/**
 * Agent call rate limiter + usage tracker.
 *
 * Counts /api/agent calls per principal per UTC day.
 * Emits a structured JSON-lines usage event on each call so the data is
 * available to any log aggregator (Datadog, Loki, CloudWatch, etc.).
 *
 * Storage: in-memory Map.  Keys: "{principal}:{YYYY-MM-DD}".
 * In a multi-instance deployment swap the Map for a shared Redis store
 * (the interface below stays the same).
 *
 * Stale-entry cleanup runs automatically: any entry whose date differs
 * from today's UTC date is pruned whenever checkAndRecord() is called
 * for that principal.
 */

export type SubscriptionTier =
  | "Free"
  | "Basic"
  | "Pro"
  | "Premium"
  | "ContractorFree"
  | "ContractorPro";

/** Daily agent-call limits per tier (0 = no agentic access). */
export const TIER_LIMITS: Record<SubscriptionTier, number> = {
  Free:            0,
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

function counterKey(principal: string, date: string): string {
  return `${principal}:${date}`;
}

/** Remove any counter keys for this principal that are not today. */
function pruneStale(principal: string, today: string): void {
  for (const map of [counts, chatCounts]) {
    for (const key of map.keys()) {
      if (key.startsWith(`${principal}:`) && !key.endsWith(`:${today}`)) {
        map.delete(key);
      }
    }
  }
}

// ── public API ────────────────────────────────────────────────────────────────

export interface LimitCheckResult {
  /** Whether this call should be allowed. */
  allowed:    boolean;
  /** Call count *after* this check (incremented only when allowed). */
  count:      number;
  /** Daily limit for this tier (0 = no access). */
  limit:      number;
  /** ISO timestamp at which the counter resets (next midnight UTC). */
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
  const today    = utcDateString();
  const key      = counterKey(principal, today);
  const limit    = TIER_LIMITS[tier] ?? 0;
  const resetsAt = nextMidnightUtc();

  pruneStale(principal, today);

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
 * Free / ContractorFree tiers are limited to 3 chats/day; paid tiers are unlimited.
 */
export function checkAndRecordChat(
  principal: string,
  tier: SubscriptionTier,
): LimitCheckResult {
  const today    = utcDateString();
  const key      = counterKey(principal, today);
  const limit    = CHAT_LIMITS[tier] ?? 3;
  const resetsAt = nextMidnightUtc();

  pruneStale(principal, today);

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
 * Return the current daily count for a principal without incrementing.
 * Used for surfacing the remaining quota to the frontend.
 */
export function getCount(principal: string): number {
  const key = counterKey(principal, utcDateString());
  return counts.get(key) ?? 0;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function nextMidnightUtc(): string {
  const d = new Date();
  d.setUTCHours(24, 0, 0, 0);
  return d.toISOString();
}
