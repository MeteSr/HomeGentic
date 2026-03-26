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
  AlertTriangle,
  Clock,
  Eye,
  CheckCircle2,
  Calendar,
  Bot,
  Send,
  Wrench,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  X,
} from "lucide-react";

// ─── Urgency Badge ────────────────────────────────────────────────────────────

function UrgencyBadge({ urgency }: { urgency: UrgencyLevel }) {
  const icons: Record<UrgencyLevel, React.ReactNode> = {
    Critical: <AlertTriangle size={12} />,
    Soon:     <Clock size={12} />,
    Watch:    <Eye size={12} />,
    Good:     <CheckCircle2 size={12} />,
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        padding: "0.2rem 0.6rem",
        borderRadius: "9999px",
        fontSize: "0.7rem",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: maintenanceService.urgencyColor(urgency),
        backgroundColor: maintenanceService.urgencyBg(urgency),
      }}
    >
      {icons[urgency]}
      {urgency}
    </span>
  );
}

// ─── Life Bar ─────────────────────────────────────────────────────────────────

function LifeBar({ pct, urgency }: { pct: number; urgency: UrgencyLevel }) {
  const capped = Math.min(pct, 100);
  return (
    <div
      style={{
        height: "6px",
        borderRadius: "3px",
        backgroundColor: "#e5e7eb",
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${capped}%`,
          backgroundColor: maintenanceService.urgencyColor(urgency),
          borderRadius: "3px",
          transition: "width 0.6s ease",
        }}
      />
    </div>
  );
}

// ─── System Card ─────────────────────────────────────────────────────────────

function SystemCard({
  pred,
  onSchedule,
}: {
  pred: SystemPrediction;
  onSchedule: (pred: SystemPrediction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const low  = maintenanceService.formatCents(pred.estimatedCostLowCents);
  const high = maintenanceService.formatCents(pred.estimatedCostHighCents);

  return (
    <div
      style={{
        border: "1px solid",
        borderColor: pred.urgency === "Critical" ? "#fca5a5" : "#e5e7eb",
        borderRadius: "0.75rem",
        backgroundColor: "white",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <div
        style={{
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          cursor: "pointer",
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: "#111827" }}>
              {pred.systemName}
            </span>
            <UrgencyBadge urgency={pred.urgency} />
            {pred.diyViable && (
              <span
                style={{
                  fontSize: "0.65rem",
                  color: "#6b7280",
                  border: "1px solid #d1d5db",
                  borderRadius: "9999px",
                  padding: "0.1rem 0.45rem",
                  fontWeight: 600,
                }}
              >
                DIY OK
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <LifeBar pct={pred.percentLifeUsed} urgency={pred.urgency} />
            <span style={{ fontSize: "0.75rem", color: "#6b7280", whiteSpace: "nowrap" }}>
              {pred.percentLifeUsed}% life used
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: "7rem" }}>
          <div style={{ fontSize: "0.75rem", color: "#6b7280" }}>Replacement</div>
          <div style={{ fontWeight: 700, fontSize: "0.875rem", color: "#111827" }}>
            {low}–{high}
          </div>
        </div>
        <div style={{ color: "#9ca3af" }}>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            borderTop: "1px solid #f3f4f6",
            padding: "0.875rem 1.25rem",
            backgroundColor: "#fafafa",
          }}
        >
          <p style={{ fontSize: "0.85rem", color: "#374151", marginBottom: "0.75rem", lineHeight: 1.5 }}>
            {pred.recommendation.replace(/^[⚠️📅👁✅]\s*/, "")}
          </p>
          <div style={{ display: "flex", gap: "1.5rem", fontSize: "0.78rem", color: "#6b7280", marginBottom: "0.75rem" }}>
            <span>Last serviced: <strong style={{ color: "#374151" }}>{pred.lastServiceYear}</strong></span>
            <span>
              {pred.yearsRemaining >= 0
                ? <>Years remaining: <strong style={{ color: "#374151" }}>{pred.yearsRemaining}</strong></>
                : <><strong style={{ color: "#dc2626" }}>{Math.abs(pred.yearsRemaining)} yrs overdue</strong></>}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onSchedule(pred); }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              padding: "0.4rem 0.875rem",
              borderRadius: "0.5rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              color: "#3b82f6",
              backgroundColor: "#eff6ff",
              border: "1px solid #bfdbfe",
              cursor: "pointer",
            }}
          >
            <Calendar size={13} />
            Add to schedule
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Schedule Panel ───────────────────────────────────────────────────────────

function SchedulePanel({
  entries,
  onComplete,
  onDelete,
}: {
  entries: ScheduleEntry[];
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const pending   = entries.filter((e) => !e.isCompleted);
  const completed = entries.filter((e) => e.isCompleted);

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "2rem", color: "#9ca3af" }}>
        <Calendar size={32} style={{ margin: "0 auto 0.5rem" }} />
        <p style={{ fontSize: "0.875rem" }}>No scheduled maintenance yet.</p>
        <p style={{ fontSize: "0.8rem" }}>Click "Add to schedule" on any system card.</p>
      </div>
    );
  }

  const renderEntry = (entry: ScheduleEntry) => (
    <div
      key={entry.id}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "0.75rem",
        padding: "0.75rem",
        borderRadius: "0.5rem",
        backgroundColor: entry.isCompleted ? "#f9fafb" : "white",
        border: "1px solid #e5e7eb",
        opacity: entry.isCompleted ? 0.65 : 1,
      }}
    >
      <button
        onClick={() => !entry.isCompleted && onComplete(entry.id)}
        style={{
          width: "1.25rem",
          height: "1.25rem",
          borderRadius: "50%",
          border: `2px solid ${entry.isCompleted ? "#16a34a" : "#d1d5db"}`,
          backgroundColor: entry.isCompleted ? "#16a34a" : "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: entry.isCompleted ? "default" : "pointer",
          flexShrink: 0,
          marginTop: "0.1rem",
        }}
        title={entry.isCompleted ? "Completed" : "Mark complete"}
      >
        {entry.isCompleted && <CheckCircle2 size={10} color="white" />}
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#111827" }}>
          {entry.systemName}
        </div>
        <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{entry.taskDescription}</div>
        <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.2rem" }}>
          Planned: {entry.plannedYear}{entry.plannedMonth ? `/${entry.plannedMonth}` : ""}
          {entry.estimatedCostCents
            ? ` · ~${maintenanceService.formatCents(entry.estimatedCostCents)}`
            : ""}
        </div>
      </div>
      <button
        onClick={() => onDelete(entry.id)}
        style={{ color: "#d1d5db", background: "none", border: "none", cursor: "pointer", padding: "0.125rem" }}
      >
        <X size={14} />
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {pending.map(renderEntry)}
      {completed.length > 0 && (
        <>
          <div style={{ fontSize: "0.75rem", color: "#9ca3af", fontWeight: 600, marginTop: "0.5rem" }}>
            COMPLETED
          </div>
          {completed.map(renderEntry)}
        </>
      )}
    </div>
  );
}

// ─── Add to Schedule Modal ────────────────────────────────────────────────────

function AddToScheduleModal({
  pred,
  propertyId,
  onSave,
  onClose,
}: {
  pred: SystemPrediction;
  propertyId: string;
  onSave: (entry: ScheduleEntry) => void;
  onClose: () => void;
}) {
  const currentYear = new Date().getFullYear();
  const [year, setYear]   = useState(String(currentYear + 1));
  const [month, setMonth] = useState("");
  const [desc, setDesc]   = useState(`${pred.systemName} service/inspection`);
  const [cost, setCost]   = useState(
    String(Math.round(pred.estimatedCostLowCents / 100))
  );

  const save = async () => {
    const entry = await maintenanceService.createScheduleEntry(
      propertyId,
      pred.systemName,
      desc,
      Number(year),
      month ? Number(month) : undefined,
      cost ? Math.round(parseFloat(cost) * 100) : undefined
    );
    onSave(entry);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white", borderRadius: "1rem", padding: "1.5rem",
          maxWidth: "26rem", width: "100%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <h3 style={{ fontWeight: 700, fontSize: "1rem", color: "#111827" }}>
            Schedule {pred.systemName} Work
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <label style={{ fontSize: "0.85rem" }}>
            <span style={{ fontWeight: 600, color: "#374151", display: "block", marginBottom: "0.3rem" }}>
              Task description
            </span>
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              style={{
                width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                border: "1px solid #d1d5db", fontSize: "0.85rem", boxSizing: "border-box",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <label style={{ fontSize: "0.85rem", flex: 1 }}>
              <span style={{ fontWeight: 600, color: "#374151", display: "block", marginBottom: "0.3rem" }}>
                Planned year *
              </span>
              <input
                type="number"
                value={year}
                min={currentYear}
                max={currentYear + 30}
                onChange={(e) => setYear(e.target.value)}
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                  border: "1px solid #d1d5db", fontSize: "0.85rem", boxSizing: "border-box",
                }}
              />
            </label>
            <label style={{ fontSize: "0.85rem", flex: 1 }}>
              <span style={{ fontWeight: 600, color: "#374151", display: "block", marginBottom: "0.3rem" }}>
                Month (optional)
              </span>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{
                  width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                  border: "1px solid #d1d5db", fontSize: "0.85rem", boxSizing: "border-box",
                }}
              >
                <option value="">Any</option>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
            </label>
          </div>

          <label style={{ fontSize: "0.85rem" }}>
            <span style={{ fontWeight: 600, color: "#374151", display: "block", marginBottom: "0.3rem" }}>
              Estimated cost ($)
            </span>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="Optional"
              style={{
                width: "100%", padding: "0.5rem 0.75rem", borderRadius: "0.5rem",
                border: "1px solid #d1d5db", fontSize: "0.85rem", boxSizing: "border-box",
              }}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: "0.6rem", borderRadius: "0.5rem",
              border: "1px solid #e5e7eb", backgroundColor: "white",
              fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", color: "#374151",
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!year || !desc}
            style={{
              flex: 2, padding: "0.6rem", borderRadius: "0.5rem",
              backgroundColor: "#3b82f6", color: "white",
              fontSize: "0.875rem", fontWeight: 600, cursor: "pointer", border: "none",
            }}
          >
            Save to Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

function MaintenanceChatPanel({
  yearBuilt,
  propertyAddress,
  report,
}: {
  yearBuilt: number;
  propertyAddress: string;
  report: MaintenanceReport | null;
}) {
  interface Msg { role: "user" | "assistant"; text: string }
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      text: "Hi! I'm your HomeFax Maintenance Advisor. Ask me anything about your home systems — what to prioritize, cost estimates, DIY tips, or when to call a pro.",
    },
  ]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef             = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setLoading(true);

    try {
      let reply = "";
      setMessages((m) => [...m, { role: "assistant", text: "…" }]);
      for await (const chunk of maintenanceService.chat(msg, {
        yearBuilt,
        propertyAddress,
        report: report ?? undefined,
      })) {
        reply += chunk;
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", text: reply };
          return copy;
        });
      }
    } catch {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          text: "Sorry, I couldn't reach the advisor. Make sure the agent server is running.",
        };
        return copy;
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: "0",
      }}
    >
      {/* Message thread */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              maxWidth: "85%",
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              padding: "0.625rem 0.875rem",
              borderRadius: m.role === "user" ? "1rem 1rem 0.25rem 1rem" : "1rem 1rem 1rem 0.25rem",
              backgroundColor: m.role === "user" ? "#3b82f6" : "#f3f4f6",
              color: m.role === "user" ? "white" : "#111827",
              fontSize: "0.85rem",
              lineHeight: 1.55,
            }}
          >
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          padding: "0.75rem 1rem",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about your home systems…"
          disabled={loading}
          style={{
            flex: 1,
            padding: "0.5rem 0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid #d1d5db",
            fontSize: "0.85rem",
            outline: "none",
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            padding: "0.5rem 0.875rem",
            borderRadius: "0.5rem",
            backgroundColor: "#3b82f6",
            color: "white",
            border: "none",
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            opacity: loading || !input.trim() ? 0.6 : 1,
          }}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "systems" | "annual" | "schedule" | "advisor";

export default function PredictiveMaintenancePage() {
  const { properties } = usePropertyStore();
  const { jobs }       = useJobStore();

  const [selectedId, setSelectedId] = useState(String(properties[0]?.id ?? ""));
  const [report, setReport]         = useState<MaintenanceReport | null>(null);
  const [activeTab, setActiveTab]   = useState<Tab>("systems");
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleTarget, setScheduleTarget]   = useState<SystemPrediction | null>(null);

  const property = properties.find((p) => String(p.id) === selectedId);
  const propJobs = jobs.filter((j) => j.propertyId === selectedId);

  useEffect(() => {
    if (!property) return;
    setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs));
    maintenanceService.getScheduleByProperty(String(property.id)).then(setScheduleEntries);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScheduleSave = (entry: ScheduleEntry) => {
    setScheduleEntries((prev) => [...prev, entry]);
    setActiveTab("schedule");
  };

  const handleComplete = async (id: string) => {
    await maintenanceService.markCompleted(id);
    setScheduleEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, isCompleted: true } : e))
    );
  };

  const handleDelete = (id: string) => {
    maintenanceService.deleteEntry(id);
    setScheduleEntries((prev) => prev.filter((e) => e.id !== id));
  };

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

        {/* Page header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#111827", marginBottom: "0.25rem" }}>
            Predictive Maintenance
          </h1>
          <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
            System health predictions based on home age and service history.
          </p>
        </div>

        {/* Property selector */}
        {properties.length === 0 ? (
          <div
            style={{
              textAlign: "center", padding: "3rem", borderRadius: "1rem",
              backgroundColor: "white", border: "1px solid #e5e7eb",
            }}
          >
            <Wrench size={40} style={{ color: "#d1d5db", margin: "0 auto 0.75rem" }} />
            <p style={{ color: "#6b7280" }}>Add a property to see maintenance predictions.</p>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(String(e.target.value))}
                style={{
                  padding: "0.5rem 0.875rem", borderRadius: "0.5rem",
                  border: "1px solid #d1d5db", fontSize: "0.875rem",
                  backgroundColor: "white", cursor: "pointer",
                }}
              >
                {properties.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>
                    {p.address}, {p.city} ({String(p.yearBuilt)})
                  </option>
                ))}
              </select>

              {/* Budget summary chips */}
              {report && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {criticalCount > 0 && (
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "0.3rem",
                        padding: "0.3rem 0.75rem", borderRadius: "9999px",
                        backgroundColor: "#fef2f2", color: "#dc2626",
                        fontSize: "0.78rem", fontWeight: 700,
                      }}
                    >
                      <AlertTriangle size={11} />
                      {criticalCount} Critical
                    </span>
                  )}
                  {soonCount > 0 && (
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: "0.3rem",
                        padding: "0.3rem 0.75rem", borderRadius: "9999px",
                        backgroundColor: "#fffbeb", color: "#d97706",
                        fontSize: "0.78rem", fontWeight: 700,
                      }}
                    >
                      <Clock size={11} />
                      {soonCount} Soon
                    </span>
                  )}
                  {report.totalBudgetLowCents > 0 && (
                    <span
                      style={{
                        padding: "0.3rem 0.75rem", borderRadius: "9999px",
                        backgroundColor: "#f3f4f6", color: "#374151",
                        fontSize: "0.78rem", fontWeight: 600,
                      }}
                    >
                      Budget: {maintenanceService.formatCents(report.totalBudgetLowCents)}–
                      {maintenanceService.formatCents(report.totalBudgetHighCents)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Tabs */}
            <div
              style={{
                display: "flex",
                borderBottom: "1px solid #e5e7eb",
                marginBottom: "1.25rem",
                gap: "0",
              }}
            >
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: "0.6rem 1.1rem",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    border: "none",
                    borderBottom: activeTab === tab.id ? "2px solid #3b82f6" : "2px solid transparent",
                    color: activeTab === tab.id ? "#3b82f6" : "#6b7280",
                    backgroundColor: "transparent",
                    cursor: "pointer",
                    transition: "all 0.15s",
                    marginBottom: "-1px",
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            {activeTab === "systems" && report && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {report.systemPredictions.map((pred) => (
                  <SystemCard
                    key={pred.systemName}
                    pred={pred}
                    onSchedule={setScheduleTarget}
                  />
                ))}
              </div>
            )}

            {activeTab === "annual" && report && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))",
                  gap: "0.75rem",
                }}
              >
                {report.annualTasks.map((task) => (
                  <div
                    key={task.task}
                    style={{
                      backgroundColor: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: "0.75rem",
                      padding: "1rem",
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#111827", marginBottom: "0.375rem" }}>
                      {task.task}
                    </div>
                    <div style={{ fontSize: "0.78rem", color: "#6b7280", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      <span
                        style={{
                          backgroundColor: "#eff6ff",
                          color: "#3b82f6",
                          padding: "0.15rem 0.45rem",
                          borderRadius: "9999px",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                        }}
                      >
                        {task.frequency}
                      </span>
                      {task.season && (
                        <span style={{ color: "#9ca3af" }}>{task.season}</span>
                      )}
                    </div>
                    <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "#374151", fontWeight: 600 }}>
                      {task.estimatedCost}
                      {task.diyViable && (
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            fontSize: "0.68rem",
                            color: "#16a34a",
                            border: "1px solid #bbf7d0",
                            borderRadius: "9999px",
                            padding: "0.1rem 0.4rem",
                          }}
                        >
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
                  <h3 style={{ fontWeight: 700, color: "#111827", fontSize: "0.95rem" }}>Maintenance Schedule</h3>
                  <button
                    onClick={() => setActiveTab("systems")}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.35rem",
                      fontSize: "0.8rem", fontWeight: 600, color: "#3b82f6",
                      backgroundColor: "#eff6ff", border: "1px solid #bfdbfe",
                      borderRadius: "0.5rem", padding: "0.35rem 0.75rem", cursor: "pointer",
                    }}
                  >
                    <PlusCircle size={13} />
                    Add from systems
                  </button>
                </div>
                <SchedulePanel
                  entries={scheduleEntries}
                  onComplete={handleComplete}
                  onDelete={handleDelete}
                />
              </div>
            )}

            {activeTab === "advisor" && property && (
              <div
                style={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "1rem",
                  overflow: "hidden",
                  height: "30rem",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    padding: "0.875rem 1.25rem",
                    borderBottom: "1px solid #f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    backgroundColor: "#fafafa",
                  }}
                >
                  <Bot size={16} color="#3b82f6" />
                  <span style={{ fontWeight: 700, fontSize: "0.875rem", color: "#111827" }}>
                    AI Maintenance Advisor
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>
                    · Powered by Claude
                  </span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <MaintenanceChatPanel
                    yearBuilt={Number(property.yearBuilt)}
                    propertyAddress={`${property.address}, ${property.city}`}
                    report={report}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Schedule modal */}
      {scheduleTarget && property && (
        <AddToScheduleModal
          pred={scheduleTarget}
          propertyId={String(property.id)}
          onSave={handleScheduleSave}
          onClose={() => setScheduleTarget(null)}
        />
      )}
    </Layout>
  );
}
