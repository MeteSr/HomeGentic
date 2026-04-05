/**
 * 15.3.4 — Canister event → push relay
 *
 * Polls ICP canisters every POLL_INTERVAL_MS for actionable events and
 * dispatches push notifications via the dispatcher.
 *
 * Two event types for V1:
 *   • new_lead     — new quote request matching a contractor's specialties
 *   • job_signed   — homeowner signed a job, contractor can pick up payment
 *
 * Real canister calls are wired in once the mobile HTTP agent is tested end-to-end.
 * Until then, stubs return [] so the poller runs safely in dev without a replica.
 */
import { dispatchToUser } from "./dispatcher";
import type { NotificationEvent } from "./types";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 30_000;

// ── Canister stubs ────────────────────────────────────────────────────────────
// TODO: replace with real `@dfinity/agent` calls to the quote/job canisters.

async function fetchNewLeadEvents(): Promise<NotificationEvent[]> {
  // query canister: quote.getUnnotifiedRequests()
  // returns { requestId, serviceType, zipCode, contractorPrincipal }[]
  return [];
}

async function fetchJobSignedEvents(): Promise<NotificationEvent[]> {
  // query canister: job.getRecentlySignedJobs(since: lastPollAt)
  // returns { jobId, contractorPrincipal, serviceType }[]
  return [];
}

// ── Poll loop ─────────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  try {
    const events: NotificationEvent[] = [
      ...(await fetchNewLeadEvents()),
      ...(await fetchJobSignedEvents()),
    ];

    for (const event of events) {
      await dispatchToUser(event.principal, event.payload);
    }
  } catch (err) {
    console.error("[poller] error during poll:", err);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startPoller(): void {
  if (intervalHandle) return; // already running
  console.log(`[poller] starting — interval ${POLL_INTERVAL_MS}ms`);
  intervalHandle = setInterval(poll, POLL_INTERVAL_MS);
}

export function stopPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
