import { useEffect, useMemo, useState } from "react";
import type { Property } from "@/services/property";
import { jobService, type Job } from "@/services/job";
import { quoteService, type QuoteRequest } from "@/services/quote";
import { billService, type BillRecord } from "@/services/billService";
import { deriveEvents, type ActivityEvent } from "@/services/activityFeed";

export interface ActivityFeed {
  feedOpen:   boolean;
  feedLoaded: boolean;
  events:     ActivityEvent[];
  unread:     number;
  lastReadAt: number;
  openFeed:   () => void;
  closeFeed:  () => void;
}

/**
 * Same feed/unread logic Layout.tsx owns for its sidebar bell — factored out
 * so any page can render its own trigger + drawer without Layout's sidebar
 * (e.g. DashboardV3, which hides that sidebar).
 */
export function useActivityFeed(properties: Property[]): ActivityFeed {
  const [feedOpen, setFeedOpen]     = useState(false);
  const [feedJobs, setFeedJobs]     = useState<Job[]>([]);
  const [feedQuotes, setFeedQuotes] = useState<QuoteRequest[]>([]);
  const [feedBills, setFeedBills]   = useState<BillRecord[]>([]);
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [lastReadAt, setLastReadAt] = useState<number>(() =>
    parseInt(localStorage.getItem("homegentic_feed_read") ?? "0", 10)
  );

  useEffect(() => {
    if (!feedOpen || feedLoaded) return;
    const propertyIds = properties.map((p) => String(p.id));
    Promise.all([
      jobService.getAll().catch(() => [] as Job[]),
      quoteService.getRequests().catch(() => [] as QuoteRequest[]),
      Promise.all(
        propertyIds.map((pid) => billService.getBillsForProperty(pid).catch(() => [] as BillRecord[]))
      ).then((nested) => nested.flat()),
    ]).then(([jobs, quotes, bills]) => {
      setFeedJobs(jobs);
      setFeedQuotes(quotes);
      setFeedBills(bills);
    }).finally(() => setFeedLoaded(true));
  }, [feedOpen, feedLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = useMemo(() => deriveEvents(properties, feedJobs, feedQuotes, feedBills), [properties, feedJobs, feedQuotes, feedBills]);
  const unread = events.filter((e) => e.timestamp > lastReadAt).length;

  const openFeed = () => {
    setFeedOpen(true);
    const now = Date.now();
    setLastReadAt(now);
    localStorage.setItem("homegentic_feed_read", String(now));
  };

  return { feedOpen, feedLoaded, events, unread, lastReadAt, openFeed, closeFeed: () => setFeedOpen(false) };
}
