/**
 * GET /calendar/<token>.ics — the owner's private calendar feed (#717).
 *
 * Calendar apps fetch this on their own schedule and can't send an API key or
 * a session, so the 32-hex token in the path is the only credential. The job
 * canister holds the events the app published (getCalendarFeed); this writes
 * them as .ics with the same writer the web app's downloads use. Each IP gets
 * a bounded number of fetches an hour, and a malformed token never reaches
 * the canister.
 */
import { buildIcs } from "../../../packages/shared/src/ics";
import type { CalendarFeedEvent } from "./jobCanister";

export const CALENDAR_FEED_HOURLY_LIMIT = 60;
const TOKEN_PATH = /^\/calendar\/([0-9a-f]{32})\.ics$/;

export interface CalendarFeedDeps {
  /** job.getCalendarFeed; null for an unknown token; throws when unreachable. */
  lookup: (token: string) => Promise<{ events: CalendarFeedEvent[] } | null>;
  /** Count one hit against `key`; false once `limit` is reached. */
  allow: (key: string, limit: number, ttlSeconds: number) => Promise<boolean>;
  configured: boolean;
  now?: () => Date;
}

const textHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "X-Robots-Tag": "noindex",
  "Referrer-Policy": "no-referrer",
};

export async function handleCalendarFeed(
  request: Request,
  path: string,
  ip: string,
  deps: CalendarFeedDeps,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { ...textHeaders, Allow: "GET, HEAD" } });
  }
  const m = TOKEN_PATH.exec(path);
  if (!m) return new Response("Not found", { status: 404, headers: textHeaders });
  if (!(await deps.allow(`calendar:ip:${ip}`, CALENDAR_FEED_HOURLY_LIMIT, 3600))) {
    return new Response("Too many requests", { status: 429, headers: { ...textHeaders, "Retry-After": "3600" } });
  }
  if (!deps.configured) return new Response("Calendar feed unavailable", { status: 503, headers: textHeaders });
  let feed: { events: CalendarFeedEvent[] } | null;
  try {
    feed = await deps.lookup(m[1]);
  } catch {
    return new Response("Calendar feed unavailable", {
      status: 503,
      headers: { ...textHeaders, "Retry-After": "300" },
    });
  }
  if (!feed) return new Response("Not found", { status: 404, headers: textHeaders });
  const body = buildIcs(feed.events, { name: "HomeGentic", now: (deps.now ?? (() => new Date()))() });
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="homegentic.ics"',
      "Cache-Control": "private, max-age=3600",
      "X-Robots-Tag": "noindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
