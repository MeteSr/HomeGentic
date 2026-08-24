import React from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface Props {
  strength: "STRONG" | "WEAK" | "MODERATE";
}

export function EvidenceStrengthBar({ strength }: Props) {
  const config = {
    STRONG  : { width: "100%", color: V2_COLORS.blue,  bg: V2_COLORS.lblue },
    MODERATE: { width: "60%",  color: V2_COLORS.yellow, bg: "#FFFBEB" },
    WEAK    : { width: "33%",  color: V2_COLORS.coral,  bg: "#FFF0EE" },
  }[strength];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Evidence Strength
        </span>
        <span style={{ fontSize: 12, fontFamily: V2_FONTS.mono, fontWeight: 700, color: config.color }}>
          {strength}
        </span>
      </div>
      <div style={{ height: 6, background: V2_COLORS.border, borderRadius: 3 }}>
        <div style={{ height: "100%", width: config.width, background: config.color, borderRadius: 3, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}
