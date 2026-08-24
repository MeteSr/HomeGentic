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
import { Send, X, Settings2 } from "lucide-react";
import { systemAgesService } from "@/services/systemAges";
import { useNavigate, useSearchParams } from "react-router-dom";
import SystemAgesModal from "@/components/SystemAgesModal";
import { V2_COLORS, V2_FONTS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

// ── Helpers ────────────────────────────────────────────────────────────────────

function entryDate(e: ScheduleEntry): Date {
  const month = e.plannedMonth !== undefined ? e.plannedMonth - 1 : 0;
  return new Date(e.plannedYear, month, 1);
}

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

function DaysChip({ days }: { days: number }) {
  const label = `IN ${Math.abs(days)} DAYS`;
  const overdue = days < 0;
  const urgent  = days >= 0 && days <= 7;
  const soon    = days > 7 && days <= 30;
  const color   = overdue ? "#DC2626" : urgent ? "#DC2626" : soon ? "#D97706" : C.muted;
  const bg      = overdue ? "#FEF2F2" : urgent ? "#FEF2F2" : soon ? "#FFFBEB" : C.border;
  return (
    <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color, background: bg, borderRadius: 6, padding: "4px 8px", whiteSpace: "nowrap" }}>
      {overdue ? "OVERDUE" : label}
    </span>
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
          <div key={i} style={{ maxWidth: "85%", alignSelf: m.role === "user" ? "flex-end" : "flex-start", padding: "0.625rem 0.875rem", background: m.role === "user" ? C.ink : "#fff", color: m.role === "user" ? "#fff" : C.ink, fontFamily: F.body, fontSize: "0.8125rem", lineHeight: 1.5, borderRadius: "0.5rem", border: m.role === "assistant" ? `1px solid ${C.border}` : "none" }}>
            {m.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, padding: "0.75rem 1rem", display: "flex", gap: "0.5rem" }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()} placeholder="Ask about your home systems…" disabled={loading} style={{ flex: 1, padding: "0.5rem 0.75rem", border: `1px solid ${C.border}`, borderRadius: 8, fontFamily: F.body, fontSize: "0.8125rem", outline: "none", background: "white" }} />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: "0.5rem 0.875rem", border: "none", background: C.blue, color: "white", borderRadius: 8, cursor: loading || !input.trim() ? "not-allowed" : "pointer", opacity: loading || !input.trim() ? 0.6 : 1 }}>
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

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", fontFamily: F.body, fontSize: 13, border: `1px solid ${C.border}`, borderRadius: 8, outline: "none", background: "#fff", color: C.ink, boxSizing: "border-box" };
  const lbl: React.CSSProperties = { display: "block", fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "1rem" }} onClick={onClose}>
      <div style={{ background: "#fff", padding: "1.5rem", maxWidth: "26rem", width: "100%", borderRadius: 12, border: `1px solid ${C.border}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <p style={{ fontFamily: F.display, fontWeight: 700, fontSize: 16, color: C.ink, margin: 0 }}>Schedule {pred.systemName} Work</p>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted }}><X size={16} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div><label style={lbl}>Task description</label><input style={inp} value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <div style={{ flex: 1 }}><label style={lbl}>Planned year *</label><input type="number" style={inp} value={year} min={currentYear} max={currentYear + 30} onChange={(e) => setYear(e.target.value)} /></div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Month (optional)</label>
              <select style={inp} value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="">Any</option>
                {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div><label style={lbl}>Estimated cost ($)</label><input type="number" style={inp} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Optional" /></div>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
          <button onClick={onClose} style={{ flex: 1, padding: "0.6rem", border: `1px solid ${C.border}`, background: "white", fontFamily: F.body, fontSize: 14, cursor: "pointer", color: C.muted, borderRadius: 100 }}>Cancel</button>
          <button onClick={save} disabled={!year || !desc} style={{ flex: 2, padding: "0.6rem", border: "none", background: C.blue, color: "white", fontFamily: F.body, fontSize: 14, fontWeight: 700, cursor: "pointer", borderRadius: 100, opacity: !year || !desc ? 0.6 : 1 }}>Save to Schedule</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PredictiveMaintenancePage() {
  const { properties } = usePropertyStore();
  const { jobs }       = useJobStore();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkSystem = searchParams.get("system");

  const [selectedId,     setSelectedId]     = useState(String(properties[0]?.id ?? ""));
  const [showSystemAges, setShowSystemAges] = useState(false);
  const [showChatPanel,  setShowChatPanel]  = useState(false);
  const [report,         setReport]         = useState<MaintenanceReport | null>(null);
  const [scheduleEntries, setScheduleEntries] = useState<ScheduleEntry[]>([]);
  const [scheduleTarget,  setScheduleTarget]  = useState<SystemPrediction | null>(null);

  const property = properties.find(p => String(p.id) === selectedId);
  const propJobs = jobs.filter(j => j.propertyId === selectedId);

  useEffect(() => {
    if (!property) return;
    const systemAges = systemAgesService.get(selectedId);
    setReport(maintenanceService.predict(Number(property.yearBuilt), propJobs, systemAges, String(property.state)));
    maintenanceService.getScheduleByProperty(String(property.id)).then(setScheduleEntries);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!deepLinkSystem || !report) return;
    const pred = report.systemPredictions.find(p => p.systemName.toLowerCase() === deepLinkSystem.toLowerCase());
    if (pred) setScheduleTarget(pred);
  }, [deepLinkSystem, report]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleScheduleSave = (entry: ScheduleEntry) => setScheduleEntries(prev => [...prev, entry]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const allTasks      = report?.annualTasks ?? [];
  const criticalPreds = report?.systemPredictions.filter(p => p.urgency === "Critical") ?? [];
  const soonPreds     = report?.systemPredictions.filter(p => p.urgency === "Soon") ?? [];
  const dueSoonCount  = allTasks.filter((t, i) => daysUntil(taskDueDate(t, i)) <= 30).length + criticalPreds.length;

  const upcomingTasksWithDates = allTasks.map((t, i) => ({ task: t, due: taskDueDate(t, i) }));

  // Seasonal tips from location/season
  const month = new Date().getMonth();
  const season = month >= 2 && month <= 4 ? "Spring" : month >= 5 && month <= 7 ? "Summer" : month >= 8 && month <= 10 ? "Fall" : "Winter";
  const climate = property?.state === "TN" || property?.state === "NC" || property?.state === "VA" ? "Mixed-humid" : "Zone";

  const SEASONAL_TIPS: { title: string; desc: string }[] = month >= 8 && month <= 10
    ? [
        { title: "Clear gutters before autumn rain",     desc: `Mixed humid climate zone. Leaf drop starts mid October in Nashville.` },
        { title: "Service the HVAC before the switchover", desc: "Cooling to heating changeover is the most common failure window." },
        { title: "Check crawlspace humidity",             desc: `Vapor barrier went in June 2026. Confirm it is holding under 60 percent.` },
      ]
    : month >= 5 && month <= 7
    ? [
        { title: "Schedule AC tune-up before peak heat",  desc: "Summer is the busiest time for HVAC calls — book early." },
        { title: "Inspect roof for winter damage",        desc: "Look for lifted shingles or damaged flashing before rain season." },
        { title: "Test smoke and CO detectors",           desc: "Detector lifespan is 10 years. Check manufacture date." },
      ]
    : [
        { title: "Schedule furnace tune-up",              desc: "Pre-season service prevents 80% of heating breakdowns." },
        { title: "Check weatherstripping and seals",      desc: "Gaps around doors and windows are the largest heating loss." },
        { title: "Flush water heater sediment",           desc: "Annual flush extends tank life by 3–5 years." },
      ];

  return (
    <Layout>
      <div style={{ background: V2_COLORS.paper, minHeight: "100%", padding: "28px 32px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              MAINTENANCE
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 900, fontSize: "1.875rem", color: C.ink, margin: 0 }}>
              {dueSoonCount} task{dueSoonCount !== 1 ? "s" : ""} due in the next 30 days
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "9px 18px", cursor: "pointer" }}>
              Log work
            </button>
            <button onClick={() => navigate("/dashboard")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "9px 18px", cursor: "pointer" }}>
              Back to dashboard
            </button>
            <button onClick={() => setShowSystemAges(true)} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F.body, fontSize: 13, color: C.muted, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "9px 16px", cursor: "pointer" }}>
              <Settings2 size={14} /> System ages
            </button>
          </div>
        </div>

        {properties.length === 0 ? (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: "3rem", textAlign: "center" }}>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>Add a property to see maintenance predictions.</p>
          </div>
        ) : (
          <>
            {/* Task list */}
            <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", marginBottom: 24, overflow: "hidden" }}>
              {upcomingTasksWithDates.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center" }}>
                  <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>No tasks generated yet. Set your system ages to get predictions.</p>
                  <button onClick={() => setShowSystemAges(true)} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.blue, background: "none", border: "none", cursor: "pointer", marginTop: 8 }}>
                    Update system ages →
                  </button>
                </div>
              ) : (
                upcomingTasksWithDates.slice(0, 8).map(({ task, due }, i) => {
                  const days     = daysUntil(due);
                  const isUrgent = days <= 7 || days < 0;
                  const hasPro   = task.task.toLowerCase().includes("hvac") || task.task.toLowerCase().includes("chimney") || task.task.toLowerCase().includes("furnace");
                  const matchedPred = report?.systemPredictions.find(p =>
                    task.task.toLowerCase().includes(p.systemName.toLowerCase())
                  );

                  return (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 20, padding: "18px 24px", borderBottom: `1px solid ${C.border}` }}>
                      {/* Date bubble */}
                      <div style={{ width: 42, flexShrink: 0, textAlign: "center" }}>
                        <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.06em" }}>
                          {due.toLocaleDateString(undefined, { month: "short" }).toUpperCase()}
                        </div>
                        <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 900, color: isUrgent ? "#DC2626" : C.ink, lineHeight: 1.1 }}>
                          {due.getDate()}
                        </div>
                      </div>

                      {/* Task details */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                          {task.task}
                        </div>
                        <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginBottom: 4 }}>
                          {task.frequency}
                          {matchedPred?.contractorName ? ` · ${matchedPred.contractorName}` : ""}
                        </div>
                        {task.notes && (
                          <p style={{ fontFamily: F.body, fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.4 }}>{task.notes}</p>
                        )}
                      </div>

                      <DaysChip days={days} />

                      {/* CTA */}
                      {hasPro ? (
                        <button onClick={() => navigate("/contractors")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap" }}>
                          Find pro
                        </button>
                      ) : (
                        <button onClick={() => navigate("/quotes/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap" }}>
                          Book
                        </button>
                      )}
                    </div>
                  );
                })
              )}

              {/* Critical predictions */}
              {criticalPreds.map((pred, i) => (
                <div key={`crit-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 20, padding: "18px 24px", borderBottom: `1px solid ${C.border}`, background: "#FEF2F2" }}>
                  <div style={{ width: 42, flexShrink: 0, textAlign: "center" }}>
                    <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#DC2626" }}>NOW</div>
                    <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 900, color: "#DC2626", lineHeight: 1.1 }}>!</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                      {pred.systemName} replacement needed
                    </div>
                    <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>
                      {Math.abs(pred.yearsRemaining)} year{Math.abs(pred.yearsRemaining) !== 1 ? "s" : ""} past rated life · {maintenanceService.formatCents(pred.estimatedCostLowCents)}–{maintenanceService.formatCents(pred.estimatedCostHighCents)} estimated
                    </div>
                  </div>
                  <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, padding: "4px 8px" }}>OVERDUE</span>
                  <button onClick={() => navigate("/quotes/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: "#fff", background: "#DC2626", border: "none", borderRadius: 100, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    Get quotes
                  </button>
                </div>
              ))}
            </div>

            {/* Seasonal tips */}
            <div style={{ border: `1px solid #F5ECD7`, borderRadius: 12, background: "#FFFBEB", padding: "18px 24px" }}>
              <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: "#D97706", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
                SEASONAL · {climate.toUpperCase()} · {season.toUpperCase()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {SEASONAL_TIPS.map((tip, i) => (
                  <div key={i}>
                    <div style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: C.ink, marginBottom: 4 }}>{tip.title}</div>
                    <div style={{ fontFamily: F.body, fontSize: 13, color: C.muted, lineHeight: 1.5 }}>{tip.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
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

