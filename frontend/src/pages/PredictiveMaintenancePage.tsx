import React, { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
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
  Send, Wrench, X, Settings2, Download,
  ChevronLeft, ChevronRight, CheckCircle2, ArrowRight,
  BarChart2, CalendarDays, DollarSign, Bot,
} from "lucide-react";
import { systemAgesService } from "@/services/systemAges";
import { useNavigate, useSearchParams } from "react-router-dom";
import { paymentService } from "@/services/payment";
import SystemAgesModal from "@/components/SystemAgesModal";
import { COLORS, FONTS } from "@/theme";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:       COLORS.canvas,
  card:     "#FFFFFF",
  border:   "#E5E7EB",
  text:     COLORS.plum,
  muted:    COLORS.plumMid,
  green:    COLORS.sageText,
  greenBg:  COLORS.sageLight,
  greenBdr: COLORS.sageMid,
  blue:     "#2563EB",
  blueBg:   "#EFF6FF",
  orange:   "#D97706",
  orangeBg: "#FFFBEB",
  red:      COLORS.errorText,
  redBg:    "#FEF2F2",
  shadow:   "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
};

// Kept for AddToScheduleModal / MaintenanceChatPanel internals
const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
};

// ─── Local components ──────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: "0.75rem", boxShadow: C.shadow, ...style }}>
      {children}
    </div>
  );
}

function HealthGauge({ score, grade }: { score: number; grade: string }) {
  const r = 40, circ = 2 * Math.PI * r;
  const color = score >= 70 ? C.green : score >= 50 ? C.orange : C.red;
  return (
    <div style={{ position: "relative", width: 90, height: 90 }}>
      <svg width={90} height={90} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={45} cy={45} r={r} fill="none" stroke="#E5E7EB" strokeWidth={9} />
        <circle cx={45} cy={45} r={r} fill="none" stroke={color} strokeWidth={9}
          strokeDasharray={`${Math.min(score / 100, 1) * circ} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.25rem", color: C.text, lineHeight: 1 }}>{score}</div>
        <div style={{ fontFamily: FONTS.sans, fontSize: "0.625rem", color, fontWeight: 600 }}>{grade}</div>
      </div>
    </div>
  );
}

function MiniCalendar({ scheduleEntries }: { scheduleEntries: ScheduleEntry[] }) {
  const [viewDate, setViewDate] = useState(() => new Date());
  const yr = viewDate.getFullYear(), mo = viewDate.getMonth();
  const firstDay = new Date(yr, mo, 1).getDay();
  const daysInMonth = new Date(yr, mo + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === yr && today.getMonth() === mo;

  const eventsByDay = new Map<number, "completed" | "scheduled">();
  for (const e of scheduleEntries) {
    const d = entryDate(e);
    if (d.getFullYear() === yr && d.getMonth() === mo) {
      eventsByDay.set(d.getDate(), e.isCompleted ? "completed" : "scheduled");
    }
  }

  const monthLabel = viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const navBtn: React.CSSProperties = { background: "none", border: `1px solid ${C.border}`, borderRadius: "0.375rem", width: 28, height: 28, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.muted };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.875rem" }}>
        <button style={navBtn} onClick={() => setViewDate(new Date(yr, mo - 1, 1))}><ChevronLeft size={14} /></button>
        <span style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", color: C.text }}>{monthLabel}</span>
        <button style={navBtn} onClick={() => setViewDate(new Date(yr, mo + 1, 1))}><ChevronRight size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: "0.375rem" }}>
        {["SUN","MON","TUE","WED","THU","FRI","SAT"].map(d => (
          <div key={d} style={{ textAlign: "center", fontFamily: FONTS.sans, fontSize: "0.5625rem", color: C.muted, fontWeight: 600, padding: "2px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: "2px" }}>
        {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const ev = eventsByDay.get(day);
          const isToday = isCurrentMonth && day === today.getDate();
          const evColor = ev === "completed" ? C.blue : C.green;
          return (
            <div key={day} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "2px 0" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: isToday ? C.blue : "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: isToday ? "white" : C.text, lineHeight: 1 }}>{day}</div>
                {ev && <div style={{ width: 4, height: 4, borderRadius: "50%", background: isToday ? "rgba(255,255,255,0.7)" : evColor, marginTop: "1px" }} />}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "1rem", marginTop: "0.875rem", justifyContent: "center" }}>
        {[{ color: C.orange, label: "Due Soon" }, { color: C.green, label: "Scheduled" }, { color: C.blue, label: "Completed" }].map(({ color, label }) => (
          <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
            <span style={{ fontFamily: FONTS.sans, fontSize: "0.6875rem", color: C.muted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function entryDate(e: ScheduleEntry): Date {
  const month = e.plannedMonth !== undefined ? e.plannedMonth - 1 : 0;
  return new Date(e.plannedYear, month, 1);
}

// ─── AddToScheduleModal ────────────────────────────────────────────────────────

function AddToScheduleModal({ pred, propertyId, onSave, onClose }: { pred: SystemPrediction; propertyId: string; onSave: (e: ScheduleEntry) => void; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const isUrgent    = pred.urgency === "Critical" || pred.urgency === "Soon";
  const defaultCost = isUrgent ? pred.estimatedCostLowCents : pred.serviceCallLowCents;
  const [year, setYear]   = useState(String(currentYear + 1));
  const [month, setMonth] = useState("");
  const [desc, setDesc]   = useState(isUrgent ? `${pred.systemName} replacement` : `${pred.systemName} service/inspection`);
  const [cost, setCost]   = useState(String(Math.round(defaultCost / 100)));

  const save = async () => {
    const entry = await maintenanceService.createScheduleEntry(propertyId, pred.systemName, desc, Number(year), month ? Number(month) : undefined, cost ? Math.round(parseFloat(cost) * 100) : undefined);
    onSave(entry);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }} onClick={onClose}>
      <div style={{ background: COLORS.white, padding: "1.5rem", maxWidth: "26rem", width: "100%", borderRadius: "0.75rem", border: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <p style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>
            Schedule {pred.systemName} Work
          </p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div>
            <label className="form-label">Task description</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} className="form-input" />
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <div style={{ flex: 1 }}>
              <label className="form-label">Planned year *</label>
              <input type="number" value={year} min={currentYear} max={currentYear + 30} onChange={(e) => setYear(e.target.value)} className="form-input" />
            </div>
            <div style={{ flex: 1 }}>
              <label className="form-label">Month (optional)</label>
              <select value={month} onChange={(e) => setMonth(e.target.value)} className="form-input">
                <option value="">Any</option>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Estimated cost ($)</label>
            <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" className="form-input" />
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "0.6rem", border: `1px solid ${C.border}`, background: "white", fontFamily: FONTS.sans, fontSize: "0.875rem", cursor: "pointer", color: C.muted, borderRadius: "0.5rem" }}>
            Cancel
          </button>
          <button onClick={save} disabled={!year || !desc} style={{ flex: 2, padding: "0.6rem", border: "none", background: C.blue, color: "white", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", borderRadius: "0.5rem", opacity: !year || !desc ? 0.6 : 1 }}>
            Save to Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Maintenance Chat ──────────────────────────────────────────────────────────

function MaintenanceChatPanel({ yearBuilt, propertyAddress, report }: { yearBuilt: number; propertyAddress: string; report: MaintenanceReport | null }) {
  interface Msg { role: "user" | "assistant"; text: string }
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Hi! I'm your HomeGentic Maintenance Advisor. Ask me anything about your home systems — what to prioritize, cost estimates, DIY tips, or when to call a pro." },
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
      setMessages(m => { const copy = [...m]; copy[copy.length - 1] = { role: "assistant", text: "Sorry, I couldn't reach the advisor. Make sure the agent server is running." }; return copy; });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {messages.map((m, i) => (
          <div key={i} style={{ maxWidth: "85%", alignSelf: m.role === "user" ? "flex-end" : "flex-start", padding: "0.625rem 0.875rem", background: m.role === "user" ? UI.ink : UI.paper, color: m.role === "user" ? COLORS.white : UI.ink, fontFamily: FONTS.sans, fontSize: "0.8125rem", lineHeight: 1.5, borderRadius: "0.5rem" }}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "0.75rem 1rem", display: "flex", gap: "0.5rem" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder="Ask about your home systems…" disabled={loading} style={{ flex: 1, padding: "0.5rem 0.75rem", border: `1px solid ${C.border}`, borderRadius: "0.5rem", fontFamily: FONTS.sans, fontSize: "0.8125rem", outline: "none", background: "white" }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "0.5rem 0.875rem", border: "none", background: C.blue, color: "white", borderRadius: "0.5rem", cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.6 : 1 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SEASON_MONTHS: Record<string, number[]> = {
  Spring: [2, 3, 4], Summer: [5, 6, 7], Fall: [8, 9, 10], Winter: [11, 0, 1],
};

function taskDueDate(task: AnnualTask, index: number): Date {
  const now = new Date();
  const currentMonth = now.getMonth();
  // Find next occurrence based on season or frequency
  if (task.season && SEASON_MONTHS[task.season]) {
    const seasonMonths = SEASON_MONTHS[task.season];
    // Find next season month >= current month, or wrap to next year
    const nextMonth = seasonMonths.find(m => m >= currentMonth) ?? seasonMonths[0];
    const d = new Date(now.getFullYear(), nextMonth, 15);
    if (d < now) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  // No season — distribute across the year based on frequency
  const freqMonths: Record<string, number> = { Quarterly: 3, "Semi-annually": 6, Annually: 12 };
  const interval = Object.entries(freqMonths).find(([k]) => task.frequency?.includes(k.split("-")[0]))?.[1] ?? 12;
  const d = new Date(now.getFullYear(), (currentMonth + interval + index) % 12, 10);
  if (d < now) d.setMonth(d.getMonth() + interval);
  return d;
}

function taskStatus(due: Date): { label: string; color: string } {
  const ms = due.getTime() - Date.now();
  if (ms < 0)                return { label: "Overdue",   color: C.red };
  if (ms < 30 * 86_400_000)  return { label: "Due Soon",  color: C.orange };
  return                            { label: "Upcoming",  color: C.muted };
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type MaintenanceFilter = "all" | "dueSoon" | "overdue" | "scheduled";

export default function PredictiveMaintenancePage() {
  const { properties } = usePropertyStore();
  const { jobs }       = useJobStore();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkSystem = searchParams.get("system");

  const [selectedId, setSelectedId]         = useState(String(properties[0]?.id ?? ""));
  const [showSystemAges, setShowSystemAges] = useState(false);
  const [showChatPanel, setShowChatPanel]   = useState(false);
  const [report, setReport]                 = useState<MaintenanceReport | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleTarget, setScheduleTarget]   = useState<SystemPrediction | null>(null);
  const [maintenanceFilter, setMaintenanceFilter] = useState<MaintenanceFilter>("all");

  const property = properties.find(p => String(p.id) === selectedId);
  const propJobs = jobs.filter(j => j.propertyId === selectedId);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    if (!property) return;
    const systemAges = systemAgesService.get(selectedId);
    setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs, systemAges, String(property.state)));
    maintenanceService.getScheduleByProperty(String(property.id)).then(setScheduleEntries);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open schedule modal from deep-link
  React.useEffect(() => {
    if (!deepLinkSystem || !report) return;
    const pred = report.systemPredictions.find(p => p.systemName.toLowerCase() === deepLinkSystem.toLowerCase());
    if (pred) setScheduleTarget(pred);
  }, [deepLinkSystem, report]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScheduleSave  = (entry: ScheduleEntry) => setScheduleEntries(prev => [...prev, entry]);
  const handleComplete      = async (id: string) => { await maintenanceService.markCompleted(id); setScheduleEntries(prev => prev.map(e => e.id === id ? { ...e, isCompleted: true } : e)); };
  const handleDelete        = (id: string) => { maintenanceService.deleteEntry(id); setScheduleEntries(prev => prev.filter(e => e.id !== id)); };

  // ── Derived values ───────────────────────────────────────────────────────────
  const allTasks   = report?.annualTasks ?? [];
  const criticalPreds = report?.systemPredictions.filter(p => p.urgency === "Critical") ?? [];
  const soonPreds     = report?.systemPredictions.filter(p => p.urgency === "Soon") ?? [];

  const goodFraction = report
    ? report.systemPredictions.filter(p => p.urgency === "Good" || p.urgency === "Watch").length / Math.max(report.systemPredictions.length, 1)
    : 0;
  const healthScore = Math.round(50 + goodFraction * 50);
  const healthGrade = healthScore >= 80 ? "Good" : healthScore >= 65 ? "Fair" : "Poor";
  const healthDelta = soonPreds.length === 0 && criticalPreds.length === 0 ? 6 : -soonPreds.length;

  const upcomingTasksWithDates = allTasks.map((t, i) => {
    const due = taskDueDate(t, i);
    const status = taskStatus(due);
    return { task: t, due, status };
  });

  const filteredTasks = upcomingTasksWithDates.filter(({ status }) => {
    if (maintenanceFilter === "all")       return true;
    if (maintenanceFilter === "dueSoon")   return status.label === "Due Soon";
    if (maintenanceFilter === "overdue")   return status.label === "Overdue";
    if (maintenanceFilter === "scheduled") return status.label === "Upcoming";
    return true;
  });

  const dueSoonCount  = upcomingTasksWithDates.filter(t => t.status.label === "Due Soon").length + criticalPreds.length;
  const completedThisYear = scheduleEntries.filter(e => e.isCompleted && entryDate(e).getFullYear() === currentYear).length;
  const budgetTotal   = report ? Math.round((report.totalBudgetLowCents + report.totalBudgetHighCents) / 2 / 100) : 0;
  const potentialSavings = Math.round(criticalPreds.reduce((s, p) => s + p.estimatedCostLowCents * 0.2, 0) / 100 + soonPreds.reduce((s, p) => s + p.serviceCallLowCents * 0.5, 0) / 100);

  const completedHistory = scheduleEntries
    .filter(e => e.isCompleted)
    .sort((a, b) => entryDate(b).getTime() - entryDate(a).getTime())
    .slice(0, 4);

  const insights = React.useMemo(() => {
    if (!report) return [];
    const list = [];
    if (criticalPreds.length > 0) {
      list.push({ icon: "⚡", type: "warning" as const, title: `Your ${criticalPreds[0].systemName} needs attention.`, desc: `This system is ${Math.abs(criticalPreds[0].yearsRemaining)} year(s) past its expected service life. Schedule maintenance to prevent costly repairs.`, action: "Get Quotes →", navTo: `/quotes/new?system=${encodeURIComponent(criticalPreds[0].systemName)}` });
    }
    if (soonPreds.length > 0) {
      list.push({ icon: "🔧", type: "info" as const, title: `${soonPreds[0].systemName} service recommended.`, desc: `Proactive maintenance can extend your system's life and keep your warranty valid. Estimated service: ${maintenanceService.formatCents(soonPreds[0].serviceCallLowCents)}–${maintenanceService.formatCents(soonPreds[0].serviceCallHighCents)}.`, action: "View Tasks" });
    }
    const month = new Date().getMonth();
    if (list.length < 2) {
      const seasonal = month >= 8 && month <= 10
        ? { icon: "🍂", type: "tip" as const, title: "Fall maintenance checklist.", desc: "Clean gutters, check seals and weatherstripping, and schedule a furnace tune-up before cold weather arrives.", action: "View Tasks" }
        : month >= 2 && month <= 4
        ? { icon: "🌸", type: "tip" as const, title: "Spring maintenance checklist.", desc: "Check roof and attic after winter. Test AC system before summer heat. Clean dryer vents and inspect foundation.", action: "View Tasks" }
        : { icon: "🌤️", type: "tip" as const, title: "Seasonal maintenance tip.", desc: "Based on your location, consider checking seals, weatherstripping, and HVAC filters before the next season.", action: "View Tasks" };
      list.push(seasonal);
    }
    return list.slice(0, 2);
  }, [report]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout>
      <style>{`
        @media print {
          body > * { display: none !important; }
          #hf-print-calendar { display: block !important; }
          #hf-print-calendar { font-family: ${FONTS.sans}; color: ${COLORS.plum}; padding: 2rem; }
          .hf-print-header { margin-bottom: 1.5rem; border-bottom: 2px solid ${COLORS.plum}; padding-bottom: 0.75rem; }
          .hf-print-header h1 { font-size: 1.6rem; font-weight: 900; margin: 0 0 0.25rem; }
          .hf-print-section { margin-bottom: 1.5rem; }
          .hf-print-section-title { font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; border-bottom: 1px solid ${COLORS.rule}; padding-bottom: 0.25rem; margin-bottom: 0.5rem; }
          .hf-print-row { display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px dotted ${COLORS.rule}; font-size: 0.72rem; }
          .hf-print-footer { margin-top: 2rem; font-size: 0.55rem; color: ${COLORS.plumMid}; border-top: 1px solid ${COLORS.rule}; padding-top: 0.5rem; }
        }
        @media screen { #hf-print-calendar { display: none; } }
      `}</style>

      <div style={{ padding: "1.5rem 2rem", background: C.bg, minHeight: "100vh" }}>

        {/* ── Page header ────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1.625rem", color: C.text, margin: 0 }}>
              Predictive Maintenance
            </h1>
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, marginTop: "0.25rem", marginBottom: 0 }}>
              AI-powered insights to keep your home in top condition and avoid costly repairs.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            {properties.length > 1 && (
              <select value={selectedId} onChange={e => setSelectedId(e.target.value)} style={{ padding: "0.5rem 0.75rem", border: `1px solid ${C.border}`, borderRadius: "0.5rem", fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, background: "white", cursor: "pointer" }}>
                {properties.map(p => <option key={String(p.id)} value={String(p.id)}>{p.address}</option>)}
              </select>
            )}
            <button
              onClick={() => setShowSystemAges(true)}
              style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 500, color: C.text, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem 1rem", cursor: "pointer" }}
            >
              <Settings2 size={15} /> Maintenance Settings
            </button>
            <button onClick={() => window.print()} style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem 0.75rem", cursor: "pointer" }}>
              <Download size={15} />
            </button>
          </div>
        </div>

        {properties.length === 0 ? (
          <Card style={{ padding: "3rem", textAlign: "center" }}>
            <Wrench size={32} color={C.muted} style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>Add a property to see maintenance predictions.</p>
          </Card>
        ) : (
          <>
            {/* ── KPI cards ─────────────────────────────────────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "1rem", marginBottom: "1.25rem" }}>

              {/* Overall Health Score */}
              <Card style={{ padding: "1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted, alignSelf: "flex-start" }}>Overall Health Score</span>
                <HealthGauge score={healthScore} grade={healthGrade} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: healthDelta >= 0 ? C.green : C.red, fontWeight: 600 }}>
                    {healthDelta >= 0 ? "↑" : "↓"} {Math.abs(healthDelta)} pts
                  </div>
                  <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>vs last month</div>
                </div>
                <button onClick={() => setShowSystemAges(true)} style={{ width: "100%", fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer" }}>
                  View Full Report
                </button>
              </Card>

              {/* Upcoming Tasks */}
              <Card style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>Upcoming Tasks</span>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.orangeBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Wrench size={15} color={C.orange} />
                  </div>
                </div>
                <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "2rem", color: C.text, lineHeight: 1 }}>{dueSoonCount}</div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.orange, fontWeight: 600, marginTop: "0.25rem" }}>Due Soon</div>
                {upcomingTasksWithDates.length > 0 && (
                  <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginTop: "0.25rem" }}>
                    Next: {upcomingTasksWithDates[0]?.due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                )}
                <button onClick={() => setMaintenanceFilter("dueSoon")} style={{ marginTop: "0.75rem", width: "100%", fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer" }}>
                  View All Tasks
                </button>
              </Card>

              {/* Potential Savings */}
              <Card style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>Potential Savings</span>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.greenBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <DollarSign size={15} color={C.green} />
                  </div>
                </div>
                <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "2rem", color: C.text, lineHeight: 1 }}>
                  ${potentialSavings > 0 ? potentialSavings.toLocaleString() : "—"}
                </div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginTop: "0.25rem" }}>By staying on track</div>
                <button onClick={() => navigate("/market")} style={{ marginTop: "0.75rem", width: "100%", fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer" }}>
                  See How
                </button>
              </Card>

              {/* Completed This Year */}
              <Card style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>Completed This Year</span>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle2 size={15} color={C.blue} />
                  </div>
                </div>
                <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "2rem", color: C.text, lineHeight: 1 }}>{completedThisYear}</div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginTop: "0.25rem" }}>Tasks Completed</div>
                <button onClick={() => {}} style={{ marginTop: "0.75rem", width: "100%", fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer" }}>
                  View History
                </button>
              </Card>

              {/* Maintenance Budget */}
              <Card style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                  <span style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.muted }}>Maintenance Budget</span>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <BarChart2 size={15} color={C.blue} />
                  </div>
                </div>
                <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "2rem", color: C.text, lineHeight: 1 }}>
                  {budgetTotal > 0 ? `$${budgetTotal.toLocaleString()}` : "—"}
                </div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted, marginTop: "0.25rem" }}>Annual estimate</div>
                <button onClick={() => setShowSystemAges(true)} style={{ marginTop: "0.75rem", width: "100%", fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.5rem", cursor: "pointer" }}>
                  View Budget
                </button>
              </Card>
            </div>

            {/* ── Two-column: Maintenance list + Calendar ───────────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.25rem", marginBottom: "1.25rem" }}>

              {/* Upcoming Maintenance */}
              <Card style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
                  <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>Upcoming Maintenance</h3>
                  <button onClick={() => {}} style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.blue, background: "none", border: `1px solid ${C.border}`, borderRadius: "0.5rem", padding: "0.375rem 0.75rem", cursor: "pointer" }}>
                    <CalendarDays size={13} /> View Calendar
                  </button>
                </div>

                {/* Filter tabs */}
                <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 1.25rem" }}>
                  {([["all", "All"], ["dueSoon", "Due Soon"], ["overdue", "Overdue"], ["scheduled", "Scheduled"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setMaintenanceFilter(key)}
                      style={{ padding: "0.625rem 0.875rem", fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: maintenanceFilter === key ? 600 : 400, color: maintenanceFilter === key ? C.blue : C.muted, background: "none", border: "none", borderBottom: maintenanceFilter === key ? `2px solid ${C.blue}` : "2px solid transparent", marginBottom: "-1px", cursor: "pointer" }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Task list */}
                <div style={{ flex: 1 }}>
                  {filteredTasks.length === 0 ? (
                    <div style={{ padding: "2rem", textAlign: "center" }}>
                      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>No tasks in this category.</p>
                    </div>
                  ) : (
                    filteredTasks.slice(0, 6).map(({ task, due, status }, i) => (
                      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", alignItems: "center", gap: "1rem", padding: "0.875rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, fontWeight: 500 }}>{task.task}</div>
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>{task.frequency}</div>
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: status.color, fontWeight: status.label !== "Upcoming" ? 600 : 400, marginTop: "0.125rem" }}>
                            Due {due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            {" "}· <span style={{ color: status.color }}>{status.label}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.text, fontWeight: 500 }}>{task.estimatedCost}</div>
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.6875rem", color: C.muted }}>Est. Cost</div>
                        </div>
                        <button
                          onClick={() => navigate("/quotes/new")}
                          style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, border: `1px solid ${C.border}`, background: "white", borderRadius: "0.5rem", padding: "0.375rem 0.75rem", cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          {task.task.toLowerCase().includes("filter") || task.task.toLowerCase().includes("flush") || task.task.toLowerCase().includes("test") ? "Schedule" : "Get Quotes"}
                        </button>
                        <button style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: "0.25rem" }}>⋯</button>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ padding: "0.875rem 1.25rem", borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
                  <button
                    onClick={() => setMaintenanceFilter("all")}
                    style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer" }}
                  >
                    View All Maintenance Tasks
                  </button>
                </div>
              </Card>

              {/* Maintenance Calendar */}
              <Card style={{ padding: "1.25rem" }}>
                <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: "0 0 1rem" }}>
                  Maintenance Calendar
                </h3>
                <MiniCalendar scheduleEntries={scheduleEntries} />
              </Card>
            </div>

            {/* ── Two-column: AI Insights + Maintenance History ─────────────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.25rem", marginBottom: "1.25rem" }}>

              {/* AI Insights & Recommendations */}
              <Card style={{ padding: "1.25rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.blueBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Bot size={15} color={C.blue} />
                  </div>
                  <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>
                    AI Insights & Recommendations
                  </h3>
                  <button
                    onClick={() => setShowChatPanel(p => !p)}
                    style={{ marginLeft: "auto", fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.blue, background: "none", border: `1px solid ${C.border}`, borderRadius: "0.5rem", padding: "0.375rem 0.75rem", cursor: "pointer" }}
                  >
                    {showChatPanel ? "Hide Chat" : "Chat with AI"}
                  </button>
                </div>
                {showChatPanel && property ? (
                  <div style={{ height: "280px", border: `1px solid ${C.border}`, borderRadius: "0.5rem", overflow: "hidden" }}>
                    <MaintenanceChatPanel yearBuilt={Number(property.yearBuilt)} propertyAddress={`${property.address}, ${property.city}`} report={report} />
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {insights.length === 0 ? (
                      <div style={{ padding: "1.5rem", textAlign: "center", color: C.muted, fontFamily: FONTS.sans, fontSize: "0.875rem" }}>
                        No insights available yet. Set your system ages to get predictions.
                      </div>
                    ) : (
                      insights.map((ins, i) => (
                        <div key={i} style={{ display: "flex", gap: "0.875rem", padding: "1rem", background: ins.type === "warning" ? C.redBg : ins.type === "info" ? C.orangeBg : C.greenBg, borderRadius: "0.5rem", border: `1px solid ${ins.type === "warning" ? C.red + "33" : ins.type === "info" ? C.orange + "33" : C.greenBdr}` }}>
                          <span style={{ fontSize: "1.25rem", lineHeight: 1, flexShrink: 0 }}>{ins.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: ins.type === "warning" ? C.red : ins.type === "info" ? C.orange : C.green, marginBottom: "0.25rem" }}>
                              {ins.title}
                            </div>
                            <div style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.text, lineHeight: 1.4, marginBottom: "0.5rem" }}>
                              {ins.desc}
                            </div>
                            <button
                              onClick={() => (ins as any).navTo ? navigate((ins as any).navTo) : setMaintenanceFilter("dueSoon")}
                              style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", fontWeight: 600, color: ins.type === "warning" ? C.red : C.blue, border: `1px solid ${ins.type === "warning" ? C.red + "55" : C.border}`, background: ins.type === "warning" ? C.redBg : "white", borderRadius: "0.375rem", padding: "0.375rem 0.75rem", cursor: "pointer" }}
                            >
                              {ins.action}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </Card>

              {/* Maintenance History */}
              <Card style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem", borderBottom: `1px solid ${C.border}` }}>
                  <h3 style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: C.text, margin: 0 }}>Maintenance History</h3>
                  <button style={{ fontFamily: FONTS.sans, fontSize: "0.8125rem", color: C.blue, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                    View All History <ArrowRight size={13} />
                  </button>
                </div>
                <div style={{ flex: 1 }}>
                  {completedHistory.length === 0 ? (
                    <div style={{ padding: "1.5rem", textAlign: "center" }}>
                      <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted, marginBottom: "0.5rem" }}>No completed tasks yet.</p>
                      <p style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>Completed tasks from your schedule will appear here.</p>
                    </div>
                  ) : (
                    completedHistory.map(entry => (
                      <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.875rem 1.25rem", borderBottom: `1px solid ${C.border}` }}>
                        <CheckCircle2 size={18} color={C.green} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.text, fontWeight: 500 }}>{entry.systemName}</div>
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: C.muted }}>
                            Completed {entryDate(entry).toLocaleDateString("en-US", { month: "short", year: "numeric" })}
                          </div>
                        </div>
                        {entry.estimatedCostCents && (
                          <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 600, color: C.text, flexShrink: 0 }}>
                            ${Math.round(entry.estimatedCostCents / 100).toLocaleString()}
                          </div>
                        )}
                        <ArrowRight size={14} color={C.muted} />
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>

            {/* ── CTA banner ────────────────────────────────────────────────── */}
            <div style={{ background: C.blueBg, border: `1px solid ${C.blue}33`, borderRadius: "0.75rem", padding: "1.25rem 1.75rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <CalendarDays size={20} color="white" />
              </div>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <div style={{ fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1rem", color: C.text, marginBottom: "0.25rem" }}>
                  Stay Ahead &amp; Repairs
                </div>
                <div style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: C.muted }}>
                  Enable predictive scheduling and never miss important maintenance again.
                </div>
              </div>
              <button
                onClick={() => setShowSystemAges(true)}
                style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 700, color: "white", background: C.blue, border: "none", borderRadius: "0.5rem", padding: "0.75rem 1.5rem", cursor: "pointer", flexShrink: 0 }}
              >
                Enable Auto-Schedule
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────────── */}
      {scheduleTarget && property && (
        <AddToScheduleModal pred={scheduleTarget} propertyId={String(property.id)} onSave={handleScheduleSave} onClose={() => setScheduleTarget(null)} />
      )}

      {/* Print-only calendar */}
      <div id="hf-print-calendar">
        {report && property && (() => {
          const urgent = report.systemPredictions.filter(p => p.urgency === "Critical" || p.urgency === "Soon");
          return (
            <>
              <div className="hf-print-header">
                <h1>HomeGentic Maintenance Calendar</h1>
                <p>{property.address}, {property.city}, {property.state} {property.zipCode} · Built {String(property.yearBuilt)} · Generated {new Date().toLocaleDateString()}</p>
              </div>
              <div className="hf-print-section">
                <div className="hf-print-section-title">System Health Summary</div>
                {urgent.map(p => (
                  <div key={p.systemName} className="hf-print-row">
                    <span>{p.urgency === "Critical" ? "⚠" : "⏰"} {p.systemName}</span>
                    <span>{p.yearsRemaining < 0 ? `${Math.abs(p.yearsRemaining)}y overdue` : `${p.yearsRemaining}y remaining`}</span>
                    <span>{maintenanceService.formatCents(p.estimatedCostLowCents)}–{maintenanceService.formatCents(p.estimatedCostHighCents)}</span>
                  </div>
                ))}
              </div>
              <div className="hf-print-section">
                <div className="hf-print-section-title">Annual Maintenance Tasks</div>
                {report.annualTasks.map(t => (
                  <div key={t.task} className="hf-print-row">
                    <span>□ {t.task}</span>
                    <span>{t.frequency}</span>
                    <span>{t.estimatedCost}</span>
                  </div>
                ))}
              </div>
              <div className="hf-print-footer">Generated by HomeGentic · Records verified on Internet Computer Protocol · homegentic.app</div>
            </>
          );
        })()}
      </div>

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
