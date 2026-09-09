import React from "react";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

interface ChoicePillProps {
  label: string;
  selected: boolean;
  locked?: boolean;
  lockedTitle?: string;
  onClick: () => void;
}

/**
 * A pill group, not a segmented control — 100px radius so it reads as the
 * same family as Button. Selected takes the cobalt fill and its shadow;
 * locked (Pro-gated) options use the disabled surface.
 */
export function ChoicePill({ label, selected, locked, lockedTitle, onClick }: ChoicePillProps) {
  const [hovered, setHovered] = React.useState(false);

  const style: React.CSSProperties = locked
    ? { background: V2_COLORS.surface, border: `1.5px solid ${V2_COLORS.border}`, color: V2_COLORS.muted, cursor: "not-allowed" }
    : selected
    ? { background: V2_COLORS.blue, border: `1.5px solid ${V2_COLORS.blue}`, color: V2_COLORS.paper, boxShadow: "0 6px 18px rgba(43,52,255,0.24)", cursor: "pointer" }
    : { background: "#FFFFFF", border: `1.5px solid ${hovered ? V2_COLORS.blue : V2_COLORS.divider}`, color: V2_COLORS.ink, cursor: "pointer" };

  return (
    <button
      type="button"
      title={locked ? lockedTitle : undefined}
      onClick={() => !locked && onClick()}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 44, boxSizing: "border-box", display: "inline-flex", alignItems: "center",
        padding: "0 1.05rem", borderRadius: V2_RADIUS.pill,
        fontFamily: V2_FONTS.mono, fontSize: "11.5px", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase",
        whiteSpace: "nowrap", transition: "background-color .18s, border-color .18s",
        ...style,
      }}
    >
      {label}
    </button>
  );
}
