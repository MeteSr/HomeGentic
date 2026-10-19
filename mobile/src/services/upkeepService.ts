/**
 * Recurring services (recurring canister), the maintenance schedule
 * (maintenance canister) and sensors (sensor canister) — everything the Home,
 * Property and Upkeep tabs show about keeping the house running.
 */
import { HttpAgent } from "@icp-sdk/core/agent";
import { idlFactory as recurringIdl }   from "@homegentic/shared/declarations/recurring";
import { idlFactory as maintenanceIdl } from "@homegentic/shared/declarations/maintenance";
import { idlFactory as sensorIdl }      from "@homegentic/shared/declarations/sensor";
import { actorFor, nsToMs, tag, unwrap } from "./canister";

const RECURRING_CANISTER_ID   = process.env.EXPO_PUBLIC_RECURRING_CANISTER_ID   ?? "";
const MAINTENANCE_CANISTER_ID = process.env.EXPO_PUBLIC_MAINTENANCE_CANISTER_ID ?? "";
const SENSOR_CANISTER_ID      = process.env.EXPO_PUBLIC_SENSOR_CANISTER_ID      ?? "";

const DAY_MS = 24 * 60 * 60 * 1000;

// ── Recurring services ───────────────────────────────────────────────────────

export type RecurringServiceType = "LawnCare" | "PestControl" | "PoolMaintenance" | "GutterCleaning" | "PressureWashing" | "Other";
export type Frequency = "Weekly" | "BiWeekly" | "Monthly" | "Quarterly" | "SemiAnnually" | "Annually";

export interface RecurringService {
  id:            string;
  serviceType:   RecurringServiceType;
  providerName:  string;
  providerPhone: string | null;
  frequency:     Frequency;
  startDate:     string;          // YYYY-MM-DD
  notes:         string | null;
  status:        "Active" | "Paused" | "Cancelled";
  /** Most recent logged visit, YYYY-MM-DD. */
  lastVisit:     string | null;
}

export const SERVICE_LABEL: Record<RecurringServiceType, string> = {
  LawnCare:        "Lawn maintenance",
  PestControl:     "Pest control",
  PoolMaintenance: "Pool maintenance",
  GutterCleaning:  "Gutter cleaning",
  PressureWashing: "Pressure washing",
  Other:           "Recurring service",
};

export const SERVICE_ABBR: Record<RecurringServiceType, string> = {
  LawnCare: "LN", PestControl: "PC", PoolMaintenance: "PL", GutterCleaning: "GU", PressureWashing: "PW", Other: "RS",
};

export const FREQUENCY_LABEL: Record<Frequency, { chip: string; phrase: string; days: number }> = {
  Weekly:       { chip: "WEEKLY",      phrase: "Weekly",          days: 7 },
  BiWeekly:     { chip: "EVERY 2 WK",  phrase: "Every 2 weeks",   days: 14 },
  Monthly:      { chip: "MONTHLY",     phrase: "Monthly",         days: 30 },
  Quarterly:    { chip: "EVERY 3 MO",  phrase: "Every 3 months",  days: 91 },
  SemiAnnually: { chip: "EVERY 6 MO",  phrase: "Every 6 months",  days: 182 },
  Annually:     { chip: "YEARLY",      phrase: "Annually",        days: 365 },
};

function parseDay(d: string): number {
  // YYYY-MM-DD as a local date so "today" comparisons don't shift by timezone.
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, day || 1).getTime();
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Next visit due: one period after the last logged visit, or the start date
 * if nothing has been logged yet. May be in the past (overdue).
 */
export function nextDue(svc: Pick<RecurringService, "startDate" | "lastVisit" | "frequency">): number {
  if (!svc.lastVisit) return parseDay(svc.startDate);
  return parseDay(svc.lastVisit) + FREQUENCY_LABEL[svc.frequency].days * DAY_MS;
}

export async function getRecurringServices(propertyId: string, agent?: HttpAgent): Promise<RecurringService[]> {
  const a = actorFor(recurringIdl, RECURRING_CANISTER_ID, agent);
  const raw: any[] = await a.getByProperty(propertyId);
  const active = raw.filter((r) => tag(r.status) !== "Cancelled");
  const logs: any[][] = await Promise.all(active.map((r) => a.getVisitLogs(r.id).catch(() => [])));
  return active.map((r, i) => {
    const dates = logs[i].map((l: any) => l.visitDate as string).sort();
    return {
      id:            r.id,
      serviceType:   tag<RecurringServiceType>(r.serviceType),
      providerName:  r.providerName,
      providerPhone: r.providerPhone[0] ?? null,
      frequency:     tag<Frequency>(r.frequency),
      startDate:     r.startDate,
      notes:         r.notes[0] ?? null,
      status:        tag(r.status) as RecurringService["status"],
      lastVisit:     dates.length ? dates[dates.length - 1] : null,
    };
  });
}

export async function createRecurringService(
  propertyId: string,
  input: { serviceType: RecurringServiceType; providerName: string; providerPhone: string | null; frequency: Frequency; startDate: string; notes: string | null },
  agent?: HttpAgent,
): Promise<void> {
  unwrap(await actorFor(recurringIdl, RECURRING_CANISTER_ID, agent).createRecurringService(
    propertyId,
    { [input.serviceType]: null },
    input.providerName,
    [],
    input.providerPhone ? [input.providerPhone] : [],
    { [input.frequency]: null },
    input.startDate,
    [],
    input.notes ? [input.notes] : [],
  ));
}

/** Logs a visit for today — "Mark done". */
export async function logVisit(serviceId: string, today = new Date(), agent?: HttpAgent): Promise<void> {
  const date = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  unwrap(await actorFor(recurringIdl, RECURRING_CANISTER_ID, agent).addVisitLog(serviceId, date, []));
}

// ── Maintenance schedule ─────────────────────────────────────────────────────

export interface ScheduleEntry {
  id:              string;
  systemName:      string;
  taskDescription: string;
  plannedYear:     number;
  plannedMonth:    number | null;   // 1–12
  isCompleted:     boolean;
}

export async function getSchedule(propertyId: string, agent?: HttpAgent): Promise<ScheduleEntry[]> {
  const raw: any[] = await actorFor(maintenanceIdl, MAINTENANCE_CANISTER_ID, agent).getScheduleByProperty(propertyId);
  return raw.map((e) => ({
    id:              e.id,
    systemName:      e.systemName,
    taskDescription: e.taskDescription,
    plannedYear:     Number(e.plannedYear),
    plannedMonth:    e.plannedMonth.length ? Number(e.plannedMonth[0]) : null,
    isCompleted:     e.isCompleted,
  }));
}

export async function completeScheduleEntry(entryId: string, agent?: HttpAgent): Promise<void> {
  unwrap(await actorFor(maintenanceIdl, MAINTENANCE_CANISTER_ID, agent).markCompleted(entryId));
}

/** A planned task is overdue once its month (or year, if no month) has passed. */
export function isOverdue(e: ScheduleEntry, now = Date.now()): boolean {
  if (e.isCompleted) return false;
  const d = new Date(now);
  if (e.plannedMonth == null) return e.plannedYear < d.getFullYear();
  return e.plannedYear < d.getFullYear() || (e.plannedYear === d.getFullYear() && e.plannedMonth < d.getMonth() + 1);
}

// ── Combined upkeep list (pure) ──────────────────────────────────────────────

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

export type DueTone = "red" | "blue" | "muted";

export interface UpkeepItem {
  key:       string;
  kind:      "recurring" | "scheduled";
  id:        string;
  date:      string;     // "AUG 21" or "SEP 2027"
  sortAt:    number;
  label:     string;
  meta:      string;
  due:       string;     // chip text
  tone:      DueTone;
  overdue:   boolean;
}

function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}

function inDays(days: number): string {
  if (days < 0) return days === -1 ? "1 DAY LATE" : `${-days} DAYS LATE`;
  if (days === 0) return "TODAY";
  return days === 1 ? "TOMORROW" : `IN ${days} DAYS`;
}

export function buildUpkeep(services: RecurringService[], schedule: ScheduleEntry[], now = Date.now()): UpkeepItem[] {
  const today = startOfDay(now);
  const items: UpkeepItem[] = [];

  for (const s of services) {
    if (s.status !== "Active") continue;
    const due  = nextDue(s);
    const days = Math.round((startOfDay(due) - today) / DAY_MS);
    const freq = FREQUENCY_LABEL[s.frequency];
    const frequent = freq.days <= 14;
    items.push({
      key:     `r-${s.id}`,
      kind:    "recurring",
      id:      s.id,
      date:    dayLabel(due),
      sortAt:  due,
      label:   SERVICE_LABEL[s.serviceType],
      meta:    `${freq.phrase} · ${s.providerName}`,
      due:     days < 0 ? inDays(days) : frequent ? "RECURRING" : inDays(days),
      tone:    days < 0 ? "red" : frequent ? "blue" : days <= 7 ? "red" : "muted",
      overdue: days < 0,
    });
  }

  const d = new Date(now);
  for (const e of schedule) {
    if (e.isCompleted) continue;
    const month = e.plannedMonth ?? 12;
    const at = new Date(e.plannedYear, month - 1, 1).getTime();
    const monthsAway = (e.plannedYear - d.getFullYear()) * 12 + (month - 1 - d.getMonth());
    const overdue = isOverdue(e, now);
    items.push({
      key:     `m-${e.id}`,
      kind:    "scheduled",
      id:      e.id,
      date:    e.plannedMonth ? `${MONTHS[month - 1]} ${e.plannedYear}` : String(e.plannedYear),
      sortAt:  at,
      label:   e.taskDescription,
      meta:    e.systemName,
      due:     overdue ? "OVERDUE" : monthsAway <= 0 ? "THIS MONTH" : monthsAway === 1 ? "NEXT MONTH" : `IN ${monthsAway} MO`,
      tone:    overdue ? "red" : monthsAway <= 0 ? "red" : "muted",
      overdue,
    });
  }

  return items.sort((a, b) => a.sortAt - b.sortAt);
}

// ── Sensors ──────────────────────────────────────────────────────────────────

export type Severity = "Info" | "Warning" | "Critical";

export interface SensorSummary {
  id:        string;
  label:     string;   // device name, uppercased
  value:     string;   // "All clear" or the latest alert
  note:      string;
  alert:     boolean;
}

const EVENT_LABEL: Record<string, string> = {
  WaterLeak: "Water leak", LeakDetected: "Leak detected", FloodRisk: "Flood risk",
  LowTemperature: "Low temperature", HvacAlert: "HVAC alert", HvacFilterDue: "Filter due",
  HighHumidity: "High humidity", HighTemperature: "High temperature", SolarFault: "Solar fault",
  LowProduction: "Low production", BatteryLow: "Battery low", GridOutage: "Grid outage",
  ApplianceFault: "Appliance fault", ApplianceMaintenance: "Service due",
};

function ago(ms: number, now: number): string {
  const mins = Math.max(1, Math.round((now - ms) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/** One tile per active device: its latest event in the last 7 days, or all clear. */
export function summariseSensors(
  devices: { id: string; name: string; isActive: boolean; registeredAt: number }[],
  events: { deviceId: string; eventType: string; severity: Severity; timestamp: number; value: number; unit: string }[],
  now = Date.now(),
): SensorSummary[] {
  const week = now - 7 * DAY_MS;
  return devices.filter((d) => d.isActive).map((d) => {
    const latest = events
      .filter((e) => e.deviceId === d.id && e.timestamp >= week)
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    if (!latest) {
      return { id: d.id, label: d.name.toUpperCase(), value: "All clear", note: "No alerts this week", alert: false };
    }
    return {
      id:    d.id,
      label: d.name.toUpperCase(),
      value: EVENT_LABEL[latest.eventType] ?? latest.eventType,
      note:  `${latest.severity === "Info" ? "Reported" : latest.severity} ${ago(latest.timestamp, now)}`,
      alert: latest.severity !== "Info",
    };
  });
}

export async function getSensorSummaries(propertyId: string, agent?: HttpAgent): Promise<SensorSummary[]> {
  if (!SENSOR_CANISTER_ID) return [];
  const a = actorFor(sensorIdl, SENSOR_CANISTER_ID, agent);
  const [devices, events]: [any[], any[]] = await Promise.all([
    a.getDevicesForProperty(propertyId),
    a.getEventsForProperty(propertyId, 50n),
  ]);
  return summariseSensors(
    devices.map((d) => ({ id: d.id, name: d.name, isActive: d.isActive, registeredAt: nsToMs(d.registeredAt) })),
    events.map((e) => ({
      deviceId: e.deviceId, eventType: tag(e.eventType), severity: tag<Severity>(e.severity),
      timestamp: nsToMs(e.timestamp), value: e.value, unit: e.unit,
    })),
  );
}
