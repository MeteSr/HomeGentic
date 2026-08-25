import React from "react";
import { useNavigate } from "react-router-dom";
import { Plus, LogOut } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePropertyStore } from "@/store/propertyStore";
import { V2_FONTS } from "@/theme";

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
  blueLight:  "#E0E2FF",
  blueBdr:    "#B9BDF5",
  amber:      "#FFF6DB",
  amberBdr:   "#FFD23F",
  rowBdr:     "#F0F1F5",
  radius:     22,
};

// ── Tier display helpers ───────────────────────────────────────────────────────

const TIER_LABELS: Record<string, string> = {
  Basic:           "Basic",
  Pro:             "Pro",
  Premium:         "Premium",
  ContractorFree:  "Contractor Free",
  ContractorPro:   "Contractor Pro",
  RealtorFree:     "Realtor Free",
  RealtorPro:      "Realtor Pro",
};

const TIER_USAGE: Record<string, string> = {
  Basic:          "1 property · 5 photos/job",
  Pro:            "5 properties · 10 photos/job",
  Premium:        "20 properties · 30 photos/job",
  ContractorFree: "Unlimited quotes · 5 photos",
  ContractorPro:  "Unlimited quotes · 50 photos",
  RealtorFree:    "Agent profile · 5 photos",
  RealtorPro:     "Agent profile · 50 photos",
};

// ── Person row ────────────────────────────────────────────────────────────────

function PersonRow({ abbr, name, meta, role, isLast, onClick }: {
  abbr: string; name: string; meta: string; role: string; isLast: boolean; onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        minHeight: 44, padding: "15px 18px",
        borderBottom: isLast ? "none" : `1px solid ${M.rowBdr}`,
        display: "flex", alignItems: "center", gap: 13, cursor: "pointer",
      }}
    >
      <div style={{
        width: 34, height: 34, flexShrink: 0, borderRadius: "50%",
        background: "#F0F1F5", display: "flex", alignItems: "center", justifyContent: "center",
        font: `700 11px/1 ${F.display}`, color: M.muted,
      }}>
        {abbr}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px/1.3 ${F.body}`, color: M.ink }}>{name}</div>
        <div style={{ font: `400 11.5px/1.4 ${F.body}`, color: M.muted, marginTop: 5 }}>{meta}</div>
      </div>
      <div style={{
        flexShrink: 0, font: `500 9px/1 ${F.mono}`, letterSpacing: ".1em",
        color: M.muted, border: `1px solid #D9DBE4`, borderRadius: 100, padding: "6px 9px",
      }}>
        {role}
      </div>
    </div>
  );
}

// ── Settings row ──────────────────────────────────────────────────────────────

function SettingsRow({ label, value, danger, isLast, onClick }: {
  label: string; value?: string; danger?: boolean; isLast: boolean; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        minHeight: 44, padding: "16px 18px",
        borderBottom: isLast ? "none" : `1px solid ${M.rowBdr}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 12, cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ font: `600 14px/1.3 ${F.body}`, color: danger ? "#DC2626" : M.ink }}>{label}</div>
      {value && <div style={{ font: `400 12px/1.3 ${F.mono}`, color: M.muted }}>{value}</div>}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobileAccountPage() {
  const navigate             = useNavigate();
  const { profile, tier, clearAuth } = useAuthStore();
  const { properties }       = usePropertyStore();

  const firstName   = profile?.name?.split(" ")[0] ?? "Account";
  const fullName    = profile?.name ?? "Account";
  const email       = profile?.email ?? "";
  const planName    = TIER_LABELS[tier ?? "Basic"] ?? "Basic";
  const planUsage   = TIER_USAGE[tier ?? "Basic"] ?? "";

  // Mock shared people (replace with real people service when wired up)
  const people = [
    { abbr: "JM", name: "Jordan M.",    meta: "Last active 2d ago",  role: "VIEWER"  },
    { abbr: "SR", name: "Sandra R.",    meta: "Last active 5d ago",  role: "MANAGER" },
  ];

  const propCount = properties.length;

  return (
    <div style={{ background: M.bg, minHeight: "100%", padding: "0 16px 24px" }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 2px 16px" }}>
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted }}>ACCOUNT</div>
        <div style={{ font: `800 27px/1.12 ${F.display}`, color: M.ink, letterSpacing: "-0.03em", marginTop: 9 }}>
          {fullName}
        </div>
      </div>

      {/* ── Current plan card ────────────────────────────────────────────── */}
      <div
        onClick={() => navigate("/plans")}
        style={{
          cursor: "pointer", background: M.card, border: `1px solid ${M.cardBdr}`,
          borderRadius: M.radius, boxShadow: M.cardShadow,
          padding: 20, display: "flex", alignItems: "center", gap: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted }}>CURRENT PLAN</div>
          <div style={{ font: `700 17px/1.2 ${F.display}`, color: M.ink, marginTop: 9, letterSpacing: "-0.02em" }}>
            {planName}
          </div>
          <div style={{ font: `400 12.5px/1.45 ${F.body}`, color: M.muted, marginTop: 6 }}>
            {planUsage} · {propCount} propert{propCount !== 1 ? "ies" : "y"}
          </div>
        </div>
        <div style={{
          flexShrink: 0, minHeight: 40, display: "inline-flex", alignItems: "center",
          padding: "11px 17px", borderRadius: 100,
          background: M.blueLight, border: `1px solid ${M.blueBdr}`,
          font: `600 12.5px/1 ${F.body}`, color: M.blue,
        }}>
          Change
        </div>
      </div>

      {/* ── Shared access ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "22px 2px 11px" }}>
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted }}>SHARED ACCESS</div>
        <div
          onClick={() => navigate("/people")}
          style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
        >
          <div style={{ font: `600 12.5px/1 ${F.body}`, color: M.blue }}>Manage</div>
        </div>
      </div>

      <div style={{
        background: M.card, border: `1px solid ${M.cardBdr}`,
        borderRadius: M.radius, overflow: "hidden",
      }}>
        {people.map((pe, i) => (
          <PersonRow
            key={pe.abbr}
            abbr={pe.abbr}
            name={pe.name}
            meta={pe.meta}
            role={pe.role}
            isLast={false}
            onClick={() => navigate("/people")}
          />
        ))}
        {/* Invite row */}
        <div
          onClick={() => navigate("/people")}
          style={{
            minHeight: 44, padding: "15px 18px",
            display: "flex", alignItems: "center", gap: 10,
            cursor: "pointer",
            font: `600 13.5px/1 ${F.body}`, color: M.blue,
          }}
        >
          <Plus size={16} color={M.blue} strokeWidth={2.4} />
          <span>Invite someone</span>
        </div>
      </div>

      {/* ── Settings rows ────────────────────────────────────────────────── */}
      <div style={{
        background: M.card, border: `1px solid ${M.cardBdr}`,
        borderRadius: M.radius, overflow: "hidden", marginTop: 14,
      }}>
        <SettingsRow
          label="Profile"
          value={email}
          isLast={false}
          onClick={() => navigate("/settings?tab=profile")}
        />
        <SettingsRow
          label="Notifications"
          value="On"
          isLast={false}
          onClick={() => navigate("/settings?tab=notifications")}
        />
        <SettingsRow
          label="Security"
          isLast={false}
          onClick={() => navigate("/settings?tab=security")}
        />
        <SettingsRow
          label="Sign out"
          danger
          isLast={true}
          onClick={() => { clearAuth(); navigate("/"); }}
        />
      </div>
    </div>
  );
}
