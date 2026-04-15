import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { RecurringService, VisitLog, SERVICE_TYPE_LABELS, FREQUENCY_LABELS } from "@/services/recurringService";
import { COLORS, FONTS, RADIUS } from "@/theme";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  mono:     FONTS.mono,
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  Active:    { color: COLORS.sage,     bg: COLORS.sageLight },
  Paused:    { color: COLORS.plumMid,  bg: COLORS.butter    },
  Cancelled: { color: COLORS.plumMid,  bg: COLORS.white     },
};

const SERVICE_ICONS: Record<string, string> = {
  LawnCare:        "🌿",
  PestControl:     "🐛",
  PoolMaintenance: "🏊",
  GutterCleaning:  "🌧️",
  PressureWashing: "💧",
  Other:           "🔧",
};

interface Props {
  service:    RecurringService;
  visitLogs:  VisitLog[];
}

export function RecurringServiceCard({ service, visitLogs }: Props) {
  const navigate    = useNavigate();
  const lastVisit   = [...visitLogs].sort((a, b) => b.visitDate.localeCompare(a.visitDate))[0];
  const statusStyle = STATUS_STYLE[service.status] ?? STATUS_STYLE.Active;
  const icon        = SERVICE_ICONS[service.serviceType] ?? "🔧";
  const label       = SERVICE_TYPE_LABELS[service.serviceType] ?? service.serviceType;
  const freq        = FREQUENCY_LABELS[service.frequency] ?? service.frequency;

  function fmtDate(iso: string): string {
    const [y, m, d] = iso.split("-");
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[parseInt(m) - 1]} ${d}, ${y}`;
  }

  return (
    <div
      onClick={() => navigate(`/recurring/${service.id}`)}
      style={{
        border: `1px solid ${UI.rule}`, background: COLORS.white,
        borderRadius: RADIUS.card, padding: "1rem 1.25rem", cursor: "pointer",
        display: "flex", alignItems: "center", gap: "1rem",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = UI.ink)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = UI.rule)}
    >
      {/* Icon */}
      <div style={{ fontSize: "1.5rem", flexShrink: 0, lineHeight: 1 }}>{icon}</div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: UI.mono, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", color: UI.ink }}>
            {label}
          </span>
          <span style={{
            fontFamily: UI.mono, fontSize: "0.55rem", letterSpacing: "0.1em",
            textTransform: "uppercase", padding: "0.125rem 0.4rem",
            color: statusStyle.color, background: statusStyle.bg,
          }}>
            {service.status}
          </span>
        </div>
        <p style={{ fontFamily: UI.mono, fontSize: "0.65rem", color: UI.inkLight, marginBottom: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {service.providerName}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.04em" }}>
            {freq}
          </span>
          <span style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight, letterSpacing: "0.04em" }}>
            {lastVisit ? `Last: ${fmtDate(lastVisit.visitDate)}` : "No visits logged"}
          </span>
        </div>
      </div>

      <ArrowRight size={14} color={UI.inkLight} style={{ flexShrink: 0 }} />
    </div>
  );
}
