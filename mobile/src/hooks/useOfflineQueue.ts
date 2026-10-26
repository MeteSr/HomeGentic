/**
 * useOfflineQueue
 *
 * The signed-in user's offline write queue (services/offlineQueue.ts):
 * `items`, `pendingCount`, `failedCount`, `retry`, `discard`, `refresh`,
 * kept current as the queue changes. `useIsOnline` tracks connectivity.
 */

import { useState, useEffect, useCallback } from "react";
import NetInfo from "@react-native-community/netinfo";
import { offlineQueue, isOnlineState, type QueuedOperation } from "../services/offlineQueue";

/** Whether the device is online, from NetInfo (true until it reports otherwise). */
export function useIsOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((s) => setOnline(isOnlineState(s))), []);
  return online;
}

export function useOfflineQueue() {
  const [items, setItems] = useState<QueuedOperation[]>([]);
  const isOnline = useIsOnline();

  const refresh = useCallback(async () => {
    setItems(await offlineQueue.getQueue());
  }, []);

  useEffect(() => {
    let live = true;
    const load = () => { offlineQueue.getQueue().then((q) => { if (live) setItems(q); }); };
    load();
    const unsubscribe = offlineQueue.subscribe(load);
    return () => { live = false; unsubscribe(); };
  }, []);

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const failedCount  = items.filter((i) => i.status === "failed").length;

  async function retry(id: string) {
    await offlineQueue.retry(id);
    await offlineQueue.flush().catch(() => {});
  }

  async function discard(id: string) {
    await offlineQueue.discard(id);
  }

  return { items, isOnline, pendingCount, failedCount, retry, discard, refresh };
}
