import React, { useState, useRef, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { usePropertyStore } from "@/store/propertyStore";
import { useJobStore } from "@/store/jobStore";
import {
  maintenanceService,
  type MaintenanceReport,
  type SystemPrediction,
  type UrgencyLevel,
  type ScheduleEntry,
} from "@/services/maintenance";
import {
  AlertTriangle, Clock, Eye, CheckCircle2, Calendar,
  Bot, Send, Wrench, ChevronDown, ChevronUp, PlusCircle, X, Settings2,
} from "lucide-react";
import { systemAgesService } from "@/services/systemAges";
import { useNavigate } from "react-router-dom";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  serif: "'Playfair Display', Georgia, serif" as const,
  mono:  "'IBM Plex Mono', monospace" as const,
};

const URGENCY_RUST: Record<UrgencyLevel, string> = {
  Critical: S.rust, Soon: "#D4820E", Watch: "#7A7268", Good: S.sage,
};
const URGENCY_BG: Record<UrgencyLevel, string> = {
  Critical: "#FAF0ED", Soon: "#FEF3DC", Watch: S.paper, Good: "#F0F6F3",
};

// ─── Urgency Badge ─────────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: UrgencyLevel }) {
  const icons: Record<UrgencyLevel, React.ReactNode> = {
    Critical: <AlertTriangle size={10} />,
    Soon:     <Clock size={10} />,
    Watch:    <Eye size={10} />,
    Good:     <CheckCircle2 size={10} />,
  };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "0.25rem",
      padding: "0.15rem 0.5rem",
      fontFamily: S.mono, fontSize: "0.6rem", fontWeight: 700,
      letterSpacing: "0.1em", textTransform: "uppercase",
      color: URGENCY_RUST[urgency],
      background: URGENCY_BG[urgency],
      border: `1px solid ${URGENCY_RUST[urgency]}40`,
    }}>
      {icons[urgency]}{urgency}
    </span>
  );
}

// ─── Life Bar ──────────────────────────────────────────────────────────────────

function LifeBar({ pct, urgency }: { pct: number; urgency: UrgencyLevel }) {
  return (
    <div style={{ height: "3px", background: S.rule, flex: 1, overflow: "hidden" }}>
      <div style={{ height: "3px", width: `${Math.min(pct, 100)}%`, background: URGENCY_RUST[urgency], transition: "width 0.6s ease" }} />
    </div>
  );
}

// ─── System Card ───────────────────────────────────────────────────────────────

function SystemCard({ pred, onSchedule }: { pred: SystemPrediction; onSchedule: (p: SystemPrediction) => void }) {
  const [expanded, setExpanded] = useState(false);
  const low  = maintenanceService.formatCents(pred.estimatedCostLowCents);
  const high = maintenanceService.formatCents(pred.estimatedCostHighCents);

  return (
    <div style={{ border: `1px solid ${pred.urgency === "Critical" ? S.rust : S.rule}`, background: "#fff" }}>
      <div style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: S.ink }}>{pred.systemName}</span>
            <UrgencyBadge urgency={pred.urgency} />
            {pred.diyViable && (
              <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight, border: `1px solid ${S.rule}`, padding: "0.1rem 0.4rem" }}>
                DIY OK
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <LifeBar pct={pred.percentLifeUsed} urgency={pred.urgency} />
            <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight, whiteSpace: "nowrap" }}>
              {pred.percentLifeUsed}% life used
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: "7rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>Replacement</div>
          <div style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.75rem", color: S.ink }}>{low}–{high}</div>
        </div>
        <div style={{ color: S.inkLight }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${S.rule}`, padding: "0.875rem 1.25rem", background: S.paper }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.ink, marginBottom: "0.75rem", lineHeight: 1.6 }}>
            {pred.recommendation.replace(/^[⚠️📅👁✅]\s*/, "")}
          </p>
          <div style={{ display: "flex", gap: "1.5rem", fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginBottom: "0.75rem" }}>
            <span>Last serviced: <strong style={{ color: S.ink }}>{pred.lastServiceYear}</strong></span>
            <span>
              {pred.yearsRemaining >= 0
                ? <>Years remaining: <strong style={{ color: S.ink }}>{pred.yearsRemaining}</strong></>
                : <><strong style={{ color: S.rust }}>{Math.abs(pred.yearsRemaining)} yrs overdue</strong></>}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSchedule(pred); }}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.4rem 0.875rem", border: `1px solid ${S.rule}`, background: "#fff", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.ink, cursor: "pointer" }}
          >
            <Calendar size={11} /> Add to schedule
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Five-Year Calendar ────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function FiveYearCalendar({ entries, onComplete, onDelete, onAddYear }: {
  entries: ScheduleEntry[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onAddYear: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear+1, currentYear+2, currentYear+3, currentYear+4];

  const byYear = (year: number) => entries.filter((e) => e.plannedYear === year);
  const pending = entries.filter((e) => !e.isCompleted);
  const yearBudget = (year: number) =>
    byYear(year).filter((e) => !e.isCompleted && e.estimatedCostCents)
      .reduce((s, e) => s + (e.estimatedCostCents ?? 0), 0);

  if (entries.length === 0) {
    return (
      <div style={{ border: `1px dashed ${S.rule}`, padding: "2.5rem", textAlign: "center" }}>
        <Calendar size={28} color={S.rule} style={{ margin: "0 auto 0.5rem" }} />
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>No scheduled maintenance yet.</p>
        <p style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, marginTop: "0.25rem" }}>
          Click "Add to schedule" on any system card to populate your 5-year calendar.
        </p>
      </div>
    );
  }

  const renderEntry = (entry: ScheduleEntry) => (
    <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", padding: "0.625rem 0.875rem", background: entry.isCompleted ? S.paper : "#fff", opacity: entry.isCompleted ? 0.6 : 1 }}>
      <button
        onClick={() => !entry.isCompleted && onComplete(entry.id)}
        style={{ width: "1rem", height: "1rem", border: `2px solid ${entry.isCompleted ? S.sage : S.rule}`, background: entry.isCompleted ? S.sage : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: entry.isCompleted ? "default" : "pointer", flexShrink: 0, marginTop: "0.1rem" }}
      >
        {entry.isCompleted && <CheckCircle2 size={8} color="#fff" />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: S.ink }}>{entry.systemName}</div>
        <div style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.04em" }}>
          {entry.plannedMonth ? `${MONTH_NAMES[entry.plannedMonth - 1]} · ` : ""}{entry.taskDescription}
          {entry.estimatedCostCents ? ` · ~${maintenanceService.formatCents(entry.estimatedCostCents)}` : ""}
        </div>
      </div>
      <button onClick={() => onDelete(entry.id)} style={{ color: S.inkLight, background: "none", border: "none", cursor: "pointer", padding: "0.125rem", flexShrink: 0 }}>
        <X size={11} />
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Total pending budget banner */}
      {pending.length > 0 && (
        <div style={{ border: `1px solid ${S.rule}`, padding: "0.875rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>
            {pending.length} tasks scheduled
          </span>
          <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.75rem", color: S.ink }}>
            5-yr budget: {maintenanceService.formatCents(years.reduce((s, y) => s + yearBudget(y), 0))}
          </span>
        </div>
      )}

      {/* Year columns */}
      {years.map((year) => {
        const yearEntries = byYear(year);
        const budget = yearBudget(year);
        const isCurrentYear = year === currentYear;
        return (
          <div key={year} style={{ border: `1px solid ${isCurrentYear ? S.rust : S.rule}`, background: "#fff", overflow: "hidden" }}>
            <div style={{
              padding: "0.625rem 1rem", borderBottom: `1px solid ${isCurrentYear ? S.rust : S.rule}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: isCurrentYear ? "#FAF0ED" : S.paper,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.1em", color: isCurrentYear ? S.rust : S.inkLight }}>
                  {year}
                </span>
                {isCurrentYear && (
                  <span style={{ fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.rust, border: `1px solid ${S.rust}`, padding: "0.1rem 0.35rem" }}>
                    This year
                  </span>
                )}
              </div>
              <span style={{ fontFamily: S.mono, fontSize: "0.65rem", color: budget > 0 ? S.ink : S.inkLight, fontWeight: budget > 0 ? 700 : 400 }}>
                {budget > 0 ? maintenanceService.formatCents(budget) : "No estimate"}
              </span>
            </div>

            {yearEntries.length === 0 ? (
              <div style={{ padding: "0.75rem 1rem" }}>
                <span style={{ fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: S.inkLight }}>
                  No tasks scheduled — add from System Health tab
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
                {yearEntries.map(renderEntry)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Add to Schedule Modal ─────────────────────────────────────────────────────

function AddToScheduleModal({ pred, propertyId, onSave, onClose }: { pred: SystemPrediction; propertyId: string; onSave: (e: ScheduleEntry) => void; onClose: () => void }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear]   = useState(String(currentYear + 1));
  const [month, setMonth] = useState("");
  const [desc, setDesc]   = useState(`${pred.systemName} service/inspection`);
  const [cost, setCost]   = useState(String(Math.round(pred.estimatedCostLowCents / 100)));

  const save = async () => {
    const entry = await maintenanceService.createScheduleEntry(propertyId, pred.systemName, desc, Number(year), month ? Number(month) : undefined, cost ? Math.round(parseFloat(cost) * 100) : undefined);
    onSave(entry);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }} onClick={onClose}>
      <div style={{ background: "#fff", padding: "1.5rem", maxWidth: "26rem", width: "100%", border: `1px solid ${S.rule}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight }}>
            Schedule {pred.systemName} Work
          </p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: S.inkLight }}><X size={16} /></button>
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
          <button onClick={onClose} style={{ flex: 1, padding: "0.6rem", border: `1px solid ${S.rule}`, background: "#fff", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", color: S.inkLight }}>
            Cancel
          </button>
          <button onClick={save} disabled={!year || !desc} style={{ flex: 2, padding: "0.6rem", border: `1px solid ${S.ink}`, background: S.ink, color: "#F4F1EB", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
            Save to Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Chat ───────────────────────────────────────────────────────────────────

function MaintenanceChatPanel({ yearBuilt, propertyAddress, report }: { yearBuilt: number; propertyAddress: string; report: MaintenanceReport | null }) {
  interface Msg { role: "user" | "assistant"; text: string }
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Hi! I'm your HomeFax Maintenance Advisor. Ask me anything about your home systems — what to prioritize, cost estimates, DIY tips, or when to call a pro." },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setLoading(true);
    try {
      let reply = "";
      setMessages((m) => [...m, { role: "assistant", text: "…" }]);
      for await (const chunk of maintenanceService.chat(msg, { yearBuilt, propertyAddress, report: report ?? undefined })) {
        reply += chunk;
        setMessages((m) => { const copy = [...m]; copy[copy.length - 1] = { role: "assistant", text: reply }; return copy; });
      }
    } catch {
      setMessages((m) => { const copy = [...m]; copy[copy.length - 1] = { role: "assistant", text: "Sorry, I couldn't reach the advisor. Make sure the agent server is running." }; return copy; });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: "0" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            maxWidth: "85%", alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            padding: "0.625rem 0.875rem",
            background: m.role === "user" ? S.ink : S.paper,
            color: m.role === "user" ? "#F4F1EB" : S.ink,
            fontFamily: S.mono, fontSize: "0.7rem", letterSpacing: "0.03em", lineHeight: 1.6,
          }}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: `1px solid ${S.rule}`, padding: "0.75rem 1rem", display: "flex", gap: "0.5rem" }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about your home systems…" disabled={loading}
          style={{ flex: 1, padding: "0.5rem 0.75rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.7rem", outline: "none", background: "#fff" }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "0.5rem 0.875rem", border: `1px solid ${S.ink}`, background: S.ink, color: "#F4F1EB", cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.6 : 1 }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "systems" | "annual" | "schedule" | "advisor";

export default function PredictiveMaintenancePage() {
  const { properties } = usePropertyStore();
  const { jobs }       = useJobStore();
  const navigate       = useNavigate();

  const [selectedId, setSelectedId] = useState(String(properties[0]?.id ?? ""));
  const [report, setReport]         = useState<MaintenanceReport | null>(null);
  const [activeTab, setActiveTab]   = useState<Tab>("systems");
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleTarget, setScheduleTarget]   = useState<SystemPrediction | null>(null);

  const property = properties.find((p) => String(p.id) === selectedId);
  const propJobs = jobs.filter((j) => j.propertyId === selectedId);

  useEffect(() => {
    if (!property) return;
    const systemAges = systemAgesService.get(selectedId);
    setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs, systemAges));
    maintenanceService.getScheduleByProperty(String(property.id)).then(setScheduleEntries);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScheduleSave = (entry: ScheduleEntry) => { setScheduleEntries((prev) => [...prev, entry]); setActiveTab("schedule"); };
  const handleComplete = async (id: string) => { await maintenanceService.markCompleted(id); setScheduleEntries((prev) => prev.map((e) => (e.id === id ? { ...e, isCompleted: true } : e))); };
  const handleDelete   = (id: string) => { maintenanceService.deleteEntry(id); setScheduleEntries((prev) => prev.filter((e) => e.id !== id)); };

  const criticalCount = report?.systemPredictions.filter((p) => p.urgency === "Critical").length ?? 0;
  const soonCount     = report?.systemPredictions.filter((p) => p.urgency === "Soon").length ?? 0;

  const TABS: { id: Tab; label: string }[] = [
    { id: "systems",  label: "System Health" },
    { id: "annual",   label: "Annual Tasks" },
    { id: "schedule", label: `Schedule (${scheduleEntries.filter((e) => !e.isCompleted).length})` },
    { id: "advisor",  label: "AI Advisor" },
  ];

  return (
    <Layout>
      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: S.rust, marginBottom: "0.5rem" }}>
            Maintenance
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, marginBottom: "0.375rem" }}>
            Predictive Maintenance
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            System health predictions based on home age and service history.
          </p>
        </div>

        {properties.length === 0 ? (
          <div style={{ border: `1px dashed ${S.rule}`, padding: "3rem", textAlign: "center" }}>
            <Wrench size={32} color={S.rule} style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>Add a property to see maintenance predictions.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(String(e.target.value))}
                style={{ padding: "0.5rem 0.875rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.65rem", background: "#fff", cursor: "pointer" }}
              >
                {properties.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city} ({String(p.yearBuilt)})</option>
                ))}
              </select>
              <button
                onClick={() => navigate(`/properties/${selectedId}/systems`)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.875rem", border: `1px solid ${S.rule}`, background: "#fff", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, cursor: "pointer" }}
              >
                <Settings2 size={12} />
                {systemAgesService.hasAny(selectedId) ? "Edit system ages" : "Set system ages"}
              </button>

              {report && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {criticalCount > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", border: `1px solid ${S.rust}`, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.rust }}>
                      <AlertTriangle size={10} /> {criticalCount} Critical
                    </span>
                  )}
                  {soonCount > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.inkLight }}>
                      <Clock size={10} /> {soonCount} Soon
                    </span>
                  )}
                  {report.totalBudgetLowCents > 0 && (
                    <span style={{ padding: "0.25rem 0.625rem", border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.inkLight }}>
                      Budget: {maintenanceService.formatCents(report.totalBudgetLowCents)}–{maintenanceService.formatCents(report.totalBudgetHighCents)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${S.rule}`, marginBottom: "1.25rem" }}>
              {TABS.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "0.6rem 1.1rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", border: "none", borderBottom: activeTab === tab.id ? `2px solid ${S.rust}` : "2px solid transparent", color: activeTab === tab.id ? S.rust : S.inkLight, background: "transparent", cursor: "pointer", marginBottom: "-1px" }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "systems" && report && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: S.rule }}>
                {report.systemPredictions.map((pred) => (
                  <SystemCard key={pred.systemName} pred={pred} onSchedule={setScheduleTarget} />
                ))}
              </div>
            )}

            {activeTab === "annual" && report && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "1px", background: S.rule }}>
                {report.annualTasks.map((task) => (
                  <div key={task.task} style={{ background: "#fff", padding: "1rem" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: S.ink, marginBottom: "0.375rem" }}>{task.task}</div>
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                      <span style={{ border: `1px solid ${S.rule}`, fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: S.rust, padding: "0.125rem 0.4rem" }}>
                        {task.frequency}
                      </span>
                      {task.season && <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>{task.season}</span>}
                    </div>
                    <div style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.ink, fontWeight: 600 }}>
                      {task.estimatedCost}
                      {task.diyViable && (
                        <span style={{ marginLeft: "0.5rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: S.sage, border: `1px solid ${S.sage}40`, padding: "0.1rem 0.4rem", textTransform: "uppercase" }}>
                          DIY
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "schedule" && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight }}>5-Year Maintenance Calendar</p>
                  <button onClick={() => setActiveTab("systems")} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.inkLight, border: `1px solid ${S.rule}`, background: "#fff", padding: "0.35rem 0.75rem", cursor: "pointer" }}>
                    <PlusCircle size={11} /> Add from systems
                  </button>
                </div>
                <FiveYearCalendar entries={scheduleEntries} onComplete={handleComplete} onDelete={handleDelete} onAddYear={() => setActiveTab("systems")} />
              </div>
            )}

            {activeTab === "advisor" && property && (
              <div style={{ border: `1px solid ${S.rule}`, background: "#fff", overflow: "hidden", height: "30rem", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${S.rule}`, display: "flex", alignItems: "center", gap: "0.5rem", background: S.paper }}>
                  <Bot size={14} color={S.rust} />
                  <span style={{ fontFamily: S.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: S.ink }}>
                    AI Maintenance Advisor
                  </span>
                  <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight }}>· Powered by Claude</span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <MaintenanceChatPanel yearBuilt={Number(property.yearBuilt)} propertyAddress={`${property.address}, ${property.city}`} report={report} />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {scheduleTarget && property && (
        <AddToScheduleModal pred={scheduleTarget} propertyId={String(property.id)} onSave={handleScheduleSave} onClose={() => setScheduleTarget(null)} />
      )}
    </Layout>
  );
}
