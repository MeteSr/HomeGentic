/**
 * Fetches the count of contractor-submitted job proposals awaiting homeowner
 * approval. On mount, if any are found:
 *   1. Returns the count for in-app badging (Chat tab)
 *   2. Schedules a local expo-notifications alert so the homeowner sees a
 *      system notification even if the app is backgrounded
 *
 * The local notification is only fired once per session (tracked via ref) to
 * avoid spamming on every re-render.
 */

import { useState, useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import { getPendingProposals } from "../services/jobService";

export function usePendingProposals(): number {
  const [count, setCount]   = useState(0);
  const notifiedRef         = useRef(false);

  useEffect(() => {
    let cancelled = false;

    getPendingProposals()
      .then((proposals) => {
        if (cancelled) return;
        setCount(proposals.length);

        if (proposals.length > 0 && !notifiedRef.current) {
          notifiedRef.current = true;
          const n = proposals.length;
          Notifications.scheduleNotificationAsync({
            content: {
              title: n === 1
                ? "Job proposal awaiting your review"
                : `${n} job proposals awaiting your review`,
              body: n === 1
                ? `${proposals[0].contractorName ?? "A contractor"} submitted a ${proposals[0].serviceType} job for your approval.`
                : `${n} contractors have submitted job proposals. Tap to review them.`,
              data: { route: "dashboard" },
            },
            trigger: null,   // show immediately
          }).catch(() => {/* permission not granted — silent fail */});
        }
      })
      .catch(() => {/* canister not deployed — silent fail */});

    return () => { cancelled = true; };
  }, []);

  return count;
}
