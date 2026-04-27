import { useState, useEffect } from "react";
import { paymentService, type PlanTier } from "@/services/payment";

export function useUserTier(): PlanTier {
  const [tier, setTier] = useState<PlanTier>("Basic");

  useEffect(() => {
    paymentService.getMySubscription().then((s) => setTier(s.tier)).catch((e) => console.error("[useUserTier] failed to load subscription:", e));
  }, []);

  return tier;
}
