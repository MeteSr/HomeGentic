import { useState, useEffect, useCallback } from "react";
import { quoteService, type QuoteRequest } from "@/services/quote";

export interface QuoteSummary {
  quoteRequests: QuoteRequest[];
  bidCountMap: Record<string, number>;
  reload(): Promise<void>;
}

export function useQuoteSummary(): QuoteSummary {
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequest[]>([]);
  const [bidCountMap, setBidCountMap] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const reqs = await quoteService.getRequests();
      setQuoteRequests(reqs);
      if (reqs.length > 0) {
        quoteService.getBidCountMap(reqs.map((r) => r.id)).then(setBidCountMap).catch((e) => console.error("[useQuoteSummary] bid count load failed:", e));
      }
    } catch { /* canister not deployed */ }
  }, []);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { quoteRequests, bidCountMap, reload: load };
}
