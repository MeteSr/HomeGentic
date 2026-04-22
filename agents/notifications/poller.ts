/**
 * 15.3.4 — Canister event → push relay
 *
 * Polls ICP canisters every POLL_INTERVAL_MS for actionable events and
 * dispatches push notifications via the dispatcher.
 *
 * Event types:
 *   • new_lead        — new quote request matching a contractor's specialties (15.5.4)
 *   • job_signed      — homeowner signed a job, contractor can pick up payment
 *   • score_change    — homeowner's HomeGentic Score changed by ≥5 points (15.4.5)
 *   • job_pending_sig — contractor marked a job complete; homeowner must sign (15.4.6)
 *   • bid_accepted    — homeowner accepted contractor's bid (15.5.5)
 *   • bid_declined    — homeowner chose another contractor (15.5.5)
 *
 * Real canister calls are wired in once the mobile HTTP agent is tested end-to-end.
 * Until then, stubs return [] so the poller runs safely in dev without a replica.
 */
import { dispatchToUser } from "./dispatcher";
import type { NotificationEvent } from "./types";

export type EventFetcher = () => Promise<NotificationEvent[]>;

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 30_000;

// ── Canister stubs ────────────────────────────────────────────────────────────
// Canister calls are wired here once the notification agent gains its own
// authenticated HttpAgent. Each stub documents the canister method it will call.

// 15.5.4 — contractor: new quote request matching their specialties
export const fetchNewLeadInTradesEvents: EventFetcher = async () => {
  // query canister: quote.getUnnotifiedRequests()
  // returns { requestId, serviceType, zipCode, contractorPrincipal }[]
  return [];
};

const defaultFetchJobSignedEvents: EventFetcher = async () => {
  // query canister: job.getRecentlySignedJobs(since: lastPollAt)
  // returns { jobId, contractorPrincipal, serviceType }[]
  return [];
};

// 15.5.5 — contractor: bid accepted or not selected by homeowner
export const fetchBidOutcomeEvents: EventFetcher = async () => {
  // query canister: quote.getBidOutcomesSince(lastPollAt)
  // returns { quoteId, contractorPrincipal, jobId, outcome: "accepted" | "declined" }[]
  return [];
};

// 15.4.5 — homeowner score change ≥5 points
export const fetchScoreChangeEvents: EventFetcher = async () => {
  // query canister: property.getScoreChangesSince(lastPollAt, minDelta: 5)
  // returns { propertyId, homeownerPrincipal, oldScore, newScore }[]
  return [];
};

// 15.4.6 — contractor marked job complete, homeowner signature pending
export const fetchJobPendingSignatureEvents: EventFetcher = async () => {
  // query canister: job.getJobsAwaitingHomeownerSignature(since: lastPollAt)
  // returns { jobId, homeownerPrincipal, serviceType }[]
  return [];
};

// ── Poll loop ─────────────────────────────────────────────────────────────────

export async function pollOnce(
  fetchers: EventFetcher[] = [
    fetchNewLeadInTradesEvents,
    defaultFetchJobSignedEvents,
    fetchScoreChangeEvents,
    fetchJobPendingSignatureEvents,
    fetchBidOutcomeEvents,
  ]
): Promise<void> {
  const results = await Promise.all(fetchers.map((f) => f()));
  const events: NotificationEvent[] = results.flat();

  for (const event of events) {
    await dispatchToUser(event.principal, event.payload);
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startPoller(): void {
  if (intervalHandle) return; // already running
  console.log(`[poller] starting — interval ${POLL_INTERVAL_MS}ms`);
  intervalHandle = setInterval(() => {
    pollOnce().catch((err) => console.error("[poller] error during poll:", err));
  }, POLL_INTERVAL_MS);
}

export function stopPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
