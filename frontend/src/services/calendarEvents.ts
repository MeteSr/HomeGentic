/**
 * What goes on the owner's calendar (#717): maintenance tasks, warranty end
 * dates, recurring-service visits, insurance renewals (#711) and Florida
 * property-tax deadlines (#714), as all-day IcsEvents.
 *
 * Pure builders shared by the "Add to calendar" downloads and the private
 * subscribe feed (services/calendarFeed.ts). Dates match what the app shows:
 * maintenanceTaskDueDate is the Maintenance page's own scheduling rule.
 */
import type { IcsEvent } from "@homegentic/shared/ics";
import { isIcsDate, rruleForFrequency } from "@homegentic/shared/ics";
import {
  FLORIDA_TAX_CALENDAR,
  FLORIDA_TAX_SOURCES,
  isFloridaState,
  type TaxSource,
  type TaxYearStatus,
} from "@homegentic/shared/propertyTax";
import type { InsurancePolicy } from "./insurancePolicy";
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

/**
 * The policy's next renewal, or null once that date has passed. The policy
 * number stays out: anyone with the subscribe link can read the feed.
 */
export function insuranceRenewalEvent(
  propertyId: string,
  address: string,
  policy: InsurancePolicy | null,
  now: Date = new Date(),
): IcsEvent | null {
  if (!policy || !isIcsDate(policy.renewalDate) || policy.renewalDate < localIso(now)) return null;
  return {
    uid: `insurance-${propertyId}`,
    date: policy.renewalDate,
    title: `Home insurance renews${policy.carrier ? ` (${policy.carrier})` : ""}`,
    description: [address, "Check your coverage and premium before the policy renews."].filter(Boolean).join("\n"),
  };
}

const TAX_NOTE = "A reminder from the dates you keep in HomeGentic, not tax advice.";
const taxDescription = (address: string, text: string, source: TaxSource) =>
  [address, text, `${source.label}: ${source.url}`, TAX_NOTE].filter(Boolean).join("\n");

/**
 * Florida property-tax dates from today on (the same rules as the Home Pulse
 * reminders, without their reminder windows): the homestead exemption
 * deadline unless that year is marked or last year's exemption was granted,
 * the month the TRIM notice is mailed until that year's petition deadline is
 * saved, and each saved petition deadline. Other states get nothing.
 */
export function floridaTaxEvents(
  propertyId: string,
  address: string,
  state: string,
  years: TaxYearStatus[],
  now: Date = new Date(),
): IcsEvent[] {
  if (!isFloridaState(state)) return [];
  const today = localIso(now);
  const byYear = new Map(years.map((y) => [y.year, y]));
  const out: IcsEvent[] = [];
  for (const cal of Object.values(FLORIDA_TAX_CALENDAR)) {
    const saved = byYear.get(cal.year);
    const marked = saved !== undefined && saved.exemption !== "Unknown";
    if (cal.homesteadDeadline >= today && !marked && byYear.get(cal.year - 1)?.exemption !== "Granted") {
      out.push({
        uid: `tax-${propertyId}-homestead-${cal.year}`,
        date: cal.homesteadDeadline,
        title: "Homestead exemption deadline",
        description: taxDescription(
          address,
          `Apply with your county property appraiser by this date for the ${cal.year} tax year.`,
          FLORIDA_TAX_SOURCES.homestead,
        ),
      });
    }
    const trim = `${cal.year}-${pad(cal.trimMonth)}-01`;
    if (trim >= today && !saved?.petitionDeadline) {
      out.push({
        uid: `tax-${propertyId}-trim-${cal.year}`,
        date: trim,
        title: "Proposed property tax notice (TRIM) due this month",
        description: taxDescription(
          address,
          "Your county mails the notice this month. The deadline to petition your value is printed on it; save it in HomeGentic to add it here.",
          FLORIDA_TAX_SOURCES.petition,
        ),
      });
    }
  }
  for (const y of years) {
    if (!isIcsDate(y.petitionDeadline) || y.petitionDeadline < today) continue;
    out.push({
      uid: `tax-${propertyId}-petition-${y.year}`,
      date: y.petitionDeadline,
      title: "Property tax petition deadline",
      description: taxDescription(
        address,
        "Last day to file a petition with the Value Adjustment Board, from your notice.",
        FLORIDA_TAX_SOURCES.petition,
      ),
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface CalendarSources {
  properties: Property[];
  jobs: Job[];
  /** propertyId → its recurring services with their visit logs. */
  recurring: Record<string, { service: RecurringService; visits: VisitLog[] }[]>;
  systemAges: (propertyId: string) => SystemAges;
  /** propertyId → its insurance policy on record. */
  insurance?: Record<string, InsurancePolicy | null>;
  /** propertyId → its saved tax years. */
  taxYears?: Record<string, TaxYearStatus[]>;
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
    const renewal = insuranceRenewalEvent(pid, p.address, src.insurance?.[pid] ?? null, now);
    if (renewal) events.push(renewal);
    events.push(...floridaTaxEvents(pid, p.address, String(p.state), src.taxYears?.[pid] ?? [], now));
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
