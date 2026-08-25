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
import { Send, X, ChevronDown, ChevronUp } from "lucide-react";
import { systemAgesService } from "@/services/systemAges";
import { useNavigate, useSearchParams } from "react-router-dom";
import SystemAgesModal from "@/components/SystemAgesModal";
import { V2_COLORS, V2_FONTS } from "@/theme";

const C = V2_COLORS;
const F = V2_FONTS;

// ── Types ──────────────────────────────────────────────────────────────────────

interface MockVisit {
  dateLabel: string;   // "AUG 26"
  note: string;
  amount: number;      // dollars
  verified: boolean;
}

interface MockRecurring {
  id: string;
  name: string;
  intervalPill: string;   // "7d" | "3mo" | "6mo"
  frequencyLabel: string; // "Weekly" | "Quarterly" | "Semiannual"
  schedule: string;       // "Mon–Nov" or "" for month-based
  contractor: string;
  amountPerVisit: number;
  startDate: string;      // "Mar 2025"
  status: "active" | "due-soon" | "paused";
  pausedSince?: string;
  nextVisitLabel: string; // "Thu, Aug 27" | "Not scheduled"
  nextVisitDate?: string; // for skip button label "Aug 27"
  periodLabel: string;    // "THIS SEASON" | "LAST 12 MO"
  periodTotal: number;
  visits: MockVisit[];
}

// ── Mock recurring data ────────────────────────────────────────────────────────

const MOCK_RECURRING: MockRecurring[] = [
  {
    id: "r1",
    name: "Lawn Maintenance",
    intervalPill: "7d",
    frequencyLabel: "Weekly",
    schedule: "Mon–Nov",
    contractor: "Greenway Lawn Co",
    amountPerVisit: 35,
    startDate: "Mar 2025",
    status: "active",
    nextVisitLabel: "Thu, Aug 27",
    nextVisitDate: "Aug 27",
    periodLabel: "THIS SEASON",
    periodTotal: 1045,
    visits: [
      { dateLabel: "AUG 26", note: "Mow, trim, edge. Front bed re-mulched at no charge.", amount: 35, verified: true },
      { dateLabel: "AUG 19", note: "Mow, trim, edge.", amount: 35, verified: true },
      { dateLabel: "AUG 12", note: "Mow, trim, edge. Noted grub damage near the rear fence.", amount: 35, verified: true },
      { dateLabel: "JUL 29", note: "Mow, trim, edge.", amount: 35, verified: true },
    ],
  },
  {
    id: "r2",
    name: "HVAC Filter Service",
    intervalPill: "3mo",
    frequencyLabel: "Quarterly",
    schedule: "",
    contractor: "Ridgeline HVAC",
    amountPerVisit: 95,
    startDate: "Jun 2024",
    status: "active",
    nextVisitLabel: "Wed, Sep 2",
    nextVisitDate: "Sep 2",
    periodLabel: "LAST 12 MO",
    periodTotal: 380,
    visits: [],
  },
  {
    id: "r3",
    name: "Gutter Cleaning Service",
    intervalPill: "6mo",
    frequencyLabel: "Semiannual",
    schedule: "",
    contractor: "Bell & Sons",
    amountPerVisit: 180,
    startDate: "Apr 2024",
    status: "due-soon",
    nextVisitLabel: "Fri, Aug 21",
    nextVisitDate: "Aug 21",
    periodLabel: "LAST 12 MO",
    periodTotal: 360,
    visits: [],
  },
  {
    id: "r4",
    name: "Pest Control",
    intervalPill: "3mo",
    frequencyLabel: "Quarterly",
    schedule: "",
    contractor: "Volunteer Pest",
    amountPerVisit: 110,
    startDate: "Apr 2021",
    status: "paused",
    pausedSince: "Jun 2026",
    nextVisitLabel: "Not scheduled",
    periodLabel: "LAST 12 MO",
    periodTotal: 220,
    visits: [],
  },
];

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
  const label  = `IN ${Math.abs(days)} DAYS`;
  const overdue = days < 0;
  const urgent  = days >= 0 && days <= 7;
  const soon    = days > 7 && days <= 30;
  const color   = overdue ? "#991B1B" : urgent ? "#991B1B" : soon ? "#92400E" : C.muted;
  const bg      = overdue ? "#FEF2F2" : urgent ? "#FEF2F2" : soon ? "#FFFBEB" : C.border;
  return (
    <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color, background: bg, padding: "4px 8px", whiteSpace: "nowrap" }}>
      {overdue ? "OVERDUE" : label}
    </span>
  );
}

function StatusBadge({ status }: { status: MockRecurring["status"] }) {
  const map = {
    "active":   { label: "ACTIVE",   color: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
    "due-soon": { label: "DUE SOON", color: "#92400E", bg: "#FFFBEB", border: "#FDE68A" },
    "paused":   { label: "PAUSED",   color: "#464B56", bg: "#F0F1F5", border: "#DDDFE6" },
  };
  const s = map[status];
  return (
    <span style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: s.color, background: s.bg, border: `1px solid ${s.border}`, padding: "2px 7px" }}>
      {s.label}
    </span>
  );
}

function IntervalPill({ label, active }: { label: string; active: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: 46, height: 46, flexShrink: 0, background: active ? C.ink : "#E8E5DF", }}>
      <span style={{ fontFamily: F.mono, fontSize: 8, fontWeight: 700, letterSpacing: "0.08em", color: active ? "rgba(255,255,255,0.55)" : C.muted, lineHeight: 1 }}>EVERY</span>
      <span style={{ fontFamily: F.mono, fontSize: 13, fontWeight: 700, color: active ? "#fff" : C.ink, lineHeight: 1.2, marginTop: 2 }}>{label}</span>
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

function RecurringRow({ svc }: { svc: MockRecurring }) {
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
            {svc.schedule ? ` · ${svc.schedule}` : ""}
            {" · "}{svc.contractor}
            {" · "}${svc.amountPerVisit} per visit
            {" · "}started {svc.startDate}
            {svc.status === "paused" && svc.pausedSince ? ` · paused since ${svc.pausedSince}` : ""}
          </div>
        </div>

        {/* Next visit */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={colLabel}>NEXT VISIT</div>
          <div style={{ ...colValue, color: svc.status === "due-soon" ? "#92400E" : C.ink }}>
            {svc.nextVisitLabel}
          </div>
        </div>

        {/* Period total */}
        <div style={{ textAlign: "right", flexShrink: 0, minWidth: 72 }}>
          <div style={colLabel}>{svc.periodLabel}</div>
          <div style={colValue}>${svc.periodTotal.toLocaleString()}</div>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          style={{ display: "flex", alignItems: "center", gap: 5, fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "7px 14px", cursor: "pointer", flexShrink: 0 }}
        >
          {expanded ? "Hide" : "History"} {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {/* Expanded: visit log + actions */}
      {expanded && (
        <div style={{ background: "#FAFAF8", borderTop: `1px solid ${C.border}` }}>
          {svc.visits.length > 0 ? (
            <div>
              {/* Visit log header */}
              <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 60px 90px", gap: 12, padding: "8px 24px 6px 24px", borderBottom: `1px solid ${C.border}` }}>
                {["DATE", "NOTES", "PRICE", ""].map(h => (
                  <span key={h} style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: C.muted }}>{h}</span>
                ))}
              </div>
              {svc.visits.map((v, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 60px 90px", gap: 12, alignItems: "center", padding: "10px 24px", borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontFamily: F.mono, fontSize: 11, fontWeight: 700, color: C.ink }}>{v.dateLabel}</span>
                  <span style={{ fontFamily: F.body, fontSize: 13, color: C.ink }}>{v.note}</span>
                  <span style={{ fontFamily: F.body, fontSize: 13, color: C.ink }}>${v.amount}</span>
                  <span style={{
                    fontFamily: F.mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                    color: v.verified ? "#166534" : "#92400E",
                    background: v.verified ? "#F0FDF4" : "#FFFBEB",
                    border: `1px solid ${v.verified ? "#BBF7D0" : "#FDE68A"}`,
                    padding: "2px 7px", display: "inline-block",
                  }}>
                    {v.verified ? "VERIFIED" : "PENDING"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "16px 24px" }}>
              <p style={{ fontFamily: F.body, fontSize: 13, color: C.muted, margin: 0 }}>No visit history recorded yet.</p>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 10, padding: "14px 24px", flexWrap: "wrap" }}>
            {svc.nextVisitDate && svc.status !== "paused" && (
              <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "8px 16px", cursor: "pointer" }}>
                Skip {svc.nextVisitDate}
              </button>
            )}
            {svc.status !== "paused" && (
              <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "8px 16px", cursor: "pointer" }}>
                Pause for the season
              </button>
            )}
            {svc.status === "paused" && (
              <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: "#166534", background: "#F0FDF4", border: `1px solid #BBF7D0`, padding: "8px 16px", cursor: "pointer" }}>
                Resume service
              </button>
            )}
            <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "8px 16px", cursor: "pointer" }}>
              Change cadence
            </button>
            <button style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: "#991B1B", background: "#fff", border: `1px solid #FECACA`, padding: "8px 16px", cursor: "pointer" }}>
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
  const { properties } = usePropertyStore();
  const { jobs }       = useJobStore();
  const navigate       = useNavigate();
  const [searchParams] = useSearchParams();
  const deepLinkSystem = searchParams.get("system");

  const [selectedId,     setSelectedId]     = useState(String(properties[0]?.id ?? ""));
  const [showSystemAges, setShowSystemAges] = useState(false);
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

  // ── Derived ────────────────────────────────────────────────────────────────
  const allTasks      = report?.annualTasks ?? [];
  const criticalPreds = report?.systemPredictions.filter(p => p.urgency === "Critical") ?? [];
  const dueSoonCount  = allTasks.filter((t, i) => daysUntil(taskDueDate(t, i)) <= 30).length + criticalPreds.length;

  const upcomingTasksWithDates = allTasks.map((t, i) => ({ task: t, due: taskDueDate(t, i) }));

  // Recurring service counts
  const recurringServices = MOCK_RECURRING;
  const activeRecurring   = recurringServices.filter(s => s.status === "active");
  const pausedCount       = recurringServices.filter(s => s.status === "paused").length;
  const recurringVisitsDue30 = activeRecurring.length; // simplified: each active contract has a visit in 30 days

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

  // Next recurring visit in N days (rough: closest active service)
  const nextVisitDaysMsg = activeRecurring.length > 0 ? "next visit in 2 days" : "";

  return (
    <Layout>
      <div style={{ background: V2_COLORS.paper, minHeight: "100%", padding: "28px 32px" }}>

        {/* Page header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
              MAINTENANCE
            </div>
            <h1 style={{ fontFamily: F.display, fontWeight: 900, fontSize: "clamp(1.375rem, 3vw, 1.875rem)", color: C.ink, margin: 0 }}>
              {recurringVisitsDue30} recurring visit{recurringVisitsDue30 !== 1 ? "s" : ""} and {dueSoonCount} task{dueSoonCount !== 1 ? "s" : ""} due in 30 days
            </h1>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={() => navigate("/jobs/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 700, color: "#fff", background: C.ink, border: "none", padding: "10px 20px", cursor: "pointer" }}>
              Log work
            </button>
            <button onClick={() => navigate("/dashboard")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "10px 20px", cursor: "pointer" }}>
              Back to dashboard
            </button>
          </div>
        </div>

        {properties.length === 0 ? (
          <div style={{ border: `1px solid ${C.border}`, padding: "3rem", textAlign: "center" }}>
            <p style={{ fontFamily: F.body, fontSize: 14, color: C.muted }}>Add a property to see maintenance predictions.</p>
          </div>
        ) : (
          <>
            {/* ── Recurring services ─────────────────────────────────────────── */}
            <div style={{ border: `1px solid ${C.border}`, background: "#fff", marginBottom: 24, overflow: "hidden" }}>
              {/* Section header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.muted }}>
                  RECURRING SERVICES · {recurringServices.length} contracts · {pausedCount} paused{nextVisitDaysMsg ? ` · ${nextVisitDaysMsg}` : ""}
                </span>
                <button onClick={() => navigate("/recurring/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "7px 14px", cursor: "pointer" }}>
                  Add service
                </button>
              </div>

              {recurringServices.map(svc => (
                <RecurringRow key={svc.id} svc={svc} />
              ))}
            </div>

            {/* ── Scheduled tasks ────────────────────────────────────────────── */}
            <div style={{ border: `1px solid ${C.border}`, background: "#fff", marginBottom: 24, overflow: "hidden" }}>
              {/* Section header */}
              <div style={{ padding: "14px 24px", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.muted }}>
                  SCHEDULED TASKS
                </span>
                <span style={{ fontFamily: F.body, fontSize: 12, color: C.muted, marginLeft: 8 }}>
                  One-time and seasonal work, outside your recurring contracts.
                </span>
              </div>

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
                        <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 900, color: isUrgent ? "#991B1B" : C.ink, lineHeight: 1.1 }}>
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
                          {matchedPred ? ` · ${matchedPred.recommendation.slice(0, 60)}` : ""}
                        </div>
                      </div>

                      <DaysChip days={days} />

                      {hasPro ? (
                        <button onClick={() => navigate("/contractors")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap" }}>
                          Find pro
                        </button>
                      ) : (
                        <button onClick={() => navigate("/quotes/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.border}`, padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap" }}>
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
                    <div style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#991B1B" }}>NOW</div>
                    <div style={{ fontFamily: F.display, fontSize: 20, fontWeight: 900, color: "#991B1B", lineHeight: 1.1 }}>!</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: F.body, fontSize: 15, fontWeight: 700, color: C.ink, marginBottom: 2 }}>
                      {pred.systemName} replacement needed
                    </div>
                    <div style={{ fontFamily: F.body, fontSize: 12, color: C.muted }}>
                      {Math.abs(pred.yearsRemaining)} year{Math.abs(pred.yearsRemaining) !== 1 ? "s" : ""} past rated life · {maintenanceService.formatCents(pred.estimatedCostLowCents)}–{maintenanceService.formatCents(pred.estimatedCostHighCents)} estimated
                    </div>
                  </div>
                  <span style={{ fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: "#991B1B", background: "#FEF2F2", border: "1px solid #FECACA", padding: "4px 8px" }}>OVERDUE</span>
                  <button onClick={() => navigate("/quotes/new")} style={{ fontFamily: F.body, fontSize: 13, fontWeight: 600, color: "#fff", background: "#991B1B", border: "none", padding: "8px 16px", cursor: "pointer", whiteSpace: "nowrap" }}>
                    Get quotes
                  </button>
                </div>
              ))}
            </div>

            {/* ── Seasonal tips ──────────────────────────────────────────────── */}
            <div style={{ border: `1px solid #F5ECD7`, background: "#FFFBEB", padding: "18px 24px" }}>
              <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 700, color: "#92400E", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>
                SEASONAL · {climate.toUpperCase()} · {season.toUpperCase()}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
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
