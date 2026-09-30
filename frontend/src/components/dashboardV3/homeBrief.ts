/**
 * The home brief — what the resting dashboard says when you open it.
 *
 * Pure and rule-based: every line comes from data the dashboard already
 * loads (proposals, sensors, bids, jobs, recurring visits, the ten-year
 * forecast, bills), ranked by how soon it costs the homeowner something.
 * No AI call — the brief shows on every visit, for every tier, so it must
 * cost nothing to produce.
 */
import type { Job } from "@/services/job";
import type { QuoteRequest } from "@/services/quote";
import type { RecurringService, VisitLog } from "@/services/recurringService";
import type { SensorEvent } from "@/services/sensor";
import type { AtRiskWarning } from "@/services/scoreDecayService";
import type { SystemEstimate } from "@/services/systemAgeEstimator";
import type { PersonAccess } from "@/services/people";
import { SERIES_LABELS, type Insight } from "@/services/billsForecast";
import { nextVisit } from "./panelData";
import type { FlowKey, PanelKey } from "./types";

export type BriefTone = "urgent" | "action" | "money" | "info";

export interface BriefItem {
  id:     string;
  tone:   BriefTone;
  text:   string;
  /** Where tapping the item goes: a panel, or a flow (modal). */
  go?:    PanelKey;
  flow?:  FlowKey;
}

export interface HomeBrief {
  greeting: string;
  summary:  string;
  items:    BriefItem[];
}

export interface BriefInput {
  now:               Date;
  pendingProposals:  Job[];
  sensorAlerts:      SensorEvent[];
  quoteRequests:     QuoteRequest[];
  bidCountMap:       Record<string, number>;
  jobs:              Job[];
  recurringServices: RecurringService[];
  visitLogMap:       Record<string, VisitLog[]>;
  atRiskWarnings:    AtRiskWarning[];
  systems:           SystemEstimate[];
  billInsights:      Insight[];
  people:            PersonAccess[] | null;
  quotaExhausted:    boolean;
}

/** Most items the brief shows; the rest are one tap away in the rail. */
export const MAX_BRIEF_ITEMS = 4;

const DAY = 86_400_000;
const VISIT_WINDOW_DAYS = 7;
const UTILITY_RISE_PCT  = 15;

export function greetingFor(now: Date): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

function monthName(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long" });
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function buildHomeBrief(input: BriefInput): HomeBrief {
  const items: BriefItem[] = [];
  const now = input.now.getTime();

  const alert = input.sensorAlerts[0];
  if (alert) {
    const what = alert.eventType.replace(/([A-Z])/g, " $1").trim().toLowerCase();
    items.push({ id: "sensor", tone: "urgent", text: `A sensor reported ${what}. Check it before it becomes a repair.`, go: "sensors" });
  }

  const pending = input.pendingProposals.length;
  if (pending) {
    items.push({ id: "approvals", tone: "action", text: `${pending} ${plural(pending, "job is", "jobs are")} waiting on your approval.`, go: "awaiting" });
  }

  const withBids = input.quoteRequests.filter((r) => (r.status === "open" || r.status === "quoted") && (input.bidCountMap[r.id] ?? 0) > 0);
  if (withBids.length) {
    const bids = withBids.reduce((n, r) => n + (input.bidCountMap[r.id] ?? 0), 0);
    items.push({
      id: "bids", tone: "action",
      text: `${bids} ${plural(bids, "bid is", "bids are")} waiting on your ${withBids[0].serviceType.toLowerCase()} request.`,
      flow: "bids",
    });
  }

  const unsigned = input.jobs.find((j) => j.contractorName && !j.contractorSigned);
  if (unsigned) {
    items.push({ id: "countersign", tone: "action", text: `${unsigned.contractorName} hasn't countersigned your ${unsigned.serviceType.toLowerCase()} job, so it earns no points yet.`, flow: "chase" });
  }

  const dueVisits = input.recurringServices
    .filter((s) => s.status === "Active")
    .map((s) => ({ s, due: nextVisit(s, input.visitLogMap[s.id] ?? []).nextDue }))
    .filter(({ due }) => due - now <= VISIT_WINDOW_DAYS * DAY)
    .sort((a, b) => a.due - b.due);
  if (dueVisits.length) {
    const { s, due } = dueVisits[0];
    const days = Math.round((due - now) / DAY);
    const when = days < 0 ? "is overdue" : days === 0 ? "is due today" : `is due in ${days} ${plural(days, "day", "days")}`;
    items.push({ id: "visit", tone: "action", text: `${s.serviceType}${s.providerName ? ` with ${s.providerName}` : ""} ${when}.`, go: "maint" });
  }

  const upcoming = input.billInsights.find((i): i is Extract<Insight, { type: "upcoming" }> => i.type === "upcoming");
  if (upcoming) {
    items.push({ id: "payment", tone: "money", text: `${SERIES_LABELS[upcoming.key]} of ${money(upcoming.amountCents)} is due in ${monthName(upcoming.month)}.`, go: "spend" });
  }

  const risk = input.atRiskWarnings[0];
  if (risk) {
    items.push({ id: "decay", tone: "action", text: `${risk.label}: ${risk.daysRemaining} ${plural(risk.daysRemaining, "day", "days")} before it costs points.`, go: "property" });
  }

  const critical = input.systems
    .filter((s) => s.urgency === "Critical")
    .sort((a, b) => a.yearsRemaining - b.yearsRemaining)[0];
  if (critical) {
    const past = -critical.yearsRemaining;
    const life = past > 0 ? `${past} ${plural(past, "year", "years")} past` : "at the end of";
    items.push({
      id: "system", tone: "money",
      text: `Your ${critical.systemName.toLowerCase()} is ${life} its expected life. Replacement runs $${critical.replacementCostLow.toLocaleString()}–$${critical.replacementCostHigh.toLocaleString()}.`,
      go: "forecast",
    });
  }

  const rise = input.billInsights.find(
    (i): i is Extract<Insight, { type: "yoy" }> => i.type === "yoy" && i.key.startsWith("utility:") && i.changePct >= UTILITY_RISE_PCT,
  );
  if (rise) {
    items.push({ id: "utility", tone: "money", text: `${SERIES_LABELS[rise.key]} bills are up ${rise.changePct}% on last year.`, go: "spend" });
  }

  const invite = input.people?.find((p) => p.isPending);
  if (invite) {
    items.push({ id: "invite", tone: "info", text: `${invite.name} hasn't accepted their invite yet.`, go: "people" });
  }

  if (input.quotaExhausted) {
    items.push({ id: "quota", tone: "info", text: "Your AI assistant calls are used up for this period. Chat still works.", go: "billing" });
  }

  const shown = items.slice(0, MAX_BRIEF_ITEMS);
  const actionable = items.filter((i) => i.tone !== "info").length;
  return {
    greeting: greetingFor(input.now),
    summary: actionable === 0
      ? "Nothing needs you today."
      : actionable === 1 ? "One thing needs you." : `${actionable} things need you.`,
    items: shown,
  };
}
