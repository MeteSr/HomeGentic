import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { V2_COLORS, V2_FONTS } from "@/theme";
import { useAddPropertyStore } from "@/store/addPropertyStore";

interface Property {
  id:      string | number;
  address: string;
  city:    string;
  state:   string;
  zipCode: string;
  type?:   string;
  yearBuilt?: string | number;
}

interface PropertyAddressBarProps {
  activeProperty:    Property | null;
  properties:        Property[];
  onSelect:          (id: string) => void;
  certBadge?:        boolean;
}

function getInitial(address: string): string {
  return address.trim()[0]?.toUpperCase() ?? "?";
}

const AVATAR_COLORS = [
  { bg: "#2B34FF", fg: "#fff" },
  { bg: "#FF5C39", fg: "#fff" },
  { bg: "#FFD23F", fg: "#0B0D1A" },
  { bg: "#16A34A", fg: "#fff" },
  { bg: "#7C3AED", fg: "#fff" },
];

export function PropertyAddressBar({ activeProperty, properties, onSelect, certBadge }: PropertyAddressBarProps) {
  const [open, setOpen]       = useState(false);
  const ref                   = useRef<HTMLDivElement>(null);
  const navigate              = useNavigate();
  const { open: openAddProp } = useAddPropertyStore();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!activeProperty) return null;

  const addressLabel = `${activeProperty.address} · ${activeProperty.city} ${activeProperty.state} ${activeProperty.zipCode}`.toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      {/* Pill */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1.5px solid ${V2_COLORS.border}`, borderRadius: 100, padding: "6px 14px 6px 10px", background: "#fff", cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <span style={{ fontSize: 13 }}>🏠</span>
        <span style={{ fontFamily: V2_FONTS.mono, fontSize: 11, fontWeight: 600, color: V2_COLORS.ink, letterSpacing: "0.06em" }}>
          {addressLabel}
        </span>
        <span style={{ width: 1, height: 14, background: V2_COLORS.border, margin: "0 2px" }} />
        <span style={{ fontFamily: V2_FONTS.mono, fontSize: 11, fontWeight: 700, color: V2_COLORS.blue, letterSpacing: "0.06em" }}>
          SWITCH
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" style={{ color: V2_COLORS.blue, transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {certBadge && (
        <span style={{ marginLeft: 8, display: "inline-flex", alignItems: "center", gap: 4, fontFamily: V2_FONTS.mono, fontSize: 10, fontWeight: 700, color: "#16A34A", letterSpacing: "0.08em", border: "1.5px solid #BBF7D0", borderRadius: 100, padding: "4px 10px", background: "#F0FDF4" }}>
          ✓ CERTIFIED
        </span>
      )}

      {/* Dropdown */}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 200, background: "#fff", border: `1px solid ${V2_COLORS.border}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 320, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "10px 16px", borderBottom: `1px solid ${V2_COLORS.border}` }}>
            <span style={{ fontFamily: V2_FONTS.mono, fontSize: 10, fontWeight: 700, color: V2_COLORS.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              YOUR PROPERTIES · {properties.length} TOTAL
            </span>
          </div>

          {/* Property list */}
          {properties.map((prop, i) => {
            const isActive = String(prop.id) === String(activeProperty.id);
            const { bg, fg } = AVATAR_COLORS[i % AVATAR_COLORS.length];
            const typeLabel  = prop.type ?? (i === 0 ? "Primary residence" : "Property");
            const yearLabel  = prop.yearBuilt ? `built ${prop.yearBuilt}` : "";
            return (
              <div
                key={String(prop.id)}
                onClick={() => { onSelect(String(prop.id)); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", background: isActive ? V2_COLORS.lblue : "transparent", borderBottom: `1px solid ${V2_COLORS.border}`, transition: "background 0.1s" }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = V2_COLORS.lblue; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
              >
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontFamily: V2_FONTS.mono, fontSize: 13, fontWeight: 700, color: fg }}>{getInitial(prop.address)}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 600, color: V2_COLORS.ink }}>{prop.address}</div>
                  <div style={{ fontFamily: V2_FONTS.mono, fontSize: 11, color: V2_COLORS.muted, marginTop: 1 }}>
                    {typeLabel}{yearLabel ? ` · ${yearLabel}` : ""}
                  </div>
                </div>
                {isActive && (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: V2_COLORS.blue, flexShrink: 0 }}>
                    <path d="M3 8l4 4 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
            );
          })}

          {/* Add property footer */}
          <div
            onClick={() => { setOpen(false); openAddProp(); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", cursor: "pointer", background: "transparent" }}
            onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = V2_COLORS.lblue; }}
            onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: `1.5px dashed ${V2_COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 14, color: V2_COLORS.muted }}>+</span>
              </div>
              <span style={{ fontFamily: V2_FONTS.body, fontSize: 14, fontWeight: 500, color: V2_COLORS.ink }}>Add property</span>
            </div>
            <span style={{ fontFamily: V2_FONTS.mono, fontSize: 10, color: V2_COLORS.muted }}>{properties.length} USED</span>
          </div>
        </div>
      )}
    </div>
  );
}
