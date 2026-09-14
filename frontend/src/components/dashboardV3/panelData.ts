/**
 * DashboardV3 — panel data builders.
 *
 * Every panel is built from real hook/service data already wired into
 * DashboardPage (score, decay, pulse, jobs, quotes, recurring services,
 * rooms, sensors, subscription, voice agent quota) — nothing here is
 * fabricated demo copy. Two panels are explicitly heuristic because no
 * backing service exists yet (SAFETY / CREDITS — see the comment above
 * `buildSafety`); they say so in their own copy rather than pretending to
 * be authoritative.
 */
import type { Job } from "@/services/job";
import type { Property } from "@/services/property";
import type { QuoteRequest } from "@/services/quote";
import type { RecurringService, VisitLog } from "@/services/recurringService";
import type { Room } from "@/services/room";
import type { SensorDevice, SensorEvent } from "@/services/sensor";
import type { ScoreBreakdown } from "@/services/scoreService";
import type { AtRiskWarning, DecayEvent } from "@/services/scoreDecayService";
import type { ScoreEvent } from "@/services/scoreEventService";
import type { PlanTier } from "@/services/planConstants";
import type { FlowKey, PanelData, PanelKey, PanelRow } from "./types";

const GOOD  = "var(--hg-good)";
const BAD   = "var(--hg-bad)";
const WARN  = "var(--hg-warn)";
const INK   = "var(--hg-ink-2)";
const MUTED = "var(--hg-muted)";
const BLUE  = "var(--hg-blue-soft)";

export const PANEL_ORDER: PanelKey[] = [
  "awaiting", "score", "property", "market", "maint", "jobs", "pros",
  "sensors", "safety", "docs", "rooms", "spend", "activity", "billing",
];

export const CTA_FLOW: Partial<Record<PanelKey, FlowKey>> = {
  jobs: "bids", docs: "receipt", add: "room", rooms: "room",
  billing: "upgrade", maint: "recurring", pros: "chase", listing: "listing",
};

function money(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
function moneyCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}
function shortDate(d: string | number): string {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export interface PanelCtx {
  score: number;
  grade: string;
  breakdown: ScoreBreakdown;
  premium: { low: number; high: number } | null;
  zipCode: string;

  activeProperty: Property | null;
  properties: Property[];

  jobs: Job[];
  pendingProposals: Job[];
  decayEvents: DecayEvent[];
  atRiskWarnings: AtRiskWarning[];
  scoreEvents: ScoreEvent[];

  quoteRequests: QuoteRequest[];
  bidCountMap: Record<string, number>;

  recurringServices: RecurringService[];
  visitLogMap: Record<string, VisitLog[]>;

  rooms: Room[];

  sensorDevices: SensorDevice[];
  sensorAlerts: SensorEvent[];

  planTier: PlanTier;
  agentCreditsLeft: number | null;
  agentQuotaExhausted: boolean;

  // ── actions ──────────────────────────────────────────────────────────────
  goPanel: (k: PanelKey) => void;
  openFlow: (k: FlowKey) => void;
  approveProposal: (id: string) => void;
  declineProposal: (id: string) => void;
  approveAll: () => void;
}

function verifiedTone(j: Job): string {
  return j.verified ? INK : WARN;
}

// ── AWAITING ───────────────────────────────────────────────────────────────

function buildAwaiting(ctx: PanelCtx): PanelData {
  const rows: PanelRow[] = ctx.pendingProposals.map((p) => ({
    id: p.id,
    lead: p.serviceType,
    sub: `${p.isDiy ? "SELF-LOGGED" : "VERIFIED PRO"} · ${p.contractorName ?? "Homeowner"} · ${shortDate(p.date)} · ${moneyCents(p.amount)}`,
    right: "+4 pts",
    tone: GOOD,
    hasActions: true,
    approve: () => ctx.approveProposal(p.id),
    decline: () => ctx.declineProposal(p.id),
  }));
  const n = ctx.pendingProposals.length;
  return {
    chip: "AWAITING",
    count: n ? String(n) : "",
    asked: n === 1 ? "One job is waiting on your approval" : "Jobs waiting on your approval",
    title: n === 0 ? "Nothing is waiting on you" : n === 1 ? "One contractor submitted work" : `${n} contractors submitted work`,
    sub: "Approve and it joins the record and earns points. Decline and it never existed.",
    cta: n > 1 ? "Approve all" : "Approve",
    ctaFlow: undefined,
    rows,
  };
}

// ── SCORE ────────────────────────────────────────────────────────────────

function buildScore(ctx: PanelCtx): PanelData {
  const b = ctx.breakdown;
  const row = (lead: string, sub: string, val: number, max: number, go?: PanelKey): PanelRow => ({
    lead, sub, right: `${val} / ${max}`, rightSub: val >= max ? "MAX" : `−${max - val}`,
    tone: val >= max ? INK : WARN, hasBar: true, pct: `${Math.round((val / max) * 100)}%`,
    barColor: val >= max ? "#2B34FF" : WARN, go,
  });
  const gapPts = 100 - (b.verifiedJobPts + b.valuePts + b.verificationPts + b.diversityPts);
  return {
    chip: "SCORE", count: String(ctx.score),
    asked: `Your score is ${ctx.score} out of 100`,
    title: gapPts > 0 ? `Grade ${ctx.grade} — ${gapPts} points still on the table` : `Grade ${ctx.grade} — every component maxed`,
    sub: "Four components, 100 points: verified jobs, documented value, property verification and job diversity.",
    cta: "See how to earn them",
    rows: [
      row("Verified jobs", `${ctx.jobs.filter((j) => j.verified).length} VERIFIED JOBS · 4 PTS EACH`, b.verifiedJobPts, 40),
      row("Documented value", `${money(ctx.jobs.reduce((s, j) => s + j.amount, 0))} DOCUMENTED · 1 PT PER $2,500`, b.valuePts, 20, "docs"),
      row("Property verification", `${ctx.properties.filter((p) => p.verificationLevel === "Basic" || p.verificationLevel === "Premium").length} OF ${ctx.properties.length} PROPERTIES VERIFIED`, b.verificationPts, 20, "property"),
      row("Job diversity", `${new Set(ctx.jobs.map((j) => j.serviceType)).size} TRADES LOGGED · 4 PTS EACH`, b.diversityPts, 20, "jobs"),
    ],
  };
}

// ── PROPERTY ─────────────────────────────────────────────────────────────

function buildProperty(ctx: PanelCtx): PanelData {
  const p = ctx.activeProperty;
  const rows: PanelRow[] = [
    ...ctx.decayEvents.map((e) => ({
      lead: e.label, sub: e.detail.toUpperCase(), right: String(e.pts), rightSub: "APPLIED",
      tone: e.category === "SystemAge" || e.category === "Warranty" ? BAD : WARN,
      flow: "logJob" as FlowKey,
    })),
    ...ctx.atRiskWarnings.map((w) => ({
      lead: w.label, sub: "LOG A JOB BEFORE IT LAPSES TO HOLD THE POINTS",
      right: `${w.daysRemaining} days left`, rightSub: `THEN ${w.pts}`, tone: WARN, flow: "logJob" as FlowKey,
    })),
  ];
  const needProof = ctx.jobs.filter((j) => !j.verified).length;
  return {
    chip: "PROPERTY", count: p ? String(ctx.jobs.length) : "0",
    asked: p ? `${p.address}, built ${p.yearBuilt}` : "No property on file",
    title: p ? `${ctx.jobs.length} records on file, ${needProof} need proof` : "Add a property to start the record",
    sub: p ? `${p.propertyType === "SingleFamily" ? "Single-family home" : p.propertyType}. ${ctx.decayEvents.length} system${ctx.decayEvents.length === 1 ? "" : "s"} depreciating against rated life.` : "",
    cta: "Log a job to add proof",
    rows: rows.length ? rows : [{ lead: "No open risks", sub: "NOTHING IS DECAYING AGAINST THE RECORD RIGHT NOW", right: "Clear", rightSub: "", tone: INK }],
  };
}

// ── MARKET ───────────────────────────────────────────────────────────────

function buildMarket(ctx: PanelCtx): PanelData {
  const est = ctx.premium;
  const rows: PanelRow[] = [
    { lead: "Est. value — ZIP median", sub: `${ctx.zipCode || "—"} · CURRENT`, right: "Median", rightSub: "BASELINE", tone: MUTED },
    est
      ? { lead: "What buyers pay extra", sub: `AT GRADE ${ctx.grade}, ON COMPARABLE SALES`, right: `${money(est.low * 100)}–${money(est.high * 100)}`, rightSub: "ABOVE MEDIAN", tone: GOOD }
      : { lead: "Log more jobs to unlock value insights", sub: "PREMIUM ESTIMATES NEED A SCORE ABOVE ZERO", right: "—", rightSub: "", tone: MUTED },
    { lead: "Certificate link", sub: "READ-ONLY · SCORE, VERIFIED JOBS, NO CONTACT DETAILS", right: "Copy", rightSub: "SHAREABLE", tone: BLUE },
    { lead: "List for agent bids", sub: "AGENTS BID COMMISSION AND PRICE · COSTS YOU $0", right: "Start", rightSub: "SELL", tone: WARN, flow: "listing" },
  ];
  return {
    chip: "MARKET", count: ctx.zipCode ? "" : "",
    asked: "What the record is worth at sale",
    title: est ? `${money(est.low * 100)}–${money(est.high * 100)} above the median` : "Log jobs to see resale value",
    sub: `What a documented ${ctx.activeProperty?.address ?? "record"} clears against an equivalent unverified sale.`,
    cta: "Generate resale report",
    rows,
  };
}

// ── MAINT ────────────────────────────────────────────────────────────────

const FREQ_DAYS: Record<string, number> = {
  Weekly: 7, BiWeekly: 14, Monthly: 30, Quarterly: 91, SemiAnnually: 182, Annually: 365,
};
const FREQ_LABEL: Record<string, string> = {
  Weekly: "WEEKLY", BiWeekly: "EVERY 2 WEEKS", Monthly: "MONTHLY",
  Quarterly: "EVERY 3 MONTHS", SemiAnnually: "EVERY 6 MONTHS", Annually: "ANNUALLY",
};

function buildMaint(ctx: PanelCtx): PanelData {
  const now = Date.now();
  const rows: PanelRow[] = ctx.recurringServices.map((svc) => {
    if (svc.status === "Paused") {
      return { lead: svc.providerName || svc.serviceType, sub: `${FREQ_LABEL[svc.frequency] ?? svc.frequency} · PAUSED`, right: "Paused", rightSub: "NO VISITS", tone: MUTED };
    }
    const logs = ctx.visitLogMap[svc.id] ?? [];
    const last = logs.length ? new Date(logs[logs.length - 1].visitDate).getTime() : new Date(svc.startDate).getTime();
    const freqDays = FREQ_DAYS[svc.frequency] ?? 365;
    const nextDue = last + freqDays * 86400000;
    const daysUntil = Math.max(0, Math.round((nextDue - now) / 86400000));
    return {
      lead: svc.providerName ? `${svc.serviceType} · ${svc.providerName}` : svc.serviceType,
      sub: `${FREQ_LABEL[svc.frequency] ?? svc.frequency}${svc.providerName ? ` · ${svc.providerName}` : ""} · LAST ${shortDate(last).toUpperCase()}`,
      right: shortDate(nextDue), rightSub: daysUntil <= 7 ? `IN ${daysUntil} DAYS` : "RECURRING",
      tone: daysUntil <= 7 ? BAD : INK, flow: "recurring" as FlowKey,
    };
  });
  const dueSoon = rows.filter((r) => r.rightSub?.startsWith("IN")).length;
  return {
    chip: "MAINT", count: String(ctx.recurringServices.filter((s) => s.status === "Active").length),
    asked: `${dueSoon} visit${dueSoon === 1 ? "" : "s"} due in the next 30 days`,
    title: dueSoon > 0 ? "A visit is due soon" : "Nothing due in the next 30 days",
    sub: `${ctx.recurringServices.length} recurring contract${ctx.recurringServices.length === 1 ? "" : "s"}.`,
    cta: "Confirm the schedule",
    rows: rows.length ? rows : [{ lead: "No recurring services yet", sub: "SET ONE UP TO TRACK VISITS AUTOMATICALLY", right: "Add", rightSub: "", tone: BLUE, flow: "recurring" }],
  };
}

// ── JOBS (open quote requests / bids) ────────────────────────────────────

function buildJobs(ctx: PanelCtx): PanelData {
  const open = ctx.quoteRequests.filter((r) => r.status === "open" || r.status === "quoted");
  const rows: PanelRow[] = open.map((r) => {
    const bids = ctx.bidCountMap[r.id] ?? 0;
    return {
      lead: r.description || r.serviceType,
      sub: `${r.serviceType.toUpperCase()} · POSTED ${shortDate(r.createdAt).toUpperCase()} · ${r.urgency.toUpperCase()}`,
      right: bids === 1 ? "1 bid" : `${bids} bids`, rightSub: bids > 0 ? "BIDS IN" : "AWAITING",
      tone: bids > 0 ? WARN : MUTED, flow: bids > 0 ? ("bids" as FlowKey) : undefined,
    };
  });
  const totalBids = open.reduce((s, r) => s + (ctx.bidCountMap[r.id] ?? 0), 0);
  return {
    chip: "JOBS", count: String(open.length),
    asked: `${open.length} open job${open.length === 1 ? "" : "s"}, ${totalBids} bid${totalBids === 1 ? "" : "s"} waiting`,
    title: totalBids > 0 ? `${totalBids} bid${totalBids === 1 ? "" : "s"} waiting on you` : "No bids waiting",
    sub: "Every open quote request on this record, newest first.",
    cta: "Review the bids",
    rows: rows.length ? rows : [{ lead: "No open jobs", sub: "REQUEST A QUOTE TO START GETTING BIDS", right: "Request", rightSub: "QUOTE", tone: BLUE, flow: "quote" }],
  };
}

// ── PROS ─────────────────────────────────────────────────────────────────

function buildPros(ctx: PanelCtx): PanelData {
  const byContractor = new Map<string, Job[]>();
  for (const j of ctx.jobs) {
    if (!j.contractorName) continue;
    byContractor.set(j.contractorName, [...(byContractor.get(j.contractorName) ?? []), j]);
  }
  const rows: PanelRow[] = Array.from(byContractor.entries()).map(([name, list]) => {
    const total = list.reduce((s, j) => s + j.amount, 0);
    const unsigned = list.find((j) => !j.contractorSigned);
    const latest = [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
    return unsigned
      ? { lead: name, sub: `${unsigned.serviceType.toUpperCase()} · AWAITING COUNTERSIGN`, right: moneyCents(unsigned.amount), rightSub: shortDate(unsigned.date).toUpperCase(), tone: BAD, flow: "chase" as FlowKey }
      : { lead: name, sub: `${list[0].serviceType.toUpperCase()} · ${list.length} JOB${list.length === 1 ? "" : "S"} · VERIFIED`, right: money(total), rightSub: shortDate(latest.date).toUpperCase(), tone: INK };
  });
  const outstanding = rows.filter((r) => r.tone === BAD).length;
  return {
    chip: "PROS", count: String(byContractor.size),
    asked: `${byContractor.size} pros have work on this record`,
    title: outstanding > 0 ? `${outstanding} signature${outstanding === 1 ? " is" : "s are"} outstanding` : "Every job is countersigned",
    sub: "Contractors who have logged work on this property, most recent first.",
    cta: "Chase the signature",
    rows: rows.length ? rows : [{ lead: "No contractors on record yet", sub: "LOG A JOB TO ADD ONE", right: "Add", rightSub: "", tone: BLUE, flow: "logJob" }],
  };
}

// ── SENSORS ──────────────────────────────────────────────────────────────

function buildSensors(ctx: PanelCtx): PanelData {
  const rows: PanelRow[] = ctx.sensorDevices.map((d) => {
    const alert = ctx.sensorAlerts.find((a) => a.deviceId === d.id);
    return alert
      ? { lead: d.name, sub: `${d.source.toUpperCase()} · UPDATED ${shortDate(alert.timestamp).toUpperCase()}`, right: `${alert.value}${alert.unit}`, rightSub: alert.severity.toUpperCase(), tone: alert.severity === "Critical" ? BAD : alert.severity === "Warning" ? WARN : INK }
      : { lead: d.name, sub: `${d.source.toUpperCase()} · ${d.isActive ? "ACTIVE" : "INACTIVE"}`, right: "Normal", rightSub: "", tone: INK };
  });
  const alerts = ctx.sensorAlerts.length;
  return {
    chip: "SENSORS", count: String(ctx.sensorDevices.length),
    asked: alerts > 0 ? `${alerts} device${alerts === 1 ? "" : "s"} need attention` : `${ctx.sensorDevices.length} devices reporting`,
    title: alerts > 0 ? ctx.sensorAlerts[0].eventType.replace(/([A-Z])/g, " $1").trim() : "Everything reporting normal",
    sub: ctx.sensorDevices.length === 0 ? "Pair a device to start monitoring leaks, temperature and appliance faults." : "Live device state on this property.",
    cta: ctx.sensorDevices.length === 0 ? "Pair a device" : "Post a plumbing job",
    rows: rows.length ? rows : [{ lead: "No sensors paired", sub: "PAIRS OVER WI-FI IN A FEW MINUTES", right: "Pair", rightSub: "DEVICE", tone: BLUE }],
  };
}

// ── SAFETY / CREDITS ─────────────────────────────────────────────────────
//
// No `insuranceService`/`safetyService` exists in this repo yet — this
// panel is a heuristic read of the same job records the score already
// uses (matching serviceType/description keywords for hardening-adjacent
// work), not a new score component and not a real insurer quote. It says
// so in its own copy so it never reads as more authoritative than it is.

const HARDENING_TERMS: { id: string; label: string; creditLabel: string; test: (j: Job) => boolean }[] = [
  { id: "alarm",   label: "Monitored alarm system",      creditLabel: "Ask your carrier about a monitored-alarm credit", test: (j) => /alarm|security system/i.test(j.serviceType + " " + j.description) },
  { id: "glazing", label: "Impact-rated glazing",          creditLabel: "Ask your carrier about an impact-glazing credit", test: (j) => /window|glaz|impact/i.test(j.serviceType + " " + j.description) },
  { id: "roof",    label: "Roof-to-wall / wind mitigation", creditLabel: "Ask your carrier about a wind-mitigation credit", test: (j) => /roof|wind mitigation|strap/i.test(j.serviceType + " " + j.description) },
  { id: "locks",   label: "Deadbolts on exterior doors",  creditLabel: "Ask your carrier about a deadbolt credit",        test: (j) => /deadbolt|lock/i.test(j.serviceType + " " + j.description) },
];

function buildSafety(ctx: PanelCtx): PanelData {
  const rows: PanelRow[] = HARDENING_TERMS.map((h) => {
    const job = ctx.jobs.find(h.test);
    return job
      ? { lead: h.label, sub: `${job.verified ? "VERIFIED" : "ON FILE"} · ${job.contractorName ?? "SELF-LOGGED"} · ${shortDate(job.date).toUpperCase()}`, right: "On record", rightSub: h.creditLabel.toUpperCase(), tone: GOOD }
      : { lead: h.label, sub: "NO MATCHING JOB ON RECORD YET", right: "Needs proof", rightSub: "LOG A JOB", tone: WARN, flow: "logJob" as FlowKey };
  });
  const proven = rows.filter((r) => r.tone === GOOD).length;
  return {
    chip: "SAFETY", count: String(proven),
    asked: "What protects this house, and whether the record shows it",
    title: `${proven} of ${rows.length} hardening categories have a matching job on record`,
    sub: "Readiness, not surveillance — read from the same job records your score uses. Ask your insurer which of these translates into an actual premium credit; HomeGentic doesn't quote insurance.",
    cta: "Log the missing categories",
    rows,
  };
}

// ── DOCS ─────────────────────────────────────────────────────────────────

function buildDocs(ctx: PanelCtx): PanelData {
  const sorted = [...ctx.jobs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const needProof = sorted.filter((j) => !j.verified);
  const rows: PanelRow[] = sorted.slice(0, 8).map((j) => ({
    lead: `${j.serviceType} ${j.isDiy ? "Record" : "Receipt"}`,
    sub: `${j.contractorName ?? "DIY · SELF-LOGGED"}${j.verified ? " · VERIFIED" : " · NEEDS PROOF"}`,
    right: moneyCents(j.amount), rightSub: shortDate(j.date).toUpperCase(),
    tone: verifiedTone(j), flow: j.verified ? undefined : ("receipt" as FlowKey),
  }));
  return {
    chip: "DOCS", count: String(ctx.jobs.length),
    asked: `${ctx.jobs.length} documents on file`,
    title: needProof.length > 0 ? `${needProof.length} record${needProof.length === 1 ? "" : "s"} still need${needProof.length === 1 ? "s" : ""} proof` : "Every record has proof attached",
    sub: "Most recent first.",
    cta: "Upload a receipt",
    rows: rows.length ? rows : [{ lead: "No documents yet", sub: "LOG A JOB TO START THE RECORD", right: "Add", rightSub: "", tone: BLUE, flow: "receipt" }],
  };
}

// ── ROOMS ────────────────────────────────────────────────────────────────

function buildRooms(ctx: PanelCtx): PanelData {
  const jobsByRoom = ctx.jobs.length; // rooms carry no job link field in this repo yet
  const rows: PanelRow[] = ctx.rooms.map((r) => {
    const bits = [r.floorType, r.paintCode || r.paintColor].filter(Boolean).join(" · ");
    return {
      lead: r.name, sub: bits || "NOTHING ON FILE",
      right: `${r.fixtures.length} fixture${r.fixtures.length === 1 ? "" : "s"}`,
      rightSub: r.fixtures.length ? "" : "EMPTY",
      tone: r.fixtures.length ? INK : MUTED,
    };
  });
  return {
    chip: "ROOMS", count: String(ctx.rooms.length),
    asked: `${ctx.rooms.length} rooms and zones mapped`,
    title: ctx.rooms.length ? "Every job and fixture files to a room" : "No rooms mapped yet",
    sub: `${jobsByRoom} job${jobsByRoom === 1 ? "" : "s"} on this record overall.`,
    cta: "Add a room",
    rows: rows.length ? rows : [{ lead: "No rooms yet", sub: "MAP YOUR FIRST ROOM TO START FILING RECORDS TO IT", right: "Add", rightSub: "ROOM", tone: BLUE, flow: "room" }],
  };
}

// ── SPEND ────────────────────────────────────────────────────────────────

function buildSpend(ctx: PanelCtx): PanelData {
  const byType = new Map<string, { total: number; count: number; names: Set<string> }>();
  let grandTotal = 0;
  for (const j of ctx.jobs) {
    grandTotal += j.amount;
    const e = byType.get(j.serviceType) ?? { total: 0, count: 0, names: new Set<string>() };
    e.total += j.amount; e.count += 1;
    if (j.contractorName) e.names.add(j.contractorName);
    byType.set(j.serviceType, e);
  }
  const sorted = Array.from(byType.entries()).sort((a, b) => b[1].total - a[1].total);
  const max = sorted[0]?.[1].total ?? 1;
  const rows: PanelRow[] = sorted.map(([type, e]) => ({
    lead: type,
    sub: `${e.count} JOB${e.count === 1 ? "" : "S"}${e.names.size ? " · " + Array.from(e.names).join(", ").toUpperCase() : ""}`,
    right: money(e.total), rightSub: grandTotal ? `${Math.round((e.total / grandTotal) * 100)}%` : "0%",
    tone: INK, hasBar: true, pct: `${Math.round((e.total / max) * 100)}%`, barColor: "#2B34FF",
  }));
  return {
    chip: "SPEND", count: money(grandTotal),
    asked: `You have spent ${money(grandTotal)} across ${byType.size} trade${byType.size === 1 ? "" : "s"}`,
    title: sorted.length ? `${sorted[0][0]} is the largest line` : "Nothing spent yet",
    sub: "All logged jobs, by trade.",
    cta: "See every line item",
    rows: rows.length ? rows : [{ lead: "No spend logged yet", sub: "LOG A JOB TO START TRACKING", right: "Add", rightSub: "", tone: BLUE, flow: "logJob" }],
  };
}

// ── ACTIVITY ─────────────────────────────────────────────────────────────

function buildActivity(ctx: PanelCtx): PanelData {
  const net = ctx.scoreEvents.reduce((s, e) => s + e.pts, 0);
  const rows: PanelRow[] = ctx.scoreEvents.slice(0, 10).map((e) => ({
    lead: e.label, sub: e.detail.toUpperCase(),
    right: e.pts > 0 ? `+${e.pts}` : String(e.pts), rightSub: shortDate(e.timestamp).toUpperCase(),
    tone: e.pts > 0 ? GOOD : e.pts < 0 ? BAD : MUTED,
  }));
  return {
    chip: "ACTIVITY", count: "",
    asked: "What has moved the score lately",
    title: `Net ${net >= 0 ? "+" : ""}${net} points recently`,
    sub: "Every event that moved the score, newest first.",
    cta: "Open the full log",
    rows: rows.length ? rows : [{ lead: "No score events yet", sub: "LOG YOUR FIRST JOB TO START THE LEDGER", right: "Add", rightSub: "", tone: BLUE, flow: "logJob" }],
  };
}

// ── BILLING ──────────────────────────────────────────────────────────────

function buildBilling(ctx: PanelCtx): PanelData {
  const isPro = ctx.planTier === "Pro" || ctx.planTier === "Premium";
  const rows: PanelRow[] = [
    ctx.agentQuotaExhausted
      ? { lead: "AI assistant calls", sub: `NO CALLS LEFT THIS ${isPro ? "DAY" : "WEEK"} · FALLS BACK TO CHAT`, right: "0 left", rightSub: "", tone: BAD }
      : ctx.agentCreditsLeft != null
      ? { lead: "AI assistant calls", sub: `RESETS EACH ${isPro ? "DAY" : "WEEK"}`, right: `${ctx.agentCreditsLeft} left`, rightSub: "", tone: ctx.agentCreditsLeft <= 2 ? WARN : INK }
      : { lead: "AI assistant calls", sub: "LOADING…", right: "—", rightSub: "", tone: MUTED },
    { lead: "The record", sub: `${ctx.jobs.length} JOBS · ${ctx.properties.length} PROPERT${ctx.properties.length === 1 ? "Y" : "IES"}`, right: "$0", rightSub: "NEVER CAPPED", tone: INK },
  ];
  if (!isPro) {
    rows.push({ lead: "HomeGentic Pro", sub: "20 PROPERTIES · UNLIMITED QUOTES · FORECASTING · PRIORITY VERIFICATION", right: "+$59", rightSub: "A YEAR", tone: BLUE, flow: "upgrade" });
  } else {
    rows.push({ lead: "HomeGentic Pro", sub: "ACTIVE · ANNUAL", right: "Active", rightSub: "", tone: GOOD });
  }
  return {
    chip: "BILLING", count: isPro ? "PRO" : "FREE",
    asked: isPro ? "You are on Pro" : "You are on the Free plan",
    title: isPro ? "Pro is active" : "One allowance is metered this week",
    sub: "The record itself is never capped and never charged.",
    cta: isPro ? "Manage the plan" : "Upgrade to Pro — $59 a year",
    rows,
  };
}

export function buildPanels(ctx: PanelCtx): Record<PanelKey, PanelData> {
  return {
    awaiting: buildAwaiting(ctx),
    score: buildScore(ctx),
    property: buildProperty(ctx),
    market: buildMarket(ctx),
    maint: buildMaint(ctx),
    jobs: buildJobs(ctx),
    pros: buildPros(ctx),
    sensors: buildSensors(ctx),
    safety: buildSafety(ctx),
    credits: buildSafety(ctx), // drill-through alias — same heuristic data, framed as credits
    docs: buildDocs(ctx),
    rooms: buildRooms(ctx),
    spend: buildSpend(ctx),
    activity: buildActivity(ctx),
    billing: buildBilling(ctx),
    add: {
      chip: "ADD", count: "", asked: "What are we adding?", title: "Add to the record",
      sub: "Pick one. Anything a contractor countersigns earns points.",
      cta: "Add a room",
      rows: [
        { lead: "A room or zone", sub: `${ctx.rooms.length} MAPPED`, right: "Add", rightSub: "ROOM", tone: BLUE, flow: "room" },
        { lead: "A job you had done", sub: "SENDS THE CONTRACTOR A SIGNATURE REQUEST", right: "Add", rightSub: "+4 PTS", tone: BLUE, flow: "logJob" },
        { lead: "A receipt or record", sub: `${ctx.jobs.filter((j) => !j.verified).length} RECORDS STILL NEED PROOF`, right: "Upload", rightSub: "DOCUMENT", tone: BLUE, flow: "receipt" },
        { lead: "A recurring service", sub: "LAWN, PEST, POOL AND MORE", right: "Add", rightSub: "SERVICE", tone: BLUE, flow: "recurring" },
        { lead: "A quote request", sub: "GOES OUT TO VERIFIED PROS · NO CALLS", right: "Request", rightSub: "QUOTE", tone: BLUE, flow: "quote" },
        { lead: "List this house for agent bids", sub: "AGENTS BID COMMISSION AND PRICE · COSTS YOU $0", right: "List", rightSub: "FOR SALE", tone: WARN, flow: "listing" },
      ],
    },
    listing: {
      chip: "SELL", count: "", asked: `Listing ${ctx.activeProperty?.address ?? "this property"} for agent bids`,
      title: "Let agents bid to list your house",
      sub: "Your verified record goes out. Agents bid their commission and suggested price.",
      cta: "Open the listing request",
      rows: [
        { lead: "What agents see", sub: "RECORD, PERMITS, SCORE · SEALED UNTIL YOU PICK", right: "Sealed", rightSub: "UNTIL YOU PICK", tone: BLUE },
        { lead: "What the record is worth here", sub: "DOCUMENTED VS UNVERIFIED", right: ctx.premium ? `${money(ctx.premium.low * 100)}–${money(ctx.premium.high * 100)}` : "—", rightSub: "AT SALE", tone: GOOD },
        { lead: "Start the listing request", sub: "SETS YOUR PRICE EXPECTATION AND WHAT'S RELEASED", right: "Start", rightSub: "", tone: WARN, flow: "listing" },
      ],
    },
  };
}
