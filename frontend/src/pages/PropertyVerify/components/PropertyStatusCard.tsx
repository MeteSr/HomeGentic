import React from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

type Variant = "default" | "warning" | "success" | "contested";

interface Props {
  address    : string;
  statusLine : string;
  subLine    : string;
  variant   ?: Variant;
}

const ACCENT: Record<Variant, string> = {
  default  : V2_COLORS.border,
  warning  : V2_COLORS.coral,
  success  : "#22C55E",
  contested: V2_COLORS.yellow,
};

export function PropertyStatusCard({ address, statusLine, subLine, variant = "default" }: Props) {
  const accent = ACCENT[variant];
  return (
    <div style={{
      background   : V2_COLORS.paper,
      border       : `1px solid ${V2_COLORS.border}`,
      borderLeft   : `3px solid ${accent}`,
      borderRadius : 12,
      padding      : "12px 16px",
      maxWidth     : 240,
    }}>
      <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
        {address}
      </div>
      <div style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: V2_COLORS.ink, marginBottom: 2 }}>
        {statusLine}
      </div>
      <div style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>
        {subLine}
      </div>
    </div>
  );
}
