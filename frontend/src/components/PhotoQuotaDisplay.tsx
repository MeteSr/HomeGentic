import React from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface PhotoQuotaDisplayProps {
  used: number;
  limit: number;
  tier: string;
  onUpgrade?: () => void;
}

export function PhotoQuotaDisplay({
  used,
  limit,
  tier,
  onUpgrade,
}: PhotoQuotaDisplayProps) {
  const pct = Math.min((used / limit) * 100, 100);
  const barColor = pct > 80 ? V2_COLORS.ink : V2_COLORS.blue;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem" }}>
        <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", color: V2_COLORS.muted }}>Photos Used</span>
        <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.65rem", fontWeight: 600, color: pct > 80 ? V2_COLORS.ink : V2_COLORS.blue }}>
          {used}/{limit}
        </span>
      </div>
      <div style={{ width: "100%", backgroundColor: V2_COLORS.border, borderRadius: 100, height: "6px" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "6px",
            borderRadius: 100,
            backgroundColor: barColor,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      {pct > 80 && onUpgrade && (
        <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", color: V2_COLORS.muted }}>
          Running low on photo quota.{" "}
          <button
            onClick={onUpgrade}
            style={{
              color: V2_COLORS.blue,
              textDecoration: "underline",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              fontFamily: V2_FONTS.body,
              fontSize: "0.6rem",
            }}
          >
            Upgrade from {tier}
          </button>
        </p>
      )}
    </div>
  );
}
