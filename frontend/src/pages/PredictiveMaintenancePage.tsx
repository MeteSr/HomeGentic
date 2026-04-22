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
  Bot, Send, Wrench, ChevronDown, ChevronUp, PlusCircle, X, Settings2, Download,
} from "lucide-react";
import { systemAgesService } from "@/services/systemAges";
import { marketService, buildPropertySummary, type ProjectRecommendation } from "@/services/market";
import { useNavigate, useSearchParams } from "react-router-dom";
import { paymentService, type PlanTier } from "@/services/payment";
import { UpgradeGate } from "@/components/UpgradeGate";
import SystemAgesModal from "@/components/SystemAgesModal";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.sans,
};

const URGENCY_RUST: Record<UrgencyLevel, string> = {
  Critical: UI.rust, Soon: COLORS.plumMid, Watch: COLORS.plumMid, Good: UI.sage,
};
const URGENCY_BG: Record<UrgencyLevel, string> = {
  Critical: COLORS.blush, Soon: COLORS.butter, Watch: UI.paper, Good: COLORS.sageLight,
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
      fontFamily: UI.mono, fontSize: "0.6rem", fontWeight: 700,
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
    <div style={{ height: "3px", background: UI.rule, flex: 1, overflow: "hidden" }}>
      <div style={{ height: "3px", width: `${Math.min(pct, 100)}%`, background: URGENCY_RUST[urgency], transition: "width 0.6s ease" }} />
    </div>
  );
}

// ─── System Card ───────────────────────────────────────────────────────────────

type TaskState = "none" | "scheduled" | "done";

function SystemCard({ pred, onSchedule, marketRec, taskState, onTaskStateChange, isFree }: {
  pred:              SystemPrediction;
  onSchedule:        (p: SystemPrediction) => void;
  marketRec?:        ProjectRecommendation;
  taskState:         TaskState;
  onTaskStateChange: (state: TaskState) => void;
  isFree:            boolean;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const low  = maintenanceService.formatCents(pred.estimatedCostLowCents);
  const high = maintenanceService.formatCents(pred.estimatedCostHighCents);

  return (
    <div style={{ border: `1px solid ${taskState === "done" ? UI.sage : pred.urgency === "Critical" ? UI.rust : UI.rule}`, background: taskState === "done" ? COLORS.sageLight : COLORS.white, opacity: taskState === "done" ? 0.75 : 1 }}>
      <div style={{ padding: "1rem 1.25rem", display: "flex", alignItems: "center", gap: "0.75rem", cursor: "pointer" }} onClick={() => setExpanded((e) => !e)}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem" }}>
            <span style={{ fontWeight: 700, fontSize: "0.9rem", color: UI.ink }}>{pred.systemName}</span>
            {taskState === "done"      ? <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage, border: `1px solid ${UI.sage}40`, padding: "0.1rem 0.4rem" }}>✓ Done</span>
            : taskState === "scheduled" ? <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, border: `1px solid ${COLORS.plumMid}40`, padding: "0.1rem 0.4rem" }}>Scheduled</span>
            : <UrgencyBadge urgency={pred.urgency} />}
            {pred.diyViable && (
              <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, border: `1px solid ${UI.rule}`, padding: "0.1rem 0.4rem" }}>
                DIY OK
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <LifeBar pct={pred.percentLifeUsed} urgency={pred.urgency} />
            <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight, whiteSpace: "nowrap" }}>
              {pred.percentLifeUsed}% life used
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: "7rem" }}>
          {(pred.urgency === "Critical" || pred.urgency === "Soon") ? (
            <>
              <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Replacement</div>
              {isFree ? (
                <button onClick={(e) => { e.stopPropagation(); navigate("/pricing"); }} style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: COLORS.plumMid, background: "none", border: "none", cursor: "pointer", padding: 0, filter: "blur(4px)", userSelect: "none" }}>$X,XXX–$X,XXX</button>
              ) : (
                <div style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: UI.ink }}>{low}–{high}</div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>Service call</div>
              {isFree ? (
                <button onClick={(e) => { e.stopPropagation(); navigate("/pricing"); }} style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: COLORS.plumMid, background: "none", border: "none", cursor: "pointer", padding: 0, filter: "blur(4px)", userSelect: "none" }}>$XXX–$XXX</button>
              ) : (
                <div style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: UI.ink }}>
                  {maintenanceService.formatCents(pred.serviceCallLowCents)}–{maintenanceService.formatCents(pred.serviceCallHighCents)}
                </div>
              )}
            </>
          )}
        </div>
        <div style={{ color: UI.inkLight }}>
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${UI.rule}`, padding: "0.875rem 1.25rem", background: UI.paper }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.ink, marginBottom: "0.75rem", lineHeight: 1.6 }}>
            {pred.recommendation.replace(/^[⚠️📅👁✅]\s*/, "")}
          </p>
          <div style={{ display: "flex", gap: "1.5rem", fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginBottom: "0.75rem" }}>
            <span>Last serviced: <strong style={{ color: UI.ink }}>{pred.lastServiceYear}</strong></span>
            <span>
              {pred.yearsRemaining >= 0
                ? <>Years remaining: <strong style={{ color: UI.ink }}>{pred.yearsRemaining}</strong></>
                : <><strong style={{ color: UI.rust }}>{Math.abs(pred.yearsRemaining)} yrs overdue</strong></>}
            </span>
          </div>

          {/* Market ROI data */}
          {marketRec && (
            <div style={{ border: `1px solid ${UI.rule}`, padding: "0.75rem 1rem", marginBottom: "0.75rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", background: COLORS.white }}>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>Market ROI</p>
                <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: UI.sage }}>{marketRec.estimatedRoiPercent}%</p>
              </div>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>Est. Value Gain</p>
                <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: UI.ink }}>{marketService.formatCost(marketRec.estimatedGainCents)}</p>
              </div>
              <div>
                <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, marginBottom: "0.2rem" }}>Payback</p>
                <p style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: UI.ink }}>{marketRec.paybackMonths} mo</p>
              </div>
              <p style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.04em", color: UI.inkLight, width: "100%", marginTop: "-0.25rem" }}>
                Source: 2024 Remodeling Magazine · {marketRec.requiresPermit ? "Permit required" : "No permit typically required"}
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              onClick={(e) => { e.stopPropagation(); onSchedule(pred); }}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.4rem 0.875rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.ink, cursor: "pointer" }}
            >
              <Calendar size={11} /> Add to schedule
            </button>

            {taskState !== "scheduled" && taskState !== "done" && (
              <button
                onClick={(e) => { e.stopPropagation(); onTaskStateChange("scheduled"); }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.4rem 0.875rem", border: `1px solid ${COLORS.plumMid}`, background: COLORS.butter, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, cursor: "pointer" }}
              >
                <Clock size={11} /> Mark Scheduled
              </button>
            )}

            {taskState !== "done" && (
              <button
                onClick={(e) => { e.stopPropagation(); onTaskStateChange("done"); }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.4rem 0.875rem", border: `1px solid ${UI.sage}`, background: COLORS.sageLight, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.sage, cursor: "pointer" }}
              >
                <CheckCircle2 size={11} /> Mark Done
              </button>
            )}

            {taskState !== "none" && (
              <button
                onClick={(e) => { e.stopPropagation(); onTaskStateChange("none"); }}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", padding: "0.4rem 0.875rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer" }}
              >
                <X size={11} /> Undo
              </button>
            )}
          </div>
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
      <div style={{ border: `1px dashed ${UI.rule}`, padding: "2.5rem", textAlign: "center" }}>
        <Calendar size={28} color={UI.rule} style={{ margin: "0 auto 0.5rem" }} />
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>No scheduled maintenance yet.</p>
        <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, marginTop: "0.25rem" }}>
          Click "Add to schedule" on any system card to populate your 5-year calendar.
        </p>
      </div>
    );
  }

  const renderEntry = (entry: ScheduleEntry) => (
    <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", padding: "0.625rem 0.875rem", background: entry.isCompleted ? UI.paper : COLORS.white, opacity: entry.isCompleted ? 0.6 : 1 }}>
      <button
        onClick={() => !entry.isCompleted && onComplete(entry.id)}
        style={{ width: "1rem", height: "1rem", border: `2px solid ${entry.isCompleted ? UI.sage : UI.rule}`, background: entry.isCompleted ? UI.sage : COLORS.white, display: "flex", alignItems: "center", justifyContent: "center", cursor: entry.isCompleted ? "default" : "pointer", flexShrink: 0, marginTop: "0.1rem" }}
      >
        {entry.isCompleted && <CheckCircle2 size={8} color={COLORS.white} />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.85rem", fontWeight: 600, color: UI.ink }}>{entry.systemName}</div>
        <div style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.04em" }}>
          {entry.plannedMonth ? `${MONTH_NAMES[entry.plannedMonth - 1]} · ` : ""}{entry.taskDescription}
          {entry.estimatedCostCents ? ` · ~${maintenanceService.formatCents(entry.estimatedCostCents)}` : ""}
        </div>
      </div>
      <button onClick={() => onDelete(entry.id)} style={{ color: UI.inkLight, background: "none", border: "none", cursor: "pointer", padding: "0.125rem", flexShrink: 0 }}>
        <X size={11} />
      </button>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Total pending budget banner */}
      {pending.length > 0 && (
        <div style={{ border: `1px solid ${UI.rule}`, padding: "0.875rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center", background: COLORS.white }}>
          <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
            {pending.length} tasks scheduled
          </span>
          <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.75rem", color: UI.ink }}>
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
          <div key={year} style={{ border: `1px solid ${isCurrentYear ? UI.rust : UI.rule}`, background: COLORS.white, overflow: "hidden" }}>
            <div style={{
              padding: "0.625rem 1rem", borderBottom: `1px solid ${isCurrentYear ? UI.rust : UI.rule}`,
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: isCurrentYear ? COLORS.blush : UI.paper,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.1em", color: isCurrentYear ? UI.rust : UI.inkLight }}>
                  {year}
                </span>
                {isCurrentYear && (
                  <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.rust, border: `1px solid ${UI.rust}`, padding: "0.1rem 0.35rem" }}>
                    This year
                  </span>
                )}
              </div>
              <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: budget > 0 ? UI.ink : UI.inkLight, fontWeight: budget > 0 ? 700 : 400 }}>
                {budget > 0 ? maintenanceService.formatCents(budget) : "No estimate"}
              </span>
            </div>

            {yearEntries.length === 0 ? (
              <div style={{ padding: "0.75rem 1rem" }}>
                <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                  No tasks scheduled — add from System Health tab
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: UI.rule }}>
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
      <div style={{ background: COLORS.white, padding: "1.5rem", maxWidth: "26rem", width: "100%", border: `1px solid ${UI.rule}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.12em", textTransform: "uppercase", color: UI.inkLight }}>
            Schedule {pred.systemName} Work
          </p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: UI.inkLight }}><X size={16} /></button>
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
          <button onClick={onClose} style={{ flex: 1, padding: "0.6rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", color: UI.inkLight }}>
            Cancel
          </button>
          <button onClick={save} disabled={!year || !desc} style={{ flex: 2, padding: "0.6rem", border: `1px solid ${UI.ink}`, background: UI.ink, color: COLORS.white, fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>
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
            background: m.role === "user" ? UI.ink : UI.paper,
            color: m.role === "user" ? COLORS.white : UI.ink,
            fontFamily: UI.mono, fontSize: "0.7rem", letterSpacing: "0.03em", lineHeight: 1.6,
          }}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: `1px solid ${UI.rule}`, padding: "0.75rem 1rem", display: "flex", gap: "0.5rem" }}>
        <input
          value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask about your home systems…" disabled={loading}
          style={{ flex: 1, padding: "0.5rem 0.75rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.7rem", outline: "none", background: COLORS.white }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "0.5rem 0.875rem", border: `1px solid ${UI.ink}`, background: UI.ink, color: COLORS.white, cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.6 : 1 }}>
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

  const [searchParams] = useSearchParams();
  const deepLinkSystem = searchParams.get("system");    // e.g. "HVAC"

  const [selectedId, setSelectedId]         = useState(String(properties[0]?.id ?? ""));
  const [showSystemAges, setShowSystemAges] = useState(false);
  const [report, setReport]         = useState<MaintenanceReport | null>(null);
  const [activeTab, setActiveTab]   = useState<Tab>(deepLinkSystem ? "systems" : "systems");
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleTarget, setScheduleTarget]   = useState<SystemPrediction | null>(null);
  const [taskStates, setTaskStates] = useState<Record<string, TaskState>>(() => {
    try { return JSON.parse(localStorage.getItem("homegentic_task_states") ?? "{}"); }
    catch { return {}; }
  });

  const taskKey = (systemName: string) => `${selectedId}::${systemName}`;
  const setTaskState = (systemName: string, state: TaskState) => {
    setTaskStates((prev) => {
      const next = { ...prev, [taskKey(systemName)]: state };
      localStorage.setItem("homegentic_task_states", JSON.stringify(next));
      return next;
    });
  };

  const currentYear = new Date().getFullYear();
  const [annualTaskDone, setAnnualTaskDone] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem("homegentic_annual_tasks") ?? "{}"); }
    catch { return {}; }
  });
  const annualKey = (taskName: string) => `${selectedId}::${taskName}::${currentYear}`;
  const toggleAnnualTask = (taskName: string) => {
    setAnnualTaskDone((prev) => {
      const key  = annualKey(taskName);
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("homegentic_annual_tasks", JSON.stringify(next));
      return next;
    });
  };

  const [userTier, setUserTier] = useState<PlanTier>("Free");
  useEffect(() => {
    paymentService.getMySubscription().then((s) => setUserTier(s.tier)).catch((e) => console.error("[PredictiveMaintenancePage] subscription load failed:", e));
  }, []);

  const property = properties.find((p) => String(p.id) === selectedId);
  const propJobs = jobs.filter((j) => j.propertyId === selectedId);

  // Market recommendations indexed by service category for O(1) lookup in SystemCard
  const marketRecsByCategory = React.useMemo<Record<string, ProjectRecommendation>>(() => {
    if (!property) return {};
    const recs = marketService.recommendValueAddingProjects(
      {
        yearBuilt:    Number(property.yearBuilt),
        squareFeet:   Number(property.squareFeet),
        propertyType: String(property.propertyType),
        state:        property.state,
        zipCode:      property.zipCode,
      },
      propJobs.map((j) => ({
        serviceType:   j.serviceType,
        completedYear: j.date ? parseInt(j.date.split("-")[0], 10) : new Date().getFullYear(),
        amountCents:   j.amount,
        isDiy:         j.isDiy,
        isVerified:    j.status === "verified",
      })),
      0
    );
    const map: Record<string, ProjectRecommendation> = {};
    for (const r of recs) map[r.category] = r;
    return map;
  }, [selectedId, property, propJobs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!property) return;
    const systemAges = systemAgesService.get(selectedId);
    setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs, systemAges, String(property.state)));
    maintenanceService.getScheduleByProperty(String(property.id)).then(setScheduleEntries);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // One-tap add: if ?system=HVAC is in the URL, open the schedule modal for that system
  React.useEffect(() => {
    if (!deepLinkSystem || !report) return;
    const pred = report.systemPredictions.find(
      (p) => p.systemName.toLowerCase() === deepLinkSystem.toLowerCase()
    );
    if (pred) setScheduleTarget(pred);
  }, [deepLinkSystem, report]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScheduleSave = (entry: ScheduleEntry) => { setScheduleEntries((prev) => [...prev, entry]); setActiveTab("schedule"); };
  const handleComplete = async (id: string) => { await maintenanceService.markCompleted(id); setScheduleEntries((prev) => prev.map((e) => (e.id === id ? { ...e, isCompleted: true } : e))); };
  const handleDelete   = (id: string) => { maintenanceService.deleteEntry(id); setScheduleEntries((prev) => prev.filter((e) => e.id !== id)); };

  const criticalCount = report?.systemPredictions.filter((p) => p.urgency === "Critical").length ?? 0;
  const soonCount     = report?.systemPredictions.filter((p) => p.urgency === "Soon").length ?? 0;

  // Cross-property overview (only computed when 2+ properties)
  const allPropertyReports = React.useMemo(() => {
    if (properties.length < 2) return [];
    return properties.map((p) => {
      const pJobs = jobs.filter((j) => j.propertyId === String(p.id));
      const ages  = systemAgesService.get(String(p.id));
      const r     = maintenanceService.predict(Number(p.yearBuilt), pJobs, ages, String(p.state));
      return {
        property: p,
        critical: r.systemPredictions.filter((s) => s.urgency === "Critical").length,
        soon:     r.systemPredictions.filter((s) => s.urgency === "Soon").length,
        overdueSystems: r.systemPredictions.filter((s) => s.yearsRemaining < 0),
      };
    });
  }, [properties, jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { id: Tab; label: string }[] = [
    { id: "systems",  label: "System Health" },
    { id: "annual",   label: "Annual Tasks" },
    { id: "schedule", label: `Schedule (${scheduleEntries.filter((e) => !e.isCompleted).length})` },
    { id: "advisor",  label: "AI Advisor" },
  ];

  return (
    <Layout>
      <style>{`
        @media print {
          /* Hide everything except the print calendar */
          body > * { display: none !important; }
          #hf-print-calendar { display: block !important; }

          #hf-print-calendar {
            font-family: ${FONTS.sans};
            color: ${COLORS.plum};
            padding: 2rem;
          }
          .hf-print-header { margin-bottom: 1.5rem; border-bottom: 2px solid ${COLORS.plum}; padding-bottom: 0.75rem; }
          .hf-print-header h1 { font-family: ${FONTS.serif}; font-size: 1.6rem; font-weight: 900; margin: 0 0 0.25rem; }
          .hf-print-header p  { font-size: 0.65rem; letter-spacing: 0.06em; color: ${COLORS.plumMid}; margin: 0; }
          .hf-print-section   { margin-bottom: 1.5rem; }
          .hf-print-section-title { font-size: 0.6rem; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700; border-bottom: 1px solid ${COLORS.rule}; padding-bottom: 0.25rem; margin-bottom: 0.5rem; }
          .hf-print-row { display: flex; justify-content: space-between; align-items: baseline; padding: 0.3rem 0; border-bottom: 1px dotted ${COLORS.rule}; font-size: 0.72rem; }
          .hf-print-row-label { flex: 1; }
          .hf-print-row-meta  { font-size: 0.6rem; color: ${COLORS.plumMid}; margin-left: 1rem; }
          .hf-print-row-cost  { font-weight: 700; margin-left: 1rem; }
          .hf-print-urgency-critical { color: ${COLORS.sage}; font-weight: 700; }
          .hf-print-urgency-soon     { color: ${COLORS.plumMid}; font-weight: 700; }
          .hf-print-footer { margin-top: 2rem; font-size: 0.55rem; color: ${COLORS.plumMid}; letter-spacing: 0.05em; border-top: 1px solid ${COLORS.rule}; padding-top: 0.5rem; }
        }
        @media screen { #hf-print-calendar { display: none; } }
      `}</style>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1.5rem" }}>

        <div style={{ marginBottom: "2rem" }}>
          <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.18em", textTransform: "uppercase", color: UI.rust, marginBottom: "0.5rem" }}>
            Maintenance
          </div>
          <h1 style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "2rem", lineHeight: 1, marginBottom: "0.375rem" }}>
            Predictive Maintenance
          </h1>
          <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>
            System health predictions based on home age and service history.
          </p>
        </div>

        {properties.length === 0 ? (
          <div style={{ border: `1px dashed ${UI.rule}`, padding: "3rem", textAlign: "center" }}>
            <Wrench size={32} color={UI.rule} style={{ margin: "0 auto 0.75rem" }} />
            <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: UI.inkLight }}>Add a property to see maintenance predictions.</p>
          </div>
        ) : (
          <>
            {/* Cross-property overdue overview */}
            {allPropertyReports.length >= 2 && (
              <div style={{ border: `1px solid ${UI.rule}`, marginBottom: "1.5rem", background: COLORS.white }}>
                <div style={{ padding: "0.75rem 1.25rem", borderBottom: `1px solid ${UI.rule}`, background: UI.paper }}>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: UI.inkLight }}>
                    All Properties — Overdue Overview
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: UI.rule }}>
                  {allPropertyReports.map(({ property: p, critical, soon, overdueSystems }) => (
                    <button
                      key={String(p.id)}
                      onClick={() => setSelectedId(String(p.id))}
                      style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.75rem 1.25rem", background: String(p.id) === selectedId ? COLORS.blush : COLORS.white, border: "none", cursor: "pointer", textAlign: "left", width: "100%" }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontWeight: 600, fontSize: "0.875rem", color: UI.ink, marginBottom: "0.2rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {p.address}
                        </p>
                        {overdueSystems.length > 0 ? (
                          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.04em" }}>
                            Overdue: {overdueSystems.map((s) => s.systemName).join(", ")}
                          </p>
                        ) : (
                          <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.sage, letterSpacing: "0.04em" }}>No overdue systems</p>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                        {critical > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.2rem 0.5rem", border: `1px solid ${UI.rust}`, fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.rust }}>
                            <AlertTriangle size={9} /> {critical}
                          </span>
                        )}
                        {soon > 0 && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", padding: "0.2rem 0.5rem", border: `1px solid ${COLORS.plumMid}`, fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid }}>
                            <Clock size={9} /> {soon}
                          </span>
                        )}
                        {critical === 0 && soon === 0 && (
                          <span style={{ padding: "0.2rem 0.5rem", border: `1px solid ${UI.sage}`, fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.sage }}>
                            Good
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(String(e.target.value))}
                style={{ padding: "0.5rem 0.875rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.65rem", background: COLORS.white, cursor: "pointer" }}
              >
                {properties.map((p) => (
                  <option key={String(p.id)} value={String(p.id)}>{p.address}, {p.city} ({String(p.yearBuilt)})</option>
                ))}
              </select>
              <button
                onClick={() => setShowSystemAges(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.875rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer" }}
              >
                <Settings2 size={12} />
                {systemAgesService.hasAny(selectedId) ? "Edit system ages" : "Set system ages"}
              </button>

              {report && (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {criticalCount > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", border: `1px solid ${UI.rust}`, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.rust }}>
                      <AlertTriangle size={10} /> {criticalCount} Critical
                    </span>
                  )}
                  {soonCount > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", padding: "0.25rem 0.625rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.inkLight }}>
                      <Clock size={10} /> {soonCount} Soon
                    </span>
                  )}
                  {report.totalBudgetLowCents > 0 && (
                    <span style={{ padding: "0.25rem 0.625rem", border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: UI.inkLight }}>
                      Budget: {maintenanceService.formatCents(report.totalBudgetLowCents)}–{maintenanceService.formatCents(report.totalBudgetHighCents)}
                    </span>
                  )}
                </div>
              )}
              {report && (
                <button
                  onClick={() => window.print()}
                  style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "0.35rem", padding: "0.5rem 0.875rem", border: `1px solid ${UI.rule}`, background: COLORS.white, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer" }}
                >
                  <Download size={12} /> Export PDF
                </button>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", borderBottom: `1px solid ${UI.rule}`, marginBottom: "1.25rem" }}>
              {TABS.map((tab) => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{ padding: "0.6rem 1.1rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", border: "none", borderBottom: activeTab === tab.id ? `2px solid ${UI.rust}` : "2px solid transparent", color: activeTab === tab.id ? UI.rust : UI.inkLight, background: "transparent", cursor: "pointer", marginBottom: "-1px" }}>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "systems" && report && (() => {
              const active = report.systemPredictions.filter((p) => taskStates[taskKey(p.systemName)] !== "done");
              const done   = report.systemPredictions.filter((p) => taskStates[taskKey(p.systemName)] === "done");
              const zone   = report.climateZone;
              const adjustedSystems = Object.keys(zone.lifespanMultipliers);
              return (
                <>
                  {zone.id !== "mixed" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem", padding: "0.65rem 0.875rem", background: COLORS.sky, border: `1px solid ${COLORS.plum}40`, marginBottom: "0.75rem" }}>
                      <span style={{ fontSize: "0.85rem", lineHeight: 1 }}>🌡️</span>
                      <div>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plum, fontWeight: 700 }}>
                          {zone.name} Climate
                        </span>
                        <span style={{ fontFamily: FONTS.sans, fontSize: "0.75rem", color: COLORS.plumDark, marginLeft: "0.5rem" }}>
                          {adjustedSystems.join(", ")} lifespans adjusted for local conditions
                        </span>
                      </div>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: UI.rule }}>
                    {active.map((pred) => (
                      <SystemCard
                        key={pred.systemName}
                        pred={pred}
                        onSchedule={setScheduleTarget}
                        marketRec={marketRecsByCategory[pred.systemName]}
                        taskState={taskStates[taskKey(pred.systemName)] ?? "none"}
                        onTaskStateChange={(s) => setTaskState(pred.systemName, s)}
                        isFree={userTier === "Free"}
                      />
                    ))}
                  </div>
                  {done.length > 0 && (
                    <details style={{ marginTop: "1rem" }}>
                      <summary style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, cursor: "pointer", padding: "0.5rem 0", userSelect: "none" }}>
                        Completed systems ({done.length})
                      </summary>
                      <div style={{ display: "flex", flexDirection: "column", gap: "1px", background: UI.rule, marginTop: "0.5rem" }}>
                        {done.map((pred) => (
                          <SystemCard
                            key={pred.systemName}
                            pred={pred}
                            onSchedule={setScheduleTarget}
                            marketRec={marketRecsByCategory[pred.systemName]}
                            taskState="done"
                            onTaskStateChange={(s) => setTaskState(pred.systemName, s)}
                            isFree={userTier === "Free"}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}

            {activeTab === "annual" && report && (() => {
              const pending = report.annualTasks.filter((t) => !annualTaskDone[annualKey(t.task)]);
              const done    = report.annualTasks.filter((t) =>  annualTaskDone[annualKey(t.task)]);
              const pct     = report.annualTasks.length > 0 ? Math.round((done.length / report.annualTasks.length) * 100) : 0;
              const pendingBudgetLow  = pending.reduce((s, t) => s + t.estimatedCostLowCents,  0);
              const pendingBudgetHigh = pending.reduce((s, t) => s + t.estimatedCostHighCents, 0);
              return (
                <>
                  {/* Progress bar + budget */}
                  <div style={{ marginBottom: "1.25rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>
                        {currentYear} Annual Tasks
                      </span>
                      <span style={{ fontFamily: UI.mono, fontSize: "0.65rem", fontWeight: 700, color: pct === 100 ? UI.sage : UI.ink }}>
                        {done.length} / {report.annualTasks.length} done ({pct}%)
                      </span>
                    </div>
                    <div style={{ height: "4px", background: UI.rule }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? UI.sage : UI.rust, transition: "width 0.3s" }} />
                    </div>
                    {pending.length > 0 && (
                      <div style={{ marginTop: "0.625rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: UI.inkLight }}>
                          {pending.length} task{pending.length !== 1 ? "s" : ""} remaining
                        </span>
                        <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.ink }}>
                          Est. remaining cost: <strong>{maintenanceService.formatCents(pendingBudgetLow)}–{maintenanceService.formatCents(pendingBudgetHigh)}</strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Pending tasks */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "1px", background: UI.rule }}>
                    {pending.map((task) => (
                      <div key={task.task} style={{ background: COLORS.white, padding: "1rem" }}>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={false}
                            onChange={() => toggleAnnualTask(task.task)}
                            style={{ marginTop: "0.2rem", accentColor: UI.rust, cursor: "pointer", flexShrink: 0 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: "0.875rem", color: UI.ink, marginBottom: "0.375rem" }}>{task.task}</div>
                            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                              <span style={{ border: `1px solid ${UI.rule}`, fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase", color: UI.rust, padding: "0.125rem 0.4rem" }}>
                                {task.frequency}
                              </span>
                              {task.season && <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>{task.season}</span>}
                            </div>
                            <div style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: UI.ink, fontWeight: 600 }}>
                              {task.estimatedCost}
                              {task.diyViable && (
                                <span style={{ marginLeft: "0.5rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.08em", color: UI.sage, border: `1px solid ${UI.sage}40`, padding: "0.1rem 0.4rem", textTransform: "uppercase" }}>
                                  DIY
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      </div>
                    ))}
                  </div>

                  {/* Done tasks */}
                  {done.length > 0 && (
                    <details style={{ marginTop: "1rem" }}>
                      <summary style={{ fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.sage, cursor: "pointer", padding: "0.5rem 0", userSelect: "none" }}>
                        ✓ Done this year ({done.length})
                      </summary>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))", gap: "1px", background: UI.rule, marginTop: "0.5rem" }}>
                        {done.map((task) => (
                          <div key={task.task} style={{ background: COLORS.sageLight, padding: "1rem", opacity: 0.7 }}>
                            <label style={{ display: "flex", alignItems: "flex-start", gap: "0.625rem", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={true}
                                onChange={() => toggleAnnualTask(task.task)}
                                style={{ marginTop: "0.2rem", accentColor: UI.sage, cursor: "pointer", flexShrink: 0 }}
                              />
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "0.875rem", color: UI.inkLight, textDecoration: "line-through", marginBottom: "0.2rem" }}>{task.task}</div>
                                <span style={{ fontFamily: UI.mono, fontSize: "0.55rem", color: UI.sage }}>Completed {currentYear}</span>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              );
            })()}

            {activeTab === "schedule" && (
              userTier === "Free" ? (
                <UpgradeGate
                  feature="5-Year Maintenance Calendar"
                  description="Plan ahead with a full 5-year schedule. Drag systems onto your calendar and export a printable PDF."
                  icon={<Calendar size={20} color={COLORS.plumMid} />}
                  style={{ marginTop: "0.5rem" }}
                />
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                    <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight }}>5-Year Maintenance Calendar</p>
                    <button onClick={() => setActiveTab("systems")} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", fontFamily: UI.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.inkLight, border: `1px solid ${UI.rule}`, background: COLORS.white, padding: "0.35rem 0.75rem", cursor: "pointer" }}>
                      <PlusCircle size={11} /> Add from systems
                    </button>
                  </div>
                  <FiveYearCalendar entries={scheduleEntries} onComplete={handleComplete} onDelete={handleDelete} onAddYear={() => setActiveTab("systems")} />
                </div>
              )
            )}

            {activeTab === "advisor" && property && (
              <div style={{ border: `1px solid ${UI.rule}`, background: COLORS.white, overflow: "hidden", height: "30rem", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "0.875rem 1.25rem", borderBottom: `1px solid ${UI.rule}`, display: "flex", alignItems: "center", gap: "0.5rem", background: UI.paper }}>
                  <Bot size={14} color={UI.rust} />
                  <span style={{ fontFamily: UI.mono, fontWeight: 700, fontSize: "0.65rem", letterSpacing: "0.1em", textTransform: "uppercase", color: UI.ink }}>
                    AI Maintenance Advisor
                  </span>
                  <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>· Powered by Claude</span>
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

      {/* ── Print-only calendar ───────────────────────────────────────────── */}
      <div id="hf-print-calendar">
        {report && property && (() => {
          const zone = report.climateZone;
          const urgent = report.systemPredictions.filter((p) => p.urgency === "Critical" || p.urgency === "Soon");
          const watching = report.systemPredictions.filter((p) => p.urgency === "Watch" || p.urgency === "Good");
          const totalReplacementLow  = urgent.reduce((s, p) => s + p.estimatedCostLowCents, 0);
          const totalReplacementHigh = urgent.reduce((s, p) => s + p.estimatedCostHighCents, 0);

          const tasksBySeason: Record<string, typeof report.annualTasks> = { Spring: [], Summer: [], Fall: [], Winter: [], "Year-round": [] };
          for (const t of report.annualTasks) {
            const bucket = t.season ?? "Year-round";
            (tasksBySeason[bucket] ??= []).push(t);
          }

          return (
            <>
              <div className="hf-print-header">
                <h1>HomeGentic Maintenance Calendar</h1>
                <p>{property.address}, {property.city}, {property.state} {property.zipCode} · Built {String(property.yearBuilt)} · Generated {new Date().toLocaleDateString()}</p>
                {zone.id !== "mixed" && <p style={{ marginTop: "0.25rem" }}>Climate zone: {zone.name} — {zone.description}</p>}
              </div>

              <div className="hf-print-section">
                <div className="hf-print-section-title">System Health Summary</div>
                {urgent.map((p) => (
                  <div key={p.systemName} className="hf-print-row">
                    <span className={`hf-print-row-label hf-print-urgency-${p.urgency.toLowerCase()}`}>{p.urgency === "Critical" ? "⚠" : "⏰"} {p.systemName}</span>
                    <span className="hf-print-row-meta">{p.yearsRemaining < 0 ? `${Math.abs(p.yearsRemaining)}y overdue` : `${p.yearsRemaining}y remaining`}</span>
                    <span className="hf-print-row-cost">{maintenanceService.formatCents(p.estimatedCostLowCents)}–{maintenanceService.formatCents(p.estimatedCostHighCents)}</span>
                  </div>
                ))}
                {watching.map((p) => (
                  <div key={p.systemName} className="hf-print-row">
                    <span className="hf-print-row-label">{p.systemName}</span>
                    <span className="hf-print-row-meta">{p.yearsRemaining}y remaining · {p.urgency}</span>
                    <span className="hf-print-row-cost">—</span>
                  </div>
                ))}
                {totalReplacementLow > 0 && (
                  <div className="hf-print-row" style={{ marginTop: "0.5rem", borderBottom: "none", fontWeight: 700 }}>
                    <span className="hf-print-row-label">Replacement budget (Critical + Soon)</span>
                    <span className="hf-print-row-cost">{maintenanceService.formatCents(totalReplacementLow)}–{maintenanceService.formatCents(totalReplacementHigh)}</span>
                  </div>
                )}
              </div>

              <div className="hf-print-section">
                <div className="hf-print-section-title">Annual Maintenance Tasks by Season</div>
                {Object.entries(tasksBySeason).filter(([, tasks]) => tasks.length > 0).map(([season, tasks]) => (
                  <div key={season} style={{ marginBottom: "0.75rem" }}>
                    <div style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.25rem" }}>{season}</div>
                    {tasks.map((t) => (
                      <div key={t.task} className="hf-print-row">
                        <span className="hf-print-row-label">□ {t.task}</span>
                        <span className="hf-print-row-meta">{t.frequency}</span>
                        <span className="hf-print-row-cost">{t.estimatedCost}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="hf-print-row" style={{ borderBottom: "none", fontWeight: 700 }}>
                  <span className="hf-print-row-label">Annual task budget</span>
                  <span className="hf-print-row-cost">{maintenanceService.formatCents(report.annualTaskBudgetLowCents)}–{maintenanceService.formatCents(report.annualTaskBudgetHighCents)}</span>
                </div>
              </div>

              <div className="hf-print-footer">
                Generated by HomeGentic · Records verified on Internet Computer Protocol · homegentic.app
              </div>
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
          // Re-run forecast with updated system ages
          if (property) {
            const updatedAges = systemAgesService.get(selectedId);
            setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs, updatedAges, String(property.state)));
          }
        }}
      />
    </Layout>
  );
}
