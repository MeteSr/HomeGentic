import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { RecurringService, VisitLog, SERVICE_TYPE_LABELS, FREQUENCY_LABELS } from "@/services/recurringService";

const S = {
  ink: "#0E0E0C", paper: "#F4F1EB", rule: "#C8C3B8",
  rust: "#C94C2E", inkLight: "#7A7268", sage: "#3D6B57",
  mono: "'IBM Plex Mono', monospace" as const,
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  Active:    { color: S.sage,      bg: "#F0F6F3" },
  Paused:    { color: "#92611B",   bg: "#FEF3DC" },
  Cancelled: { color: S.inkLight,  bg: S.paper   },
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
        border: `1px solid ${S.rule}`, background: "#fff",
        padding: "1rem 1.25rem", cursor: "pointer",
        display: "flex", alignItems: "center", gap: "1rem",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = S.ink)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = S.rule)}
    >
      {/* Icon */}
      <div style={{ fontSize: "1.5rem", flexShrink: 0, lineHeight: 1 }}>{icon}</div>

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", color: S.ink }}>
            {label}
          </span>
          <span style={{
            fontFamily: S.mono, fontSize: "0.55rem", letterSpacing: "0.1em",
            textTransform: "uppercase", padding: "0.125rem 0.4rem",
            color: statusStyle.color, background: statusStyle.bg,
          }}>
            {service.status}
          </span>
        </div>
        <p style={{ fontFamily: S.mono, fontSize: "0.65rem", color: S.inkLight, marginBottom: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {service.providerName}
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.04em" }}>
            {freq}
          </span>
          <span style={{ fontFamily: S.mono, fontSize: "0.6rem", color: S.inkLight, letterSpacing: "0.04em" }}>
            {lastVisit ? `Last: ${fmtDate(lastVisit.visitDate)}` : "No visits logged"}
          </span>
        </div>
      </div>

      <ArrowRight size={14} color={S.inkLight} style={{ flexShrink: 0 }} />
    </div>
  );
}
