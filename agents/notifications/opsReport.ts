/**
 * Relay failures the user never sees (an email Resend refused, an SMS Twilio
 * refused, an outbox the relay can't read) are counted here and sent to the
 * monitoring canister's recordServiceError, which the hourly Cycle Watchdog
 * reads (scripts/check-ops-alerts.py) and emails about.
 *
 * Per source/message pair: sent at once the first time, then at most once a
 * minute with the count since; at most 100 pairs are held. `message` must be
 * a fixed description plus codes, never an address, phone number or body.
 */
import { recordServiceError } from "./icp";

interface Agg {
  count: number;
  firstSeen: number;
  sentAt: number;
}

const aggs = new Map<string, Agg>();
const MAX_FINGERPRINTS = 100;
const RESEND_AFTER_MS = 60_000;

type Sender = typeof recordServiceError;
let sender: Sender = recordServiceError;
/** Tests only. */
export function _setSender(fn: Sender): void {
  sender = fn;
}
export function _reset(): void {
  aggs.clear();
}

/** Short, PII-free description of an error: its HTTP status if it has one. */
export function errorCode(err: unknown): string {
  const status = (err as { status?: unknown })?.status;
  if (typeof status === "number") return `HTTP ${status}`;
  const m = err instanceof Error ? /\b([1-5][0-9]{2})\b/.exec(err.message) : null;
  return m ? `HTTP ${m[1]}` : "error";
}

export async function reportFailure(source: string, message: string, now: number = Date.now()): Promise<void> {
  const msg = message.slice(0, 120);
  const fingerprint = `notifications-relay:${source}:${msg}`.slice(0, 64);
  let agg = aggs.get(fingerprint);
  if (!agg) {
    if (aggs.size >= MAX_FINGERPRINTS) return;
    agg = { count: 0, firstSeen: now, sentAt: 0 };
    aggs.set(fingerprint, agg);
  }
  agg.count += 1;
  if (agg.sentAt !== 0 && now - agg.sentAt < RESEND_AFTER_MS) return;
  const count = agg.count;
  agg.count = 0;
  agg.sentAt = now;
  try {
    await sender({
      fingerprint,
      message: msg,
      errorType: `notifications-relay:${source}`,
      count,
      firstSeenMs: agg.firstSeen,
      lastSeenMs: now,
    });
  } catch (err) {
    console.error("[ops] could not report failure:", err instanceof Error ? err.message : err);
  }
}
