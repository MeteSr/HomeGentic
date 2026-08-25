import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { usePropertyStore } from "@/store/propertyStore";
import { usePropertyDetail } from "@/hooks/usePropertyDetail";
import { usePropertyRooms } from "@/hooks/usePropertyRooms";
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
  rowBdr:     "#F0F1F5",
  radius:     22,
};

// ── Badge chip ────────────────────────────────────────────────────────────────

function Chip({ label, blue }: { label: string; blue?: boolean }) {
  return (
    <div style={{
      font: `500 8.5px/1 ${F.mono}`, letterSpacing: ".1em",
      background: blue ? M.blueLight : "transparent",
      color: blue ? M.blue : M.muted,
      border: `1px solid ${blue ? M.blueBdr : "#D9DBE4"}`,
      borderRadius: 100, padding: "6px 9px",
      whiteSpace: "nowrap",
    }}>
      {label}
    </div>
  );
}

// ── Room row ──────────────────────────────────────────────────────────────────

function RoomRow({ name, meta, chip, chipColor, chipBg, isLast }: {
  name: string; meta: string; chip: string;
  chipColor: string; chipBg: string; isLast: boolean;
}) {
  return (
    <div style={{
      minHeight: 44, padding: "15px 18px",
      borderBottom: isLast ? "none" : `1px solid ${M.rowBdr}`,
      display: "flex", alignItems: "center", gap: 13, cursor: "pointer",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14.5px/1.3 ${F.body}`, color: M.ink }}>{name}</div>
        <div style={{ font: `400 11.5px/1.4 ${F.mono}`, color: M.muted, marginTop: 5 }}>{meta}</div>
      </div>
      <div style={{
        flexShrink: 0, font: `500 9px/1 ${F.mono}`, letterSpacing: ".1em",
        color: chipColor, background: chipBg, borderRadius: 100, padding: "6px 9px",
        whiteSpace: "nowrap",
      }}>
        {chip}
      </div>
    </div>
  );
}

// ── Sensor card ───────────────────────────────────────────────────────────────

function SensorCard({ label, value, note, noteColor }: {
  label: string; value: string; note: string; noteColor: string;
}) {
  return (
    <div style={{
      flex: 1, minWidth: 0, background: M.card, border: `1px solid ${M.cardBdr}`,
      borderRadius: 20, padding: 16,
    }}>
      <div style={{ font: `500 8.5px/1 ${F.mono}`, letterSpacing: ".12em", color: M.muted }}>{label}</div>
      <div style={{ font: `700 17px/1.1 ${F.display}`, color: M.ink, marginTop: 11, letterSpacing: "-0.02em" }}>{value}</div>
      <div style={{ font: `400 11.5px/1.4 ${F.body}`, color: noteColor, marginTop: 7 }}>{note}</div>
    </div>
  );
}

// ── Property picker dropdown ──────────────────────────────────────────────────

function PropertyPicker({ current, all, onSelect }: {
  current: string; all: { id: string; address: string }[]; onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (all.length <= 1) {
    return (
      <div style={{ font: `800 27px/1.12 ${F.display}`, color: M.ink, letterSpacing: "-0.03em", marginTop: 9 }}>
        {current}
      </div>
    );
  }
  return (
    <div style={{ position: "relative", marginTop: 9 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "none", border: "none", cursor: "pointer", padding: 0,
        }}
      >
        <div style={{ font: `800 27px/1.12 ${F.display}`, color: M.ink, letterSpacing: "-0.03em" }}>{current}</div>
        <ChevronDown size={18} color={M.muted} strokeWidth={2.4} style={{ flexShrink: 0 }} />
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 20,
          background: M.card, border: `1px solid ${M.cardBdr}`, borderRadius: 14,
          boxShadow: "0 8px 24px rgba(11,13,26,0.12)", minWidth: 220, overflow: "hidden",
        }}>
          {all.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p.id); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "13px 16px", background: "none", border: "none",
                borderBottom: `1px solid ${M.rowBdr}`, cursor: "pointer",
                font: `500 13.5px/1.3 ${F.body}`, color: M.ink,
              }}
            >
              {p.address.split(",")[0]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function MobilePropertyPage() {
  const { id: paramId }          = useParams<{ id: string }>();
  const navigate                  = useNavigate();
  const { properties }            = usePropertyStore();
  const [selectedId, setSelectedId] = useState(paramId ?? String(properties[0]?.id ?? ""));

  const { property, loading }    = usePropertyDetail(selectedId);
  const { jobs }                 = usePropertyJobs(selectedId);
  const { rooms }                = usePropertyRooms(selectedId);

  // Build room rows
  const roomRows = rooms.map(room => {
    const fixtureCount = room.fixtures?.length ?? 0;
    return {
      id:        room.id,
      name:      room.name,
      meta:      `${fixtureCount} ITEM${fixtureCount !== 1 ? "S" : ""}`,
      chip:      fixtureCount > 0 ? "DOCUMENTED" : "NEEDS WORK",
      chipColor: fixtureCount > 0 ? "#166534" : "#92400E",
      chipBg:    fixtureCount > 0 ? "#F0FDF4" : "#FEF3C7",
    };
  });

  // Mock sensors when no real data
  const MOCK_SENSORS = [
    { label: "BASEMENT WATER", value: "DRY",       note: "No leak events in 90 days", noteColor: "#166534" },
    { label: "HVAC RUNTIME",   value: "4.2 HR/D",  note: "↑ 12% vs last month",       noteColor: M.muted   },
  ];

  const propAddress = property?.address?.split(",")[0] ?? properties[0]?.address?.split(",")[0] ?? "My Property";
  const allProps = properties.map(p => ({ id: String(p.id), address: p.address }));

  const sqFt       = property?.squareFeet ? `${Number(property.squareFeet).toLocaleString()} SQ FT` : null;
  const yearBuilt  = property?.yearBuilt ? `BUILT ${property.yearBuilt}` : null;
  const propTier   = (property?.tier ?? "Unverified") as string;
  const isVerified = propTier === "Premium" || propTier === "Pro" || propTier === "Basic";

  const details = [sqFt, yearBuilt].filter(Boolean).join(" · ");

  if (loading) {
    return (
      <div style={{ background: M.bg, minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner-lg" />
      </div>
    );
  }

  return (
    <div style={{ background: M.bg, minHeight: "100%", padding: "0 16px 24px" }}>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 2px 16px" }}>
        <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted }}>PROPERTY</div>
        <PropertyPicker
          current={propAddress}
          all={allProps}
          onSelect={id => { setSelectedId(id); navigate(`/properties/${id}`, { replace: true }); }}
        />
      </div>

      {/* ── Property info card ───────────────────────────────────────────── */}
      <div style={{
        background: M.card, border: `1px solid ${M.cardBdr}`,
        borderRadius: M.radius, boxShadow: M.cardShadow, padding: 20,
      }}>
        {/* Badges */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {isVerified && <Chip label={`${propTier.toUpperCase()} VERIFIED`} blue />}
          {!isVerified && <Chip label="UNVERIFIED" />}
        </div>

        {/* Stats */}
        {details && (
          <div style={{ font: `400 12px/1.5 ${F.mono}`, color: M.muted, marginTop: 14 }}>
            {details}
          </div>
        )}

        {/* Description */}
        <div style={{ font: `400 12.5px/1.55 ${F.body}`, color: M.muted, marginTop: 10 }}>
          {isVerified
            ? "Ownership verified on-chain."
            : "Verify ownership to unlock the full property record and score boost."}
        </div>
      </div>

      {/* ── Rooms & Finishes ─────────────────────────────────────────────── */}
      <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted, margin: "22px 2px 11px" }}>
        ROOMS &amp; FINISHES
      </div>
      <div style={{
        background: M.card, border: `1px solid ${M.cardBdr}`,
        borderRadius: M.radius, boxShadow: M.cardShadow, overflow: "hidden",
      }}>
        {roomRows.length > 0 ? (
          roomRows.map((r, i) => (
            <RoomRow
              key={r.id}
              name={r.name}
              meta={r.meta}
              chip={r.chip}
              chipColor={r.chipColor}
              chipBg={r.chipBg}
              isLast={i === roomRows.length - 1}
            />
          ))
        ) : (
          <div style={{ padding: "24px 18px" }}>
            <div style={{ font: `500 13.5px/1.3 ${F.body}`, color: M.ink, marginBottom: 6 }}>No rooms added yet</div>
            <div style={{ font: `400 12px/1.5 ${F.body}`, color: M.muted }}>
              Add rooms to document fixtures and track your home's condition.
            </div>
          </div>
        )}
      </div>

      {/* ── Sensors ──────────────────────────────────────────────────────── */}
      <div style={{ font: `500 9px/1 ${F.mono}`, letterSpacing: ".14em", color: M.muted, margin: "22px 2px 11px" }}>
        SENSORS
      </div>
      <div style={{ display: "flex", gap: 11 }}>
        {MOCK_SENSORS.map(sn => (
          <SensorCard
            key={sn.label}
            label={sn.label}
            value={sn.value}
            note={sn.note}
            noteColor={sn.noteColor}
          />
        ))}
      </div>

      {/* ── View full record link ─────────────────────────────────────────── */}
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <button
          onClick={() => navigate(`/properties/${selectedId}`)}
          style={{
            font: `600 13px/1 ${F.body}`, color: M.muted,
            background: "transparent", border: "none", cursor: "pointer",
            textDecoration: "underline",
          }}
        >
          View full property record
        </button>
      </div>
    </div>
  );
}
