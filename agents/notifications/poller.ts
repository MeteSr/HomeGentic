/**
 * Canister outbox → push relay.
 *
 * Every POLL_INTERVAL_MS the relay reads the job and quote canisters' push
 * outboxes (backend/shared/Notify.mo) after its saved cursor, turns each
 * event into pushes (events.ts), sends them, and advances the cursor one
 * event at a time — so a crash or a failed canister lookup resumes at the
 * first unsent event rather than skipping it.
 *
 * Cursors persist with the rest of the relay's state (persist.ts):
 *   - no cursor yet (first run)      → start at the outbox's latest seq; history isn't replayed
 *   - latestSeq below the cursor     → the canister was reinstalled; start again from 0
 */
import * as icp from "./icp";
import { dispatchToUser } from "./dispatcher";
import { notificationsFor, type LeadLookups } from "./events";
import { loadSection, saveSection } from "./persist";
import type { ContractorInfo, NotificationEvent, OutboxPage, PushPayload, QuoteRequestInfo } from "./types";

const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 30_000;
const PAGE_SIZE = 200; // the canister's MAX_PAGE

/** Canisters with an outbox, by the env var holding each one's ID. */
const OUTBOX_CANISTERS = ["CANISTER_ID_JOB", "CANISTER_ID_QUOTE"];

export interface PollerDeps {
  readOutbox:      (canisterId: string, afterSeq: number) => Promise<OutboxPage>;
  getQuoteRequest: (requestId: string) => Promise<QuoteRequestInfo | null>;
  getContractors:  () => Promise<ContractorInfo[]>;
  dispatch:        (principal: string, payload: PushPayload) => Promise<void>;
}

const defaultDeps: PollerDeps = {
  readOutbox:      icp.readOutbox,
  getQuoteRequest: icp.getQuoteRequest,
  getContractors:  icp.getContractors,
  dispatch:        dispatchToUser,
};

const cursors: Record<string, number> = loadSection<Record<string, number>>("cursors", {});

function setCursor(canisterId: string, seq: number): void {
  cursors[canisterId] = seq;
  saveSection("cursors", cursors);
}

export function getCursor(canisterId: string): number | undefined {
  return cursors[canisterId];
}

/** Send everything new in one canister's outbox. Returns the number of pushes sent. */
export async function pollCanister(canisterId: string, deps: PollerDeps = defaultDeps): Promise<number> {
  const cursor = cursors[canisterId];
  let page = await deps.readOutbox(canisterId, cursor ?? 0);

  if (cursor === undefined) {
    setCursor(canisterId, page.latestSeq);
    return 0;
  }
  if (page.latestSeq < cursor) {
    console.warn(`[poller] ${canisterId} outbox is behind the cursor (${page.latestSeq} < ${cursor}); was it reinstalled? Restarting from 0.`);
    setCursor(canisterId, 0);
    page = await deps.readOutbox(canisterId, 0);
  }

  // Contractor profiles are only needed for new leads; fetch them at most once per poll.
  let contractors: Promise<ContractorInfo[]> | null = null;
  const lookups: LeadLookups = {
    getQuoteRequest: deps.getQuoteRequest,
    getContractors:  () => (contractors ??= deps.getContractors()),
  };

  let sent = 0;
  for (;;) {
    for (const event of page.events) {
      const pushes: NotificationEvent[] = await notificationsFor(event, lookups);
      for (const n of pushes) {
        await deps.dispatch(n.principal, n.payload);
        sent += 1;
      }
      setCursor(canisterId, event.seq);
    }
    if (page.events.length < PAGE_SIZE) return sent;
    page = await deps.readOutbox(canisterId, cursors[canisterId]);
  }
}

let polling = false;

/** One pass over every configured outbox. A failing canister doesn't stop the others. */
export async function pollOnce(deps: PollerDeps = defaultDeps): Promise<void> {
  if (polling) return; // the previous pass is still running
  polling = true;
  try {
    for (const envVar of OUTBOX_CANISTERS) {
      const canisterId = process.env[envVar];
      if (!canisterId) continue;
      try {
        const sent = await pollCanister(canisterId, deps);
        if (sent > 0) console.log(`[poller] ${envVar}: sent ${sent} push(es)`);
      } catch (err) {
        console.error(`[poller] ${envVar} (${canisterId}):`, err instanceof Error ? err.message : err);
      }
    }
  } finally {
    polling = false;
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startPoller(): void {
  if (intervalHandle) return; // already running
  const configured = OUTBOX_CANISTERS.filter((v) => process.env[v]);
  if (configured.length === 0) {
    console.warn("[poller] neither CANISTER_ID_JOB nor CANISTER_ID_QUOTE is set — not polling");
    return;
  }
  console.log(`[poller] polling ${configured.join(", ")} every ${POLL_INTERVAL_MS}ms`);
  void pollOnce();
  intervalHandle = setInterval(() => void pollOnce(), POLL_INTERVAL_MS);
}

export function stopPoller(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
