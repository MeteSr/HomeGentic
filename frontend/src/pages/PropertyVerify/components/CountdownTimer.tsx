import React, { useState, useEffect } from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface Props {
  claimStartedAt   : number;
  claimWindowEndsAt: number;
  subtitle        ?: string;
}

export function CountdownTimer({ claimStartedAt, claimWindowEndsAt, subtitle }: Props) {
  const [msLeft, setMsLeft] = useState(() => Math.max(0, claimWindowEndsAt - Date.now()));

  useEffect(() => {
    if (msLeft <= 0) return;
    const id = setInterval(() => setMsLeft(Math.max(0, claimWindowEndsAt - Date.now())), 1000);
    return () => clearInterval(id);
  }, [claimWindowEndsAt]);

  const totalMs  = claimWindowEndsAt - claimStartedAt;
  const elapsed  = totalMs - msLeft;
  const progress = Math.min(1, elapsed / totalMs);
  const isUrgent = msLeft <= 12 * 60 * 60 * 1000;
  const hrs  = Math.floor(msLeft / 3_600_000);
  const mins = Math.floor((msLeft % 3_600_000) / 60_000);
  const label = `${hrs}:${String(mins).padStart(2, "0")} LEFT`;
  const barColor = isUrgent ? V2_COLORS.coral : V2_COLORS.blue;
  const bgColor  = isUrgent ? "#FFF0EE" : "#F0F1FF";

  return (
    <div style={{ background: bgColor, border: `1px solid ${isUrgent ? "#FFCCC7" : "#D0D3FF"}`, borderRadius: 12, padding: "14px 20px", marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontFamily: V2_FONTS.mono, fontWeight: 600, color: barColor, letterSpacing: "0.04em" }}>
          🕐 {label}
        </span>
        {subtitle && (
          <span style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted, flex: 1 }}>
            {subtitle}
          </span>
        )}
      </div>
      <div style={{ height: 4, background: isUrgent ? "#FFCCC7" : "#D0D3FF", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${progress * 100}%`, background: barColor, borderRadius: 2, transition: "width 1s linear" }} />
      </div>
    </div>
  );
}
