import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { usePropertyStore } from "@/store/propertyStore";
import { useJobStore } from "@/store/jobStore";
import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";
import { getAtRiskWarnings } from "@/services/scoreDecayService";
import { systemAgesService } from "@/services/systemAges";
import { SERVICE_TYPE_LABELS, FREQUENCY_LABELS } from "@/services/recurringService";
import { V2_FONTS } from "@/theme";

const FREQ_DAYS: Record<string, number> = {
  Weekly: 7, BiWeekly: 14, Monthly: 30, Quarterly: 90, SemiAnnually: 180, Annually: 365,
};

const F = V2_FONTS;

// ── Design tokens ─────────────────────────────────────────────────────────────
const M = {
  bg:         "#EDEEF2",
  card:       "#FFFFFF",
  cardBdr:    "#E6E7EE",
  cardShadow: "0 2px 12px rgba(11,13,26,0.06)",
  ink:        "#0B0D1A",
  muted:      "#6B7080",
  blue:       "#2B34FF",
  amber:      "#FFF6DB",
  amberBdr:   "#FFD23F",
  rowBdr:     "#F0F1F5",
  radius:     22,
};

// ── Schedule row ──────────────────────────────────────────────────────────────

interface ScheduleRowProps {
  date:      string;
  label:     string;
  meta:      string;
  due:       string;
  dueColor:  string;
  dueBg:     string;
  isLast:    boolean;
}

function ScheduleRow({ date, label, meta, due, dueColor, dueBg, isLast }: ScheduleRowProps) {
  return (
    <div style={{
      minHeight: 44, padding: "15px 18px",
      borderBottom: isLast ? "none" : `1px solid ${M.rowBdr}`,
      display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer",
    }}>
      <div style={{
        width: 52, flexShrink: 0,
        font: `500 10px/1.4 ${F.mono}`,
        letterSpacing: ".06em", color: M.muted, paddingTop: 2,
      }}>
        {date}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14.5px/1.3 ${F.body}`, color: M.ink }}>{label}</div>
        <div style={{ font: `400 11.5px/1.45 ${F.body}`, color: M.muted, marginTop: 5 }}>{meta}</div>
      </div>
      <div style={{
        flexShrink: 0,
        font: `500 9px/1 ${F.mono}`,
        letterSpacing: ".1em",
        color: dueColor,
        background: dueBg,
        borderRadius: 100,
        padding: "6px 9px",
        whiteSpace: "nowrap",
      }}>
        {due}
      </div>
    </div>
  );
}

// ── Score-at-risk banner ──────────────────────────────────────────────────────

function ScoreAtRiskCard({ text }: { text: string }) {
  return (
    <div style={{
      background: M.amber, border: `1px solid ${M.amberBdr}`,
      borderRadius: 20, padding: 18, marginTop: 14,
    }}>
      <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".12em", color: M.ink }}>SCORE AT RISK</div>
      <div style={{ font: `400 13px/1.55 ${F.body}`, color: M.ink, marginTop: 10 }}>{text}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileMaintenancePage() {
  const navigate              = useNavigate();
  const { properties, isLoading: propLoading } = usePropertyStore();
  const { jobs }              = useJobStore();
  const [activePropertyId]    = useState<string | null>(
    properties.length > 0 ? String(properties[0].id) : null
  );

  const { recurringServices, visitLogMap } = useMaintenanceSchedule(
    properties, propLoading, activePropertyId
  );

  // Build schedule rows from recurring services
  const scheduleRows = recurringServices.map(svc => {
    const logs        = visitLogMap[svc.id] ?? [];
    const lastVisit   = logs[0]?.visitDate ?? null;
    const freqDays    = FREQ_DAYS[svc.frequency] ?? 30;
    const nextDate    = lastVisit
      ? new Date(new Date(lastVisit).getTime() + freqDays * 86400000)
      : new Date(new Date(svc.startDate).getTime() + freqDays * 86400000);
    const daysUntil   = Math.ceil((nextDate.getTime() - Date.now()) / 86400000);
    const dateStr     = nextDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }).toUpperCase();
    const overdue     = daysUntil < 0;
    const dueSoon     = daysUntil >= 0 && daysUntil <= 7;
    const label       = SERVICE_TYPE_LABELS[svc.serviceType] ?? svc.serviceType;
    const freqLabel   = FREQUENCY_LABELS[svc.frequency] ?? svc.frequency;

    return {
      id:       svc.id,
      date:     dateStr,
      label,
      meta:     svc.providerName ? `${svc.providerName} · ${freqLabel}` : freqLabel,
      due:      overdue ? "OVERDUE" : dueSoon ? "DUE SOON" : "UPCOMING",
      dueColor: overdue ? "#991B1B" : dueSoon ? "#92400E" : M.muted,
      dueBg:    overdue ? "#FEE2E2" : dueSoon ? "#FEF3C7" : "#F0F1F5",
    };
  });

  // Fall back to mock data if no recurring services loaded yet
  const MOCK_SCHEDULE = [
    { id: "m1", date: "AUG 28", label: "Gutter cleaning",         meta: "Bell & Sons · every 6mo",        due: "DUE SOON", dueColor: "#92400E", dueBg: "#FEF3C7" },
    { id: "m2", date: "SEP 3",  label: "HVAC filter swap",        meta: "DIY · every 3mo",                due: "UPCOMING", dueColor: M.muted,   dueBg: "#F0F1F5" },
    { id: "m3", date: "SEP 15", label: "Lawn fertilisation",      meta: "GreenPro Lawn · every 6 weeks",  due: "UPCOMING", dueColor: M.muted,   dueBg: "#F0F1F5" },
    { id: "m4", date: "OCT 1",  label: "Pest control inspection", meta: "SafeGuard Pest · annual",        due: "UPCOMING", dueColor: M.muted,   dueBg: "#F0F1F5" },
  ];

  const rows = scheduleRows.length > 0 ? scheduleRows : MOCK_SCHEDULE;

  // At-risk warnings
  const systemAges  = activePropertyId ? systemAgesService.get(activePropertyId) : {};
  const warnings    = getAtRiskWarnings(jobs, systemAges, Date.now(), 30);
  const riskText    = warnings.length > 0
    ? warnings.map(w => `${w.label} in ${w.daysRemaining} day${w.daysRemaining !== 1 ? "s" : ""} (${w.pts > 0 ? "+" : ""}${w.pts} pts)`).join(" and ") + "."
    : null;

  return (
    <div style={{ background: M.bg, minHeight: "100%", padding: "0 16px 24px" }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 2px 16px" }}>
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted }}>MAINTENANCE</div>
        <div style={{ font: `800 27px/1.12 ${F.display}`, color: M.ink, letterSpacing: "-0.03em", marginTop: 9 }}>
          What's coming up
        </div>
      </div>

      {/* ── Schedule card ─────────────────────────────────────────────────── */}
      <div style={{
        background: M.card, border: `1px solid ${M.cardBdr}`,
        borderRadius: M.radius, boxShadow: M.cardShadow, overflow: "hidden",
      }}>
        {rows.map((row, i) => (
          <ScheduleRow
            key={row.id}
            date={row.date}
            label={row.label}
            meta={row.meta}
            due={row.due}
            dueColor={row.dueColor}
            dueBg={row.dueBg}
            isLast={i === rows.length - 1}
          />
        ))}

        {/* Add recurring service row */}
        <div
          onClick={() => navigate("/maintenance")}
          style={{
            minHeight: 44, padding: "15px 18px",
            display: "flex", alignItems: "center", gap: 10,
            cursor: "pointer",
            font: `600 13.5px/1 ${F.body}`,
            color: M.blue,
            borderTop: `1px solid ${M.rowBdr}`,
          }}
        >
          <Plus size={16} color={M.blue} strokeWidth={2.4} />
          <span>Add a recurring service</span>
        </div>
      </div>

      {/* ── Score at risk ─────────────────────────────────────────────────── */}
      {riskText && <ScoreAtRiskCard text={riskText} />}

      {/* ── View full maintenance page ────────────────────────────────────── */}
      <div style={{ marginTop: 16, textAlign: "center" }}>
        <button
          onClick={() => navigate("/maintenance")}
          style={{
            font: `600 13px/1 ${F.body}`, color: M.muted,
            background: "transparent", border: "none", cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          View recurring services & history
        </button>
      </div>
    </div>
  );
}
