import React, { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { MobileMaintenancePage } from "@/pages/MobileMaintenancePage";
import { usePropertyStore } from "@/store/propertyStore";
import { useJobStore } from "@/store/jobStore";
import {
  maintenanceService,
  type MaintenanceReport,
  type SystemPrediction,
  type AnnualTask,
  type ScheduleEntry,
} from "@/services/maintenance";
import {
  recurringService,
  SERVICE_TYPE_LABELS,
  FREQUENCY_LABELS,
  type RecurringService,
  type VisitLog,
} from "@/services/recurringService";
import { Send, X, ChevronDown, ChevronUp } from "lucide-react";
import { systemAgesService } from "@/services/systemAges";
import { useNavigate, useSearchParams } from "react-router-dom";
import SystemAgesModal from "@/components/SystemAgesModal";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;
const R = V2_RADIUS;

// ── Types ──────────────────────────────────────────────────────────────────────

type RecurringStatus = "active" | "due-soon" | "paused";

interface RecurringVisitDisplay {
  dateLabel: string;   // "AUG 26"
  note: string;
}

interface RecurringDisplay {
  id: string;
  name: string;
  intervalPill: string;   // "7d" | "3mo" | "6mo"
  frequencyLabel: string; // "Weekly" | "Quarterly" | "Semi-Annually"
  contractor: string;
  startDate: string;      // "Mar 2025"
  status: RecurringStatus;
  nextVisitLabel: string; // "Thu, Aug 27" | "Not scheduled"
  nextVisitShort?: string; // for skip button label "Aug 27"
  daysUntilNext: number;  // Infinity when paused
  visits: RecurringVisitDisplay[];
}

// Days between visits per frequency — mirrors MobileMaintenancePage's FREQ_DAYS.
const FREQ_DAYS: Record<string, number> = {
  Weekly: 7, BiWeekly: 14, Monthly: 30, Quarterly: 90, SemiAnnually: 180, Annually: 365,
};

const INTERVAL_PILL: Record<string, string> = {
  Weekly: "7d", BiWeekly: "14d", Monthly: "1mo", Quarterly: "3mo", SemiAnnually: "6mo", Annually: "1yr",
};

function monthYearLabel(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
}

/** Real recurring-service + visit-log data mapped to the row shape. No dollar
 *  amounts or verification flags exist in the backend, so those columns are
 *  dropped rather than faked. */
function toRecurringDisplay(svc: RecurringService, visits: VisitLog[]): RecurringDisplay {
  const sortedVisits = [...visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  const lastVisit    = sortedVisits[0]?.visitDate ?? null;
  const freqDays     = FREQ_DAYS[svc.frequency] ?? 30;
  const nextDate     = new Date(new Date(lastVisit ?? svc.startDate).getTime() + freqDays * 86400000);
  const daysUntilNext = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
  const paused       = svc.status === "Paused";
  const status: RecurringStatus = paused ? "paused" : daysUntilNext <= 7 ? "due-soon" : "active";

  return {
    id:             svc.id,
    name:           SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType,
    intervalPill:   INTERVAL_PILL[svc.frequency] ?? svc.frequency,
    frequencyLabel: FREQUENCY_LABELS[svc.frequency] ?? svc.frequency,
    contractor:     svc.providerName,
    startDate:      monthYearLabel(svc.startDate),
    status,
    nextVisitLabel: paused ? "Not scheduled" : nextDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    nextVisitShort: paused ? undefined : nextDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    daysUntilNext:  paused ? Infinity : daysUntilNext,
    visits: sortedVisits.map(v => ({
      dateLabel: new Date(v.visitDate).toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase(),
      note:      v.note ?? "Service visit logged.",
    })),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const SEASON_MONTHS: Record<string, number[]> = {
  Spring: [2, 3, 4], Summer: [5, 6, 7], Fall: [8, 9, 10], Winter: [11, 0, 1],
};

function taskDueDate(task: AnnualTask, index: number): Date {
  const now = new Date();
  const currentMonth = now.getMonth();
  if (task.season && SEASON_MONTHS[task.season]) {
    const seasonMonths = SEASON_MONTHS[task.season];
    const nextMonth = seasonMonths.find(m => m >= currentMonth) ?? seasonMonths[0];
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

function daysUntil(due: Date): number {
  return Math.round((due.getTime() - Date.now()) / 86400000);
}

/** No per-task "assigned pro" field exists on AnnualTask — infer it from real job
 *  history instead of guessing off keywords in the task name. */
function hasKnownPro(taskName: string, jobs: { serviceType: string; contractorName?: string }[]): boolean {
  const key = taskName.toLowerCase();
  return jobs.some(j => j.contractorName && (key.includes(j.serviceType.toLowerCase()) || j.serviceType.toLowerCase().includes(key)));
}

// Matches HomeGentic Maintenance.dc.html's three-tier chip: <=30d coral, 31-90d amber, else muted.
// "Overdue" (negative days) reuses the coral tier — the design never models a lapsed date.
function DaysChip({ days }: { days: number }) {
  const overdue = days < 0;
  const soon    = overdue || days <= 30;
  const later   = !soon && days <= 90;
  const color   = soon ? C.coralText : later ? C.amberText : C.muted;
  const bg      = soon ? C.orangeBg  : later ? C.amberBg   : C.neutralSurface;
  const border  = soon ? C.orangeBorder : later ? C.amberBorder : "#DDDFE6";
  return (
    <span style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.09em", color, background: bg, border: `1px solid ${border}`, borderRadius: R.pill, padding: "6px 11px", whiteSpace: "nowrap" }}>
      {overdue ? "OVERDUE" : `IN ${days} DAYS`}
    </span>
  );
}

function StatusBadge({ status }: { status: RecurringStatus }) {
  const map = {
    "active":   { label: "ACTIVE",   color: C.green, bg: C.greenBg, border: "#BFE3CE" },
    "due-soon": { label: "DUE SOON", color: C.amberText, bg: C.amberBg, border: C.amberBorder },
    "paused":   { label: "PAUSED",   color: C.muted, bg: C.neutralSurface, border: "#DDDFE6" },
  };
  const s = map[status];
  return (
    <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: s.color, background: s.bg, border: `1px solid ${s.border}`, borderRadius: R.pill, padding: "5px 9px" }}>
      {s.label}
    </span>
  );
}

function IntervalPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 48, height: 48, flexShrink: 0, borderRadius: 13, background: active ? C.blue : C.neutralSurface3 }}>
      <span style={{ fontFamily: F.mono, fontSize: 7.5, fontWeight: 700, letterSpacing: "0.1em", color: active ? "rgba(252,252,253,0.62)" : C.muted, lineHeight: 1 }}>EVERY</span>
      <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: active ? C.paper : C.ink, lineHeight: 1, marginTop: 3 }}>{label}</span>
    </div>
  );
}

// ── Maintenance chat ───────────────────────────────────────────────────────────

function MaintenanceChatPanel({ yearBuilt, propertyAddress, report }: { yearBuilt: number; propertyAddress: string; report: MaintenanceReport | null }) {
  interface Msg { role: "user" | "assistant"; text: string }
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Hi! I'm your HomeGentic Maintenance Advisor. Ask me anything about your home systems." },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages(m => [...m, { role: "user", text: msg }]);
    setLoading(true);
    try {
      let reply = "";
      setMessages(m => [...m, { role: "assistant", text: "…" }]);
      for await (const chunk of maintenanceService.chat(msg, { yearBuilt, propertyAddress, report: report ?? undefined })) {
        reply += chunk;
        setMessages(m => { const copy = [...m]; copy[copy.length - 1] = { role: "assistant", text: reply }; return copy; });
      }
    } catch {
      setMessages(m => { const copy = [...m]; copy[copy.length - 1] = { role: "assistant", text: "Sorry, couldn't reach the advisor." }; return copy; });
    } finally {
      setLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ maxWidth: "85%", alignSelf: m.role === "user" ? "flex-end" : "flex-start", padding: "0.625rem 0.875rem", background: m.role === "user" ? C.ink : "#fff", color: m.role === "user" ? "#fff" : C.ink, fontFamily: F.body, fontSize: "0.8125rem", lineHeight: 1.5, border: m.role === "assistant" ? `1px solid ${C.border}` : "none" }}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "0.75rem 1rem", display: "flex", gap: "0.5rem" }}>
        <input aria-label="Ask about your home systems" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder="Ask about your home systems…" disabled={loading} style={{ flex: 1, padding: "0.5rem 0.75rem", border: `1px solid ${C.border}`, fontFamily: F.body, fontSize: "0.8125rem", outline: "none", background: "white" }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "0.5rem 0.875rem", border: "none", background: C.blue, color: "white", cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.6 : 1 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ── AddToScheduleModal ─────────────────────────────────────────────────────────

function AddToScheduleModal({ pred, propertyId, onSave, onClose }: { pred: SystemPrediction; propertyId: string; onSave: (e: ScheduleEntry) => void; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const isUrgent    = pred.urgency === "Critical" || pred.urgency === "Soon";
  const defaultCost = isUrgent ? pred.estimatedCostLowCents : pred.serviceCallLowCents;
  const [year,  setYear]  = useState(String(currentYear + 1));
  const [month, setMonth] = useState("");
  const [desc,  setDesc]  = useState(isUrgent ? `${pred.systemName} replacement` : `${pred.systemName} service/inspection`);
  const [cost,  setCost]  = useState(String(Math.round(defaultCost / 100)));

  const save = async () => {
    const entry = await maintenanceService.createScheduleEntry(propertyId, pred.systemName, desc, Number(year), month ? Number(month) : undefined, cost ? Math.round(parseFloat(cost) * 100) : undefined);
    onSave(entry);
    onClose();
  };

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", fontFamily: F.body, fontSize: 13, border: `1px solid ${C.border}`, outline: "none", background: "#fff", color: C.ink, boxSizing: "border-box" };
  const lbl: React.CSSProperties = { display: "block", fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }} onClick={onClose}>
      <div style={{ background: "#fff", padding: "1.5rem", maxWidth: "26rem", width: "100%", border: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <p style={{ fontFamily: F.display, fontWeight: 700, fontSize: 16, color: C.ink, margin: 0 }}>Schedule {pred.systemName} Work</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div>
            <label htmlFor="ats-desc" style={lbl}>Task description</label>
            <input id="ats-desc" style={inp} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <div style={{ flex: 1 }}>
              <label htmlFor="ats-year" style={lbl}>Planned year *</label>
              <input id="ats-year" type="number" style={inp} value={year} min={currentYear} max={currentYear + 30} onChange={(e) => setYear(e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="ats-month" style={lbl}>Month (optional)</label>
              <select id="ats-month" style={inp} value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">Any</option>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="ats-cost" style={lbl}>Estimated cost ($)</label>
            <input id="ats-cost" type="number" style={inp} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "0.6rem", border: `1px solid ${C.border}`, background: "white", fontFamily: F.body, fontSize: 14, cursor: "pointer", color: C.muted }}>Cancel</button>
          <button onClick={save} disabled={!year || !desc} style={{ flex: 2, padding: "0.6rem", border: "none", background: C.ink, color: "white", fontFamily: F.body, fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: !year || !desc ? 0.6 : 1 }}>Save to Schedule</button>
        </div>
      </div>
    </div>
  );
}

// ── Recurring service row ──────────────────────────────────────────────────────

function RecurringRow({ svc }: { svc: RecurringDisplay }) {
  const [expanded, setExpanded] = useState(false);

  const colLabel: React.CSSProperties = {
    fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
    color: C.muted, textTransform: "uppercase", marginBottom: 3,
  };
  const colValue: React.CSSProperties = {
    fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink,
  };

  return (
    <div style={{ borderBottom: `1px solid ${C.border}` }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 24px" }}>
        <IntervalPill label={svc.intervalPill} active={svc.status === "active"} />

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: C.ink }}>{svc.name}</span>
            <StatusBadge status={svc.status} />
          </div>
          <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>
            {svc.frequencyLabel}
            {" · "}{svc.contractor}
            {" · "}started {svc.startDate}
          </div>
        </div>

        {/* Next visit */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={colLabel}>NEXT VISIT</div>
          <div style={{ ...colValue, color: svc.status === "due-soon" ? C.amberText : C.ink }}>
            {svc.nextVisitLabel}
          </div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 7, fontFamily: F.body, fontSize: 12.5, fontWeight: 600,
            color: expanded ? C.blue : C.ink, background: expanded ? C.lblue : C.paper,
            border: `1.5px solid ${expanded ? C.cobalTint : C.divider}`, borderRadius: R.pill,
            padding: "9px 16px", cursor: "pointer", flexShrink: 0,
          }}
        >
          {expanded ? "Hide" : "History"} {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expanded: visit log + actions */}
      {expanded && (
        <div style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}>
          {svc.visits.length > 0 ? (
            <div>
              {/* Visit log header */}
              <div style={{ display: "grid", gridTemplateColumns: "78px minmax(0,1fr)", gap: 14, padding: "11px 24px 9px", borderBottom: `1px solid ${C.border}` }}>
                {["DATE", "NOTES"].map(h => (
                  <span key={h} style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.09em", color: C.muted }}>{h}</span>
                ))}
              </div>
              {svc.visits.map((v, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "78px minmax(0,1fr)", gap: 14, alignItems: "center", padding: "12px 24px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.ink }}>{v.dateLabel}</span>
                  <span style={{ fontFamily: F.body, fontSize: 13, color: C.ink }}>{v.note}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "16px 24px" }}>
              <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, margin: 0 }}>No visits logged yet.</p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 9, padding: "14px 24px", flexWrap: "wrap" }}>
            {svc.nextVisitShort && svc.status !== "paused" && (
              <button style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.paper, border: `1.5px solid ${C.divider}`, borderRadius: R.pill, padding: "10px 17px", cursor: "pointer" }}>
                Skip {svc.nextVisitShort}
              </button>
            )}
            {svc.status !== "paused" && (
              <button style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.paper, border: `1.5px solid ${C.divider}`, borderRadius: R.pill, padding: "10px 17px", cursor: "pointer" }}>
                Pause for the season
              </button>
            )}
            {svc.status === "paused" && (
              <button style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: C.green, background: C.greenBg, border: `1.5px solid #BFE3CE`, borderRadius: R.pill, padding: "10px 17px", cursor: "pointer" }}>
                Resume service
              </button>
            )}
            <button style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.paper, border: `1.5px solid ${C.divider}`, borderRadius: R.pill, padding: "10px 17px", cursor: "pointer" }}>
              Change cadence
            </button>
            <button style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: C.coralText, background: C.paper, border: `1.5px solid ${C.orangeBorder}`, borderRadius: R.pill, padding: "10px 17px", cursor: "pointer" }}>
              End contract
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PredictiveMaintenancePage() {
  const { isMobile, isTablet } = useBreakpoint();
  const { properties } = usePropertyStore();
  const { jobs }       = useJobStore();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkSystem = searchParams.get("system");

  const [selectedId]     = useState(String(properties[0]?.id ?? ""));
  const [showSystemAges, setShowSystemAges] = useState(false);
  const [report,         setReport]         = useState<MaintenanceReport | null>(null);
  const [, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleTarget,  setScheduleTarget]  = useState<SystemPrediction | null>(null);
  const [recurring,       setRecurring]       = useState<RecurringService[]>([]);
  const [visitLogMap,     setVisitLogMap]     = useState<Record<string, VisitLog[]>>({});

  const property = properties.find(p => String(p.id) === selectedId);
  const propJobs = jobs.filter(j => j.propertyId === selectedId);

  useEffect(() => {
    if (!property) return;
    const systemAges = systemAgesService.get(selectedId);
    setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs, systemAges, String(property.state)));
    maintenanceService.getScheduleByProperty(String(property.id)).then(setScheduleEntries);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    recurringService.getByProperty(selectedId).then(async (svcs) => {
      if (cancelled) return;
      setRecurring(svcs);
      const entries = await Promise.all(
        svcs.map(async (s) => [s.id, await recurringService.getVisitLogs(s.id).catch(() => [])] as [string, VisitLog[]])
      );
      if (!cancelled) setVisitLogMap(Object.fromEntries(entries));
    }).catch(() => { if (!cancelled) { setRecurring([]); setVisitLogMap({}); } });
    return () => { cancelled = true; };
  }, [selectedId]);

  React.useEffect(() => {
    if (!deepLinkSystem || !report) return;
    const pred = report.systemPredictions.find(p => p.systemName.toLowerCase() === deepLinkSystem.toLowerCase());
    if (pred) setScheduleTarget(pred);
  }, [deepLinkSystem, report]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScheduleSave = (entry: ScheduleEntry) => setScheduleEntries(prev => [...prev, entry]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const allTasks      = report?.annualTasks ?? [];
  const criticalPreds = report?.systemPredictions.filter(p => p.urgency === "Critical") ?? [];

  // Sorted chronologically so the headline count always matches what's actually
  // rendered below — an unsorted list let due-soon tasks fall past the slice(0, 8) cutoff.
  const upcomingTasksWithDates = allTasks
    .map((t, i) => ({ task: t, due: taskDueDate(t, i) }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const dueSoonCount = upcomingTasksWithDates.filter(({ due }) => daysUntil(due) <= 30).length + criticalPreds.length;

  // Recurring service counts
  const recurringServices = recurring
    .filter(s => s.status !== "Cancelled")
    .map(s => toRecurringDisplay(s, visitLogMap[s.id] ?? []));
  const activeRecurring   = recurringServices.filter(s => s.status === "active" || s.status === "due-soon");
  const pausedCount       = recurringServices.filter(s => s.status === "paused").length;
  const recurringVisitsDue30 = recurringServices.filter(s => s.daysUntilNext <= 30).length;

  // Seasonal tips
  const month  = new Date().getMonth();
  const season = month >= 2 && month <= 4 ? "Spring" : month >= 5 && month <= 7 ? "Summer" : month >= 8 && month <= 10 ? "Fall" : "Winter";
  const climate = property?.state === "TN" || property?.state === "NC" || property?.state === "VA" ? "Mixed-Humid" : "Zone";

  const SEASONAL_TIPS: { title: string; desc: string }[] = month >= 8 && month <= 10
    ? [
        { title: "Clear gutters before autumn rain",        desc: "Mixed humid climate zone. Leaf drop starts mid-October in Nashville." },
        { title: "Service the HVAC before the switchover",  desc: "Cooling to heating changeover is the most common failure window." },
        { title: "Check crawlspace humidity",               desc: "Vapor barrier went in June 2026. Confirm it is holding under 60 percent." },
      ]
    : month >= 5 && month <= 7
    ? [
        { title: "Schedule AC tune-up before peak heat",    desc: "Summer is the busiest time for HVAC calls — book early." },
        { title: "Inspect roof for winter damage",          desc: "Look for lifted shingles or damaged flashing before rain season." },
        { title: "Test smoke and CO detectors",             desc: "Detector lifespan is 10 years. Check manufacture date." },
      ]
    : [
        { title: "Schedule furnace tune-up",                desc: "Pre-season service prevents 80% of heating breakdowns." },
        { title: "Check weatherstripping and seals",        desc: "Gaps around doors and windows are the largest heating loss." },
        { title: "Flush water heater sediment",             desc: "Annual flush extends tank life by 3–5 years." },
      ];

  // Next recurring visit — soonest active/due-soon service's real due date
  const soonestDays = activeRecurring.reduce((min, s) => Math.min(min, s.daysUntilNext), Infinity);
  const nextVisitDaysMsg = Number.isFinite(soonestDays)
    ? `next visit in ${Math.max(soonestDays, 0)} day${Math.max(soonestDays, 0) !== 1 ? "s" : ""}`
    : "";

  if (isMobile) {
    return (
      <Layout>
        <MobileMaintenancePage />
      </Layout>
    );
  }

  return (
    <Layout>
      <div style={{ background: C.page, minHeight: "100%", padding: isTablet ? "20px 20px" : "28px 32px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>
              MAINTENANCE
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 900, fontSize: "clamp(1.375rem, 3vw, 1.875rem)", color: C.ink, letterSpacing: "-0.025em", margin: 0 }}>
              {recurringVisitsDue30} recurring visit{recurringVisitsDue30 !== 1 ? "s" : ""} and {dueSoonCount} task{dueSoonCount !== 1 ? "s" : ""} due in 30 days
            </h1>
          </div>
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: F.body, fontSize: 13.5, fontWeight: 600, color: C.paper, background: C.blue, border: "none", borderRadius: R.pill, padding: "12px 22px", cursor: "pointer" }}>
              Log work
            </button>
            <button onClick={() => navigate("/dashboard")} style={{ fontFamily: F.body, fontSize: 13.5, fontWeight: 600, color: C.ink, background: C.paper, border: `1.5px solid ${C.divider}`, borderRadius: R.pill, padding: "12px 20px", cursor: "pointer" }}>
              Back to dashboard
            </button>
          </div>
        </div>

        {/* ── Recurring services ─────────────────────────────────────────────── */}
        <div style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: R.card, boxShadow: V2_SHADOWS.card, marginBottom: 18, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "15px 24px", borderBottom: `1px solid ${C.border}`, flexWrap: "wrap", gap: 16 }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.11em", color: C.muted }}>
              RECURRING SERVICES · {recurringServices.length} contracts · {pausedCount} paused{nextVisitDaysMsg ? ` · ${nextVisitDaysMsg}` : ""}
            </span>
            <button onClick={() => navigate("/recurring/new")} style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: C.ink, background: C.paper, border: `1.5px solid ${C.divider}`, borderRadius: R.pill, padding: "9px 17px", cursor: "pointer" }}>
              Add service
            </button>
          </div>
          {recurringServices.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>No recurring services yet.</p>
            </div>
          ) : (
            recurringServices.map(svc => (
              <RecurringRow key={svc.id} svc={svc} />
            ))
          )}
        </div>

        {/* ── Scheduled tasks (always shown; empty state when no property/predictions) ── */}
        <div style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: R.card, boxShadow: V2_SHADOWS.card, marginBottom: 18, overflow: "hidden" }}>
          {/* Section header */}
          <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.muted }}>
              SCHEDULED TASKS
            </span>
            <span style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginLeft: 8 }}>
              One-time and seasonal work, outside your recurring contracts.
            </span>
          </div>
          {properties.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>Add a property to see maintenance predictions.</p>
            </div>
          ) : (<>

              {upcomingTasksWithDates.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center" }}>
                  <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>No tasks generated yet. Set your system ages to get predictions.</p>
                  <button onClick={() => setShowSystemAges(true)} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer", marginTop: 8 }}>
                    Update system ages →
                  </button>
                </div>
              ) : (
                upcomingTasksWithDates.slice(0, 8).map(({ task, due }, i) => {
                  const days   = daysUntil(due);
                  const soon   = days <= 30;
                  const hasPro = hasKnownPro(task.task, propJobs);
                  const matchedPred = report?.systemPredictions.find(p =>
                    task.task.toLowerCase().includes(p.systemName.toLowerCase())
                  );

                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 20, padding: "18px 24px", borderBottom: `1px solid ${C.border}`, background: soon ? C.orangeRowTint : "#fff" }}>
                      {/* Date bubble */}
                      <div style={{ width: 44, flexShrink: 0, textAlign: "center" }}>
                        <div style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: 700, color: C.muted, letterSpacing: "0.08em" }}>
                          {due.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
                        </div>
                        <div style={{ fontFamily: F.display, fontSize: 21, fontWeight: 900, color: soon ? C.coralText : C.ink, lineHeight: 1.05, letterSpacing: "-0.02em", marginTop: 4 }}>
                          {due.getDate()}
                        </div>
                      </div>

                      {/* Task details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                          {task.task}
                        </div>
                        <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.muted, marginBottom: 4, lineHeight: 1.55 }}>
                          {task.frequency}
                          {matchedPred ? ` · ${matchedPred.recommendation}` : ""}
                        </div>
                      </div>

                      <DaysChip days={days} />

                      {hasPro ? (
                        <button onClick={() => navigate("/quotes/new")} style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: soon ? C.paper : C.ink, background: soon ? C.blue : C.paper, border: `1.5px solid ${soon ? C.blue : C.divider}`, borderRadius: R.pill, padding: "10px 18px", cursor: "pointer", whiteSpace: "nowrap" }}>
                          Book
                        </button>
                      ) : (
                        <button onClick={() => navigate("/contractors")} style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: soon ? C.paper : C.ink, background: soon ? C.blue : C.paper, border: `1.5px solid ${soon ? C.blue : C.divider}`, borderRadius: R.pill, padding: "10px 18px", cursor: "pointer", whiteSpace: "nowrap" }}>
                          Find pro
                        </button>
                      )}
                    </div>
                  );
                })
              )}

              {/* Critical predictions */}
              {criticalPreds.map((pred, i) => (
                <div key={`crit-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 20, padding: "18px 24px", borderBottom: `1px solid ${C.border}`, background: C.orangeRowTint }}>
                  <div style={{ width: 44, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: 700, color: C.coralText }}>NOW</div>
                    <div style={{ fontFamily: F.display, fontSize: 21, fontWeight: 900, color: C.coralText, lineHeight: 1.05 }}>!</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                      {pred.systemName} replacement needed
                    </div>
                    <div style={{ fontFamily: F.body, fontSize: 12.5, color: C.muted }}>
                      {Math.abs(pred.yearsRemaining)} year{Math.abs(pred.yearsRemaining) !== 1 ? "s" : ""} past rated life · {maintenanceService.formatCents(pred.estimatedCostLowCents)}–{maintenanceService.formatCents(pred.estimatedCostHighCents)} estimated
                    </div>
                  </div>
                  <span style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.09em", color: C.coralText, background: C.orangeBg, border: `1px solid ${C.orangeBorder}`, borderRadius: R.pill, padding: "6px 11px" }}>OVERDUE</span>
                  <button onClick={() => navigate("/quotes/new")} style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: C.paper, background: C.coralText, border: "none", borderRadius: R.pill, padding: "10px 18px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    Get quotes
                  </button>
                </div>
              ))}
            </>) /* end properties guard */}
        </div> {/* end scheduled tasks */}

        {/* ── Seasonal tips ──────────────────────────────────────────────── */}
        <div style={{ border: `1px solid ${C.amberBorder}`, background: C.attentionBg, borderRadius: R.card, padding: "20px 24px" }}>
          <div style={{ fontFamily: F.mono, fontSize: 9.5, fontWeight: 700, color: C.amberText, letterSpacing: "0.13em", textTransform: "uppercase", marginBottom: 17 }}>
            SEASONAL · {climate.toUpperCase()} · {season.toUpperCase()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr 1fr" : "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
            {SEASONAL_TIPS.map((tip, i) => (
              <div key={i}>
                <div style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{tip.title}</div>
                <div style={{ fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{tip.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Maintenance advisor chat ──────────────────────────────────────── */}
        {property && (
          <div style={{ border: `1px solid ${C.border}`, background: "#fff", borderRadius: R.card, boxShadow: V2_SHADOWS.card, marginTop: 18, overflow: "hidden" }}>
            <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}` }}>
              <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.muted }}>
                MAINTENANCE ADVISOR
              </span>
              <span style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginLeft: 8 }}>
                Ask about your systems, schedules, or what to do next.
              </span>
            </div>
            <div style={{ height: 420 }}>
              <MaintenanceChatPanel
                yearBuilt={Number(property.yearBuilt)}
                propertyAddress={property.address}
                report={report}
              />
            </div>
          </div>
        )}
      </div>

      {scheduleTarget && property && (
        <AddToScheduleModal pred={scheduleTarget} propertyId={String(property.id)} onSave={handleScheduleSave} onClose={() => setScheduleTarget(null)} />
      )}

      <SystemAgesModal
        open={showSystemAges}
        onClose={() => setShowSystemAges(false)}
        propertyId={selectedId}
        yearBuilt={property ? Number(property.yearBuilt) : new Date().getFullYear() - 20}
        onSuccess={() => {
          if (property) {
            const updatedAges = systemAgesService.get(selectedId);
            setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs, updatedAges, String(property.state)));
          }
        }}
      />
    </Layout>
  );
}
