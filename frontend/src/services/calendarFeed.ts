/**
 * The owner's private calendar subscribe link (#717, step 2).
 *
 * The job canister keeps a token per owner and the events the app last
 * published for it. The voice Worker serves them at
 * <VITE_VOICE_AGENT_URL>/calendar/<token>.ics, which calendar apps refresh on
 * their own schedule. The app republishes when the owner opens Maintenance
 * and the events have changed (feedVersion), so the feed is as fresh as the
 * owner's last visit.
 *
 * E2E: window.__e2e_calendar = { token?, version?, events? } replaces the canister.
 */
import { lazyActor } from "./lazyActor";
import { idlFactory } from "@homegentic/shared/declarations/job";
import type { _SERVICE as JobCanister } from "@homegentic/shared/types/job";
import type * as JobTypes from "@homegentic/shared/types/job";
import type { IcsEvent } from "@homegentic/shared/ics";
import { canisterError } from "./candid";
import { collectCalendarEvents, feedVersion } from "./calendarEvents";
import { propertyService } from "./property";
import { jobService } from "./job";
import { recurringService, type RecurringService, type VisitLog } from "./recurringService";
import { systemAgesService } from "./systemAges";

const JOB_CANISTER_ID = (process.env as any).JOB_CANISTER_ID || "";
const VOICE_AGENT_URL: string = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:8787";

export const CALENDAR_FEED_COPY =
  "Add your home's dates to Google Calendar, Apple Calendar or Outlook: maintenance tasks, warranty end dates and " +
  "recurring service visits. Anyone with the link can see those dates, so share it only with people you trust. " +
  "Your calendar app checks for changes on its own schedule; the dates update each time you open Maintenance here.";

export interface CalendarFeedStatus {
  token: string;
  version: string;
  eventCount: number;
  updatedAt: number; // ms, 0 until first published
}

interface E2eCalendar {
  token?: string;
  version?: string;
  events?: IcsEvent[];
  updatedAt?: number;
}

function e2e(): E2eCalendar | null {
  return typeof window !== "undefined" ? ((window as any).__e2e_calendar ?? null) : null;
}

function unwrap<T>(r: { ok: T } | { err: JobTypes.Error }): T {
  if ("ok" in r) return r.ok;
  throw canisterError(r.err);
}

const toWire = (e: IcsEvent): JobTypes.CalendarEvent => ({
  uid: e.uid,
  date: e.date,
  title: e.title,
  description: e.description ?? "",
  rrule: e.rrule ?? "",
});

function createCalendarFeedService() {
  const getActor = lazyActor<JobCanister>(idlFactory, JOB_CANISTER_ID);
  const base = VOICE_AGENT_URL.replace(/\/+$/, "");

  return {
    /** The link only works where the job canister is deployed. */
    available(): boolean {
      return !!e2e() || !!JOB_CANISTER_ID;
    },

    feedUrl(token: string): string {
      return `${base}/calendar/${token}.ics`;
    },

    /** The same link with webcal://, which opens the calendar app's subscribe dialog. */
    webcalUrl(token: string): string {
      return this.feedUrl(token).replace(/^https?:\/\//, "webcal://");
    },

    async getStatus(): Promise<CalendarFeedStatus | null> {
      const m = e2e();
      if (m)
        return m.token
          ? { token: m.token, version: m.version ?? "", eventCount: m.events?.length ?? 0, updatedAt: m.updatedAt ?? 0 }
          : null;
      const [s] = await (await getActor()).getMyCalendarFeed();
      return s
        ? {
            token: s.token,
            version: s.version,
            eventCount: Number(s.eventCount),
            updatedAt: Number(s.updatedAt) / 1_000_000,
          }
        : null;
    },

    /** Turns the link on (or returns the existing one's token). */
    async enable(): Promise<string> {
      const m = e2e();
      if (m) {
        m.token ??= "c".repeat(32);
        return m.token;
      }
      return unwrap(await (await getActor()).enableMyCalendarFeed());
    },

    /** A new link; the old one stops working. */
    async reset(): Promise<string> {
      const m = e2e();
      if (m) {
        m.token = "d".repeat(32);
        return m.token;
      }
      return unwrap(await (await getActor()).resetMyCalendarFeed());
    },

    /** Turns the link off and deletes the published dates. */
    async disable(): Promise<void> {
      const m = e2e();
      if (m) {
        delete m.token;
        delete m.events;
        delete m.version;
        return;
      }
      unwrap(await (await getActor()).disableMyCalendarFeed());
    },

    async publish(version: string, events: IcsEvent[]): Promise<number> {
      const m = e2e();
      if (m) {
        m.version = version;
        m.events = events;
        m.updatedAt = Date.now();
        return events.length;
      }
      return Number(unwrap(await (await getActor()).publishMyCalendarEvents(version, events.map(toWire))));
    },

    /** Publish `events` when the link is on and they differ from what was last published. */
    async sync(events: IcsEvent[], status: CalendarFeedStatus | null): Promise<"off" | "unchanged" | "published"> {
      if (!status) return "off";
      const version = feedVersion(events);
      if (status.version === version) return "unchanged";
      await this.publish(version, events);
      return "published";
    },
  };
}

export const calendarFeedService = createCalendarFeedService();

/** Every dated item across the owner's homes, as the feed should hold them. */
export async function collectMyCalendarEvents(now: Date = new Date()): Promise<IcsEvent[]> {
  const [properties, jobs] = await Promise.all([propertyService.getMyProperties(), jobService.getAll()]);
  const ids = properties.map((p) => String(p.id));
  const { services, visitLogs } = await recurringService.getScheduleForProperties(ids).catch(() => ({
    services: [] as RecurringService[],
    visitLogs: {} as Record<string, VisitLog[]>,
  }));
  const recurring: Record<string, { service: RecurringService; visits: VisitLog[] }[]> = {};
  for (const s of services) (recurring[s.propertyId] ??= []).push({ service: s, visits: visitLogs[s.id] ?? [] });
  return collectCalendarEvents({ properties, jobs, recurring, systemAges: (pid) => systemAgesService.get(pid), now });
}
