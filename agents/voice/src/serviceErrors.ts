/**
 * Server-side failures the user may never see (a Stripe webhook the Worker
 * could not apply, an email Resend refused, a 5xx from a route) are counted
 * here and sent to the monitoring canister's recordServiceError. The Cycle
 * Watchdog reads them every hour (scripts/check-ops-alerts.py) and emails
 * OPS_ALERT_EMAIL about any it hasn't seen resolved.
 *
 * Bounded like the frontend error aggregation: per isolate, a source/message
 * pair is sent at once the first time and then at most once a minute with
 * its count, and at most MAX_FINGERPRINTS distinct pairs are held, so a flood
 * of failing requests can't turn into a flood of canister update calls.
 *
 * `message` must not contain personal data: pass a fixed description plus
 * codes (event type, HTTP status, route), never an email address or body.
 */
import { recordServiceError } from "../monitoringCanister";

interface Agg {
  source: string;
  message: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
  sentAt: number;
}

const aggs = new Map<string, Agg>();
const MAX_FINGERPRINTS = 100;
const RESEND_AFTER_MS = 60_000;

let sender: typeof recordServiceError = recordServiceError;
/** Tests only. */
export function _setSender(fn: typeof recordServiceError): void {
  sender = fn;
}
export function _reset(): void {
  aggs.clear();
}

/** Collapse ids out of a path so one failing route is one fingerprint. */
export function routeKey(path: string): string {
  return path
    .split("/")
    .map((seg) => (/^[0-9]+$/.test(seg) || (/[0-9]/.test(seg) && seg.length >= 12) || seg.length > 40 ? ":id" : seg))
    .join("/")
    .slice(0, 80);
}

export async function reportServiceError(source: string, message: string): Promise<void> {
  const msg = message.slice(0, 120);
  const fingerprint = `${source}:${msg}`.slice(0, 64);
  const now = Date.now();
  let agg = aggs.get(fingerprint);
  if (!agg) {
    if (aggs.size >= MAX_FINGERPRINTS) return;
    agg = { source, message: msg, count: 0, firstSeen: now, lastSeen: now, sentAt: 0 };
    aggs.set(fingerprint, agg);
  }
  agg.count += 1;
  agg.lastSeen = now;
  if (agg.sentAt !== 0 && now - agg.sentAt < RESEND_AFTER_MS) return;
  const count = agg.count;
  agg.count = 0;
  agg.sentAt = now;
  try {
    await sender({
      fingerprint,
      message: msg,
      errorType: source,
      count,
      firstSeen: BigInt(agg.firstSeen) * 1_000_000n,
      lastSeen: BigInt(now) * 1_000_000n,
      tierCounts: [],
    });
  } catch {
    // Best effort: the failure itself is already in the Worker log.
  }
}
