/**
 * What goes on the owner's calendar (#717): maintenance tasks, warranty end
 * dates and recurring-service visits, as all-day IcsEvents.
 *
 * Pure builders shared by the "Add to calendar" downloads and the private
 * subscribe feed (services/calendarFeed.ts). Dates match what the app shows:
 * maintenanceTaskDueDate is the Maintenance page's own scheduling rule.
 */
import type { IcsEvent } from "@homegentic/shared/ics";
import { rruleForFrequency } from "@homegentic/shared/ics";
import { maintenanceService, type AnnualTask } from "./maintenance";
import type { Job } from "./job";
import type { Property } from "./property";
import type { RecurringService, VisitLog } from "./recurringService";
import { SERVICE_TYPE_LABELS } from "./recurringService";
import type { SystemAges } from "./systemAges";
import { warrantyExpiry } from "./warranty";

/** The job canister keeps at most this many events per feed. */
export const MAX_FEED_EVENTS = 100;

const DAY_MS = 86_400_000;

/** Days between visits per frequency (the Maintenance page's FREQ_DAYS). */
export const VISIT_FREQ_DAYS: Record<string, number> = {
  Weekly: 7,
  BiWeekly: 14,
  Monthly: 30,
  Quarterly: 90,
  SemiAnnually: 180,
  Annually: 365,
};

const SEASON_MONTHS: Record<string, number[]> = {
  Spring: [2, 3, 4],
  Summer: [5, 6, 7],
  Fall: [8, 9, 10],
  Winter: [11, 0, 1],
};

/** When an annual task is next due, as the Maintenance page lists it. */
export function maintenanceTaskDueDate(task: AnnualTask, index: number, now: Date = new Date()): Date {
  const currentMonth = now.getMonth();
  if (task.season && SEASON_MONTHS[task.season]) {
    const seasonMonths = SEASON_MONTHS[task.season];
    const nextMonth = seasonMonths.find((m) => m >= currentMonth) ?? seasonMonths[0];
    const d = new Date(now.getFullYear(), nextMonth, 15);
    if (d < now) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  const freqMonths: Record<string, number> = { Quarterly: 3, "Semi-annually": 6, Annually: 12 };
  const interval = Object.entries(freqMonths).find(([k]) => task.frequency?.includes(k.split("-")[0]))?.[1] ?? 12;
  const d = new Date(now.getFullYear(), (currentMonth + interval + index) % 12, 10);
  if (d < now) d.setMonth(d.getMonth() + interval);
  return d;
}

const pad = (n: number) => String(n).padStart(2, "0");
const localIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const utcIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);

export function maintenanceTaskEvent(propertyId: string, address: string, task: AnnualTask, due: Date): IcsEvent {
  return {
    uid: `maint-${propertyId}-${slug(task.task)}`,
    date: localIso(due),
    title: task.task,
    description: [
      address,
      `${task.frequency}${task.diyViable ? " · DIY-friendly" : ""}`,
      `Typical cost ${task.estimatedCost} (estimate, not a quote).`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

/** The day a job's warranty ends, or null when it has none. */
export function warrantyEndEvent(job: Job, address = ""): IcsEvent | null {
  if (!job.warrantyMonths || job.warrantyMonths <= 0) return null;
  const who = job.isDiy ? "" : (job.contractorName ?? "");
  return {
    uid: `warranty-${job.id}`,
    date: utcIso(warrantyExpiry(job)),
    title: `Warranty ends: ${job.serviceType}${who ? ` (${who})` : ""}`,
    description: [address, `Job dated ${job.date}, ${job.warrantyMonths}-month warranty.`].filter(Boolean).join("\n"),
  };
}

/** The next visit of an active service, repeating at its frequency. Null when paused or cancelled. */
export function recurringVisitEvent(service: RecurringService, visits: VisitLog[], address = ""): IcsEvent | null {
  if (service.status !== "Active") return null;
  const last = visits.reduce((max, v) => (v.visitDate > max ? v.visitDate : max), "") || service.startDate;
  const lastMs = new Date(last).getTime();
  if (Number.isNaN(lastMs)) return null;
  const next = lastMs + (VISIT_FREQ_DAYS[service.frequency] ?? 30) * DAY_MS;
  const name = SERVICE_TYPE_LABELS[service.serviceType] ?? service.serviceType;
  return {
    uid: `recurring-${service.id}`,
    date: utcIso(next),
    title: `${name} visit${service.providerName ? ` (${service.providerName})` : ""}`,
    description: [address, service.providerPhone ? `Call ${service.providerPhone}` : ""].filter(Boolean).join("\n"),
    rrule: rruleForFrequency(service.frequency, service.contractEndDate) ?? undefined,
  };
}

export interface CalendarSources {
  properties: Property[];
  jobs: Job[];
  /** propertyId → its recurring services with their visit logs. */
  recurring: Record<string, { service: RecurringService; visits: VisitLog[] }[]>;
  systemAges: (propertyId: string) => SystemAges;
  now?: Date;
}

/** Everything for the subscribe feed: every home, soonest first, at most MAX_FEED_EVENTS. */
export function collectCalendarEvents(src: CalendarSources): IcsEvent[] {
  const now = src.now ?? new Date();
  const addressOf = new Map(src.properties.map((p) => [String(p.id), p.address]));
  const events: IcsEvent[] = [];

  for (const p of src.properties) {
    const pid = String(p.id);
    const report = maintenanceService.predict(
      Number(p.yearBuilt),
      src.jobs.filter((j) => j.propertyId === pid),
      src.systemAges(pid),
      String(p.state),
    );
    report.annualTasks.forEach((t, i) =>
      events.push(maintenanceTaskEvent(pid, p.address, t, maintenanceTaskDueDate(t, i, now))),
    );
    for (const { service, visits } of src.recurring[pid] ?? []) {
      const e = recurringVisitEvent(service, visits, p.address);
      if (e) events.push(e);
    }
  }
  for (const j of src.jobs) {
    if (j.warrantyMonths && warrantyExpiry(j) < now.getTime()) continue;
    const e = warrantyEndEvent(j, addressOf.get(j.propertyId) ?? "");
    if (e) events.push(e);
  }

  const seen = new Set<string>();
  return events
    .filter((e) => (seen.has(e.uid) ? false : (seen.add(e.uid), true)))
    .sort((a, b) => a.date.localeCompare(b.date) || a.uid.localeCompare(b.uid))
    .slice(0, MAX_FEED_EVENTS);
}

/** A short fingerprint of the events (FNV-1a), so the app republishes only on change. */
export function feedVersion(events: IcsEvent[]): string {
  const text = JSON.stringify(events.map((e) => [e.uid, e.date, e.title, e.description ?? "", e.rrule ?? ""]));
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
