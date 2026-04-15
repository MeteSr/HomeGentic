import React from "react";
import { COLORS, FONTS } from "@/theme";
import { type ScoreSnapshot } from "@/services/scoreService";

export function ScoreSparkline({ history, onExpand }: { history: ScoreSnapshot[]; onExpand?: () => void }) {
  if (history.length < 2) return null;

  const W = 80, H = 24, pad = 2;
  const scores = history.map((s) => s.score);
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = max - min || 1;

  const pts = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
    const y = H - pad - ((s - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div onClick={onExpand} style={{ cursor: onExpand ? "pointer" : "default", marginTop: "0.5rem" }}>
      <svg width={W} height={H} style={{ display: "block", opacity: 0.7 }}>
        <polyline points={pts} fill="none" stroke={COLORS.sageMid} strokeWidth="1.5" strokeLinejoin="round" />
        {scores.map((s, i) => {
          const x = pad + (i / (scores.length - 1)) * (W - pad * 2);
          const y = H - pad - ((s - min) / range) * (H - pad * 2);
          return i === scores.length - 1
            ? <circle key={i} cx={x} cy={y} r="2.5" fill={COLORS.sage} />
            : null;
        })}
      </svg>
      {onExpand && (
        <div style={{ fontFamily: FONTS.mono, fontSize: "0.5rem", letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.plumMid, marginTop: "0.25rem" }}>
          View history ↗
        </div>
      )}
    </div>
  );
}
