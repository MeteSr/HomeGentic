/**
 * Offline Write Queue (Issue #53)
 *
 * Persists write operations when the device is offline and replays them on
 * reconnect. Storage and network are injectable adapters so the core logic is
 * testable; the app uses AsyncStorage and NetInfo.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   import { offlineQueue } from "./offlineQueue";
 *
 *   // Enqueue a write when offline (LogJobScreen does this for jobs):
 *   await offlineQueue.enqueue({ type: "createJob", payload: { ... } });
 *
 *   // The handler is registered per signed-in user (context/AppData.tsx):
 *   offlineQueue.setScope(principal);
 *   offlineQueue.registerHandler(async (op) => { ... });
 *
 * ── Retry schedule ───────────────────────────────────────────────────────────
 *   Attempt 0 → wait 5 s
 *   Attempt 1 → wait 30 s
 *   Attempt 2 → wait 2 min
 *   Attempt 3 → wait 10 min
 *   Attempt 4+ → mark as "failed" (manual retry or discard)
 *   Items not sent within 24 h are marked "failed" too, so nothing the user
 *   saved disappears without them seeing it on the Offline queue screen.
 *
 * ── Scope ────────────────────────────────────────────────────────────────────
 *   setScope(principal) keeps each signed-in user's queue separate, so one
 *   person's queued writes are never sent under another's identity.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";

export const BACKOFF_SCHEDULE_MS = [5_000, 30_000, 120_000, 600_000] as const;
const MAX_AGE_MS     = 24 * 60 * 60 * 1_000;
const STORAGE_KEY    = "homegentic_offline_queue";

// ─── Public types ─────────────────────────────────────────────────────────────

export type OperationType = "addBill" | "createJob" | "uploadPhoto";

export interface QueuedOperation {
  id:          string;
  type:        OperationType;
  payload:     unknown;
  enqueuedAt:  number;   // Date.now() ms
  retryCount:  number;
  nextRetryAt: number;   // 0 = eligible immediately
  status:      "pending" | "failed";
  failReason?: string;
}

export interface EnqueueInput {
  type:    OperationType;
  payload: unknown;
}

export type OperationHandler = (op: QueuedOperation) => Promise<void>;

// ─── Adapter interfaces ───────────────────────────────────────────────────────

export interface StorageAdapter {
  getItem(key: string):                    Promise<string | null>;
  setItem(key: string, value: string):     Promise<void>;
  removeItem(key: string):                 Promise<void>;
}

export interface NetworkAdapter {
  isConnected():                                            Promise<boolean>;
  onConnectivityChange(handler: (connected: boolean) => void): () => void;
}

// ─── Queue factory ────────────────────────────────────────────────────────────

export function createOfflineQueue(
  storage: StorageAdapter,
  network: NetworkAdapter,
  defaultHandler?: OperationHandler,
) {
  let _handler: OperationHandler | undefined = defaultHandler;
  let _scope: string | null = null;
  let _flushing: Promise<void> | null = null;
  const _listeners = new Set<() => void>();

  const key = () => (_scope ? `${STORAGE_KEY}:${_scope}` : STORAGE_KEY);

  // ── Storage helpers ─────────────────────────────────────────────────────────

  async function load(): Promise<QueuedOperation[]> {
    try {
      const raw = await storage.getItem(key());
      if (!raw) return [];
      return JSON.parse(raw) as QueuedOperation[];
    } catch {
      return [];
    }
  }

  async function save(items: QueuedOperation[]): Promise<void> {
    if (items.length === 0) {
      await storage.removeItem(key());
    } else {
      await storage.setItem(key(), JSON.stringify(items));
    }
    _listeners.forEach((l) => l());
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async function enqueue(input: EnqueueInput): Promise<QueuedOperation> {
    const id = `oq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const op: QueuedOperation = {
      id,
      type:        input.type,
      payload:     input.payload,
      enqueuedAt:  Date.now(),
      retryCount:  0,
      nextRetryAt: 0,
      status:      "pending",
    };
    const items = await load();
    items.push(op);
    await save(items);
    return op;
  }

  async function getQueue(): Promise<QueuedOperation[]> {
    return load();
  }

  /** Sends what's due. Concurrent calls share one run, so nothing is sent twice. */
  function flush(handler?: OperationHandler): Promise<void> {
    if (_flushing) return _flushing;
    _flushing = doFlush(handler).finally(() => { _flushing = null; });
    return _flushing;
  }

  async function doFlush(handler?: OperationHandler): Promise<void> {
    const h = handler ?? _handler;
    if (!h) return;

    const connected = await network.isConnected();
    if (!connected) return;

    const now = Date.now();
    const scope = _scope;
    const items = await load();
    const updated: QueuedOperation[] = [];

    for (const op of items) {
      // Too old to send unattended: park it for the user to retry or discard
      if (op.status === "pending" && now - op.enqueuedAt >= MAX_AGE_MS) {
        updated.push({ ...op, status: "failed", failReason: op.failReason ?? "Not sent within a day. Retry to send it now." });
        continue;
      }
      // Skip items in backoff window
      if (op.nextRetryAt > now) {
        updated.push(op);
        continue;
      }
      // Skip already-failed items (manual retry required)
      if (op.status === "failed") {
        updated.push(op);
        continue;
      }

      try {
        await h(op);
        // Success — drop from queue
      } catch (err: unknown) {
        const nextRetryIndex = op.retryCount; // 0-based index into BACKOFF_SCHEDULE_MS
        if (nextRetryIndex >= BACKOFF_SCHEDULE_MS.length) {
          updated.push({
            ...op,
            status:     "failed",
            failReason: err instanceof Error ? err.message : String(err),
          });
        } else {
          updated.push({
            ...op,
            retryCount:  op.retryCount + 1,
            nextRetryAt: now + BACKOFF_SCHEDULE_MS[nextRetryIndex],
            failReason:  err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // The user signed out mid-flush: leave the queue for its owner.
    if (scope !== _scope) return;
    // Keep anything enqueued or changed while this run was sending.
    const seen = new Set(items.map((op) => op.id));
    const latest = await load();
    const latestIds = new Set(latest.map((op) => op.id));
    await save([
      ...updated.filter((op) => latestIds.has(op.id)),
      ...latest.filter((op) => !seen.has(op.id)),
    ]);
  }

  async function discard(id: string): Promise<void> {
    const items = await load();
    await save(items.filter((op) => op.id !== id));
  }

  async function retry(id: string): Promise<void> {
    const items = await load();
    const updated = items.map((op) => {
      if (op.id !== id) return op;
      const again = { ...op, nextRetryAt: 0, status: "pending" as const, failReason: undefined };
      // Retrying a failed item gives it a fresh day and a fresh set of attempts.
      return op.status === "failed" ? { ...again, retryCount: 0, enqueuedAt: Date.now() } : again;
    });
    await save(updated);
  }

  /** Pass null to stop handling (on sign-out). */
  function registerHandler(h: OperationHandler | null): void {
    _handler = h ?? undefined;
  }

  /** Switches to the signed-in user's queue (null when signed out). */
  function setScope(scope: string | null): void {
    _scope = scope;
    _listeners.forEach((l) => l());
  }

  /** Called whenever the queue changes; returns an unsubscribe function. */
  function subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }

  // Listen for reconnect and auto-flush
  network.onConnectivityChange((connected) => {
    if (connected && _handler) {
      flush().catch(() => {});
    }
  });

  return { enqueue, getQueue, flush, discard, retry, registerHandler, setScope, subscribe, isConnected: () => network.isConnected() };
}

// ─── Default singleton (AsyncStorage + NetInfo) ──────────────────────────────

const _storage: StorageAdapter = {
  getItem:    (k) => AsyncStorage.getItem(k),
  setItem:    (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};

/** Connected and the internet is reachable (unknown reachability counts as online). */
export function isOnlineState(s: { isConnected: boolean | null; isInternetReachable: boolean | null }): boolean {
  return s.isConnected !== false && s.isInternetReachable !== false;
}

const _network: NetworkAdapter = {
  isConnected: async () => isOnlineState(await NetInfo.fetch()),
  onConnectivityChange: (h) => NetInfo.addEventListener((s) => h(isOnlineState(s))),
};

export const offlineQueue = createOfflineQueue(_storage, _network);
