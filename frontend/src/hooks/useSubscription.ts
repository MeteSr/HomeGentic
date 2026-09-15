import { useState, useEffect } from "react";
import { paymentService, type PlanTier } from "@/services/payment";

export interface Subscription {
  userTier: PlanTier;
  /** Unix-ms renewal timestamp, or null if unknown/not applicable (e.g. Free). */
  expiresAt: number | null;
  /** Unix-ms cancellation timestamp if the plan is set to lapse at renewal, else null. */
  cancelledAt: number | null;
}

export function useSubscription(): Subscription {
  const [userTier, setUserTier] = useState<PlanTier>("Basic");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [cancelledAt, setCancelledAt] = useState<number | null>(null);

  useEffect(() => {
    paymentService.getMySubscription()
      .then((s) => { setUserTier(s.tier); setExpiresAt(s.expiresAt); setCancelledAt(s.cancelledAt); })
      .catch((e) => console.error("[useSubscription] failed to load subscription:", e));
  }, []);

  return { userTier, expiresAt, cancelledAt };
}
