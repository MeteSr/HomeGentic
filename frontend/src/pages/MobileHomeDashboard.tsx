import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePropertySummary } from "@/hooks/usePropertySummary";
import { useJobSummary } from "@/hooks/useJobSummary";
import { computeScoreWithDecay } from "@/services/scoreService";
import { getAllDecayEvents, getTotalDecay } from "@/services/scoreDecayService";
import { useMaintenanceSchedule } from "@/hooks/useMaintenanceSchedule";
import { V2_FONTS } from "@/theme";

const F = V2_FONTS;

// ── Design tokens (mobile palette) ────────────────────────────────────────────
const M = {
  bg:       "#EDEEF2",
  card:     "#FFFFFF",
  cardBdr:  "#E6E7EE",
  cardShadow: "0 2px 12px rgba(11,13,26,0.06)",
  ink:      "#0B0D1A",
  muted:    "#6B7080",
  blue:     "#2B34FF",
  blueLight: "#E0E2FF",
  blueBdr:  "#B9BDF5",
  innerBg:  "#F7F8FB",
  innerBdr: "#E6E7EE",
  amber:    "#FFF6DB",
  rowBdr:   "#F0F1F5",
  radius:   22,
};

// ── Recurring services mock data (top 3 visible on home) ─────────────────────

interface MobileService {
  id: string;
  abbr: string;
  name: string;
  due: string;
  cadence: string;
  dueSoon: boolean;
  detail: string;
}

const SERVICES: MobileService[] = [
  {
    id: "gut",
    abbr: "GU",
    name: "Gutter cleaning",
    due: "AUG 21 · IN 4 DAYS",
    cadence: "EVERY 6 MO",
    dueSoon: true,
    detail: "Bell & Sons, $180 flat. The agent moved it off Saturday to stay ahead of the rain.",
  },
  {
    id: "lawn",
    abbr: "LN",
    name: "Lawn maintenance",
    due: "AUG 27 · RECURRING",
    cadence: "WEEKLY",
    dueSoon: false,
    detail: "Greenway Lawn Co, $65 a visit. Three more visits booked in August.",
  },
  {
    id: "hvac",
    abbr: "HV",
    name: "HVAC filter service",
    due: "SEP 2 · IN 16 DAYS",
    cadence: "EVERY 3 MO",
    dueSoon: false,
    detail: "Ridgeline HVAC. 20×25×1 MERV 11 — two spares in the hall closet.",
  },
];

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: M.card,
      border: `1px solid ${M.cardBdr}`,
      borderRadius: M.radius,
      boxShadow: M.cardShadow,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Service row ───────────────────────────────────────────────────────────────

function ServiceRow({ svc }: { svc: MobileService }) {
  const [open, setOpen] = useState(false);
  const iconBg    = svc.dueSoon ? M.blueLight : M.rowBdr;
  const iconColor = svc.dueSoon ? M.blue : M.muted;
  const dueColor  = svc.dueSoon ? M.blue : M.muted;

  return (
    <div style={{ borderBottom: `1px solid ${M.rowBdr}` }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 13,
          minHeight: 44, padding: "15px 18px", textAlign: "left",
        }}
      >
        {/* Icon */}
        <div style={{
          width: 34, height: 34, flexShrink: 0, borderRadius: 11,
          background: iconBg, display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: F.mono, fontSize: 10, fontWeight: 700, color: iconColor,
        }}>
          {svc.abbr}
        </div>

        {/* Name + due */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: F.body, fontSize: 14.5, fontWeight: 600, color: M.ink, lineHeight: 1.3 }}>
            {svc.name}
          </div>
          <div style={{ fontFamily: F.mono, fontSize: 11.5, color: dueColor, marginTop: 5, lineHeight: 1.4 }}>
            {svc.due}
          </div>
        </div>

        {/* Cadence pill */}
        <div style={{
          fontFamily: F.mono, fontSize: 9, fontWeight: 500, letterSpacing: "0.1em",
          color: M.muted, border: `1px solid #D9DBE4`, borderRadius: 100,
          padding: "6px 9px", whiteSpace: "nowrap",
        }}>
          {svc.cadence}
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 18px 17px" }}>
          <div style={{
            background: M.innerBg, border: `1px solid ${M.innerBdr}`,
            borderRadius: 16, padding: 14,
          }}>
            <p style={{ fontFamily: F.body, fontSize: 12.5, color: M.muted, lineHeight: 1.55, margin: 0 }}>
              {svc.detail}
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button style={{
                minHeight: 40, display: "inline-flex", alignItems: "center",
                padding: "10px 16px", borderRadius: 100,
                background: M.blue, border: "none",
                fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: "#FCFCFD",
                cursor: "pointer",
              }}>
                Mark done
              </button>
              <button style={{
                minHeight: 40, display: "inline-flex", alignItems: "center",
                padding: "10px 16px", borderRadius: 100,
                background: "none", border: `1.5px solid #D9DBE4`,
                fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: M.ink,
                cursor: "pointer",
              }}>
                Reschedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileHomeDashboard() {
  const navigate = useNavigate();
  const { profile, tier } = useAuthStore();

  const { properties, loading: propLoading } = usePropertySummary();
  const { allJobs, loading: jobsLoading } = useJobSummary(properties, propLoading);

  const [propPickerOpen, setPropPickerOpen] = useState(false);
  const [activePropId, setActivePropId] = useState<string | null>(null);

  const loading = propLoading || jobsLoading;

  const activeProperty = activePropId
    ? properties.find(p => String(p.id) === activePropId)
    : properties[0];

  const propJobs = activeProperty
    ? allJobs.filter(j => String(j.propertyId) === String(activeProperty.id))
    : allJobs;

  const { systemAges } = useMaintenanceSchedule(properties, propLoading, activeProperty ? String(activeProperty.id) : null);

  const decayEvents = React.useMemo(
    () => !loading ? getAllDecayEvents(propJobs, systemAges, Date.now()) : [],
    [propJobs, systemAges, loading],
  );
  const score = activeProperty
    ? computeScoreWithDecay(propJobs, [activeProperty], getTotalDecay(decayEvents))
    : 0;

  // Greeting
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "MORNING" : hour < 17 ? "AFTERNOON" : "EVENING";
  const emailLocal  = profile?.email?.split("@")[0] ?? "";
  const firstName   = emailLocal.toUpperCase() || "THERE";
  const initials    = emailLocal.slice(0, 2).toUpperCase() || "HG";

  const verifiedCount = propJobs.filter(j => j.verified).length;
  const scorePct      = Math.min(score, 100);

  // Score gap hint
  const scoreHint = score < 100
    ? `${verifiedCount} verified job${verifiedCount !== 1 ? "s" : ""} logged. Add more to push your score higher.`
    : "Your home history is complete.";

  // Plan label
  const planLabel = tier === "Pro" ? "Pro" : tier === "Premium" ? "Premium" : "Basic";
  const planUsage = properties.length > 0
    ? `${properties.length} propert${properties.length !== 1 ? "ies" : "y"} · active`
    : "No properties yet";

  return (
    <div style={{ background: M.bg, minHeight: "100%", padding: "10px 18px 0" }}>

      {/* ── Greeting row ──────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, paddingBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 500, letterSpacing: "0.14em", color: M.muted }}>
            GOOD {timeOfDay}, {firstName}
          </div>

          {/* Property name + picker */}
          <button
            onClick={() => setPropPickerOpen(v => !v)}
            style={{
              display: "flex", alignItems: "center", gap: 8, marginTop: 9,
              background: "none", border: "none", cursor: "pointer", padding: 0,
            }}
          >
            <span style={{ fontFamily: F.display, fontWeight: 800, fontSize: 27, color: M.ink, letterSpacing: "-0.03em", lineHeight: 1.12 }}>
              {activeProperty?.address ?? "Add a property"}
            </span>
            <ChevronDown size={18} color={M.muted} strokeWidth={2.4} style={{ flexShrink: 0 }} />
          </button>
          <div style={{ fontFamily: F.mono, fontSize: 11.5, color: M.muted, marginTop: 7, lineHeight: 1.4 }}>
            {activeProperty ? `${activeProperty.city}, ${activeProperty.state}` : ""}
          </div>
        </div>

        {/* Avatar */}
        <div style={{
          width: 38, height: 38, flexShrink: 0, borderRadius: 100,
          background: M.blueLight, border: `1px solid ${M.blueBdr}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: F.display, fontWeight: 700, fontSize: 13, color: M.blue,
        }}>
          {initials}
        </div>
      </div>

      {/* Property picker dropdown */}
      {propPickerOpen && properties.length > 0 && (
        <Card style={{ marginBottom: 12, overflow: "hidden", borderRadius: 16 }}>
          {properties.map(p => {
            const active = String(p.id) === String(activeProperty?.id);
            return (
              <button
                key={p.id}
                onClick={() => { setActivePropId(String(p.id)); setPropPickerOpen(false); }}
                style={{
                  width: "100%", textAlign: "left", background: active ? M.ink : "none",
                  border: "none", borderBottom: `1px solid ${M.rowBdr}`,
                  padding: "14px 18px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                }}
              >
                <div>
                  <div style={{ fontFamily: F.body, fontSize: 14, fontWeight: 700, color: active ? "#FCFCFD" : M.ink }}>{p.address}</div>
                  <div style={{ fontFamily: F.mono, fontSize: 10, color: active ? "rgba(252,252,253,0.65)" : M.muted, marginTop: 4 }}>
                    {p.city}, {p.state}
                  </div>
                </div>
                {active && <ChevronRight size={14} color="rgba(252,252,253,0.6)" />}
              </button>
            );
          })}
          {properties.length === 0 && (
            <button
              onClick={() => { setPropPickerOpen(false); navigate("/dashboard"); }}
              style={{ width: "100%", background: "none", border: "none", padding: "14px 18px", fontFamily: F.body, fontSize: 14, color: M.blue, cursor: "pointer", textAlign: "left" }}
            >
              + Add a property
            </button>
          )}
        </Card>
      )}

      {/* ── Score card ────────────────────────────────────────────────────── */}
      <Card style={{ padding: 20, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
          <div>
            <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 500, letterSpacing: "0.14em", color: M.muted }}>
              HOME SCORE
            </div>
            <div style={{ fontFamily: F.display, fontWeight: 800, fontSize: 44, color: M.ink, letterSpacing: "-0.045em", marginTop: 11, lineHeight: 1 }}>
              {loading ? "—" : score}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", color: M.muted }}>
              VERIFIED JOBS
            </div>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 19, color: M.ink, marginTop: 10, letterSpacing: "-0.02em" }}>
              {loading ? "—" : verifiedCount}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 6, borderRadius: 100, background: M.cardBdr, marginTop: 16, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${scorePct}%`, background: M.blue, borderRadius: 100, transition: "width 0.6s ease" }} />
        </div>

        <p style={{ fontFamily: F.body, fontSize: 12.5, color: M.muted, marginTop: 12, lineHeight: 1.5, margin: "12px 0 0" }}>
          {loading ? "Loading your score…" : scoreHint}
        </p>
      </Card>

      {/* ── Recurring services ─────────────────────────────────────────────── */}
      <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 500, letterSpacing: "0.14em", color: M.muted, margin: "22px 2px 11px" }}>
        RECURRING SERVICES
      </div>
      <Card style={{ overflow: "hidden", marginBottom: 14 }}>
        {SERVICES.map(svc => (
          <ServiceRow key={svc.id} svc={svc} />
        ))}
        <button
          onClick={() => navigate("/maintenance")}
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", background: "none", border: "none", cursor: "pointer",
            padding: "14px 18px",
            fontFamily: F.body, fontSize: 13.5, fontWeight: 600, color: M.blue,
          }}
        >
          <span>View all services</span>
          <ChevronRight size={15} color={M.blue} />
        </button>
      </Card>

      {/* ── Current plan ───────────────────────────────────────────────────── */}
      <button
        onClick={() => navigate("/plans")}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          textAlign: "left", padding: 0, marginBottom: 14,
        }}
      >
        <Card style={{ padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: F.mono, fontSize: 9, fontWeight: 500, letterSpacing: "0.14em", color: M.muted }}>
              CURRENT PLAN
            </div>
            <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 16, color: M.ink, marginTop: 9, letterSpacing: "-0.02em" }}>
              {planLabel} plan
            </div>
            <div style={{ fontFamily: F.body, fontSize: 12.5, color: M.muted, marginTop: 6, lineHeight: 1.45 }}>
              {planUsage}
            </div>
          </div>
          <div style={{
            flexShrink: 0, minHeight: 40, display: "inline-flex", alignItems: "center",
            padding: "11px 17px", borderRadius: 100,
            background: M.blueLight, border: `1px solid ${M.blueBdr}`,
            fontFamily: F.body, fontSize: 12.5, fontWeight: 600, color: M.blue,
          }}>
            Upgrade
          </div>
        </Card>
      </button>

      {/* ── Log work CTA (if no jobs yet) ──────────────────────────────────── */}
      {!loading && verifiedCount === 0 && (
        <button
          onClick={() => navigate("/jobs/new")}
          style={{
            width: "100%", minHeight: 52, borderRadius: 100,
            background: M.ink, border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            fontFamily: F.body, fontSize: 14, fontWeight: 600, color: "#FCFCFD",
            marginBottom: 14,
          }}
        >
          <Plus size={16} color="#FCFCFD" strokeWidth={2.5} />
          Log your first job
        </button>
      )}
    </div>
  );
}
