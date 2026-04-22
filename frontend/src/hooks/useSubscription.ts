import { useState, useEffect } from "react";
import { paymentService, type PlanTier } from "@/services/payment";

export interface Subscription {
  userTier: PlanTier;
}

export function useSubscription(): Subscription {
  const [userTier, setUserTier] = useState<PlanTier>("Free");

  useEffect(() => {
    paymentService.getMySubscription()
      .then((s) => setUserTier(s.tier))
      .catch((e) => console.error("[useSubscription] failed to load subscription:", e));
  }, []);

  return { userTier };
}
