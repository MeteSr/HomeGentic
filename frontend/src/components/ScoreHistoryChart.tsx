import React from "react";
import { COLORS, FONTS } from "@/theme";
import { type ScoreSnapshot } from "@/services/scoreService";

export function ScoreHistoryChart({ history }: { history: ScoreSnapshot[] }) {
  const W = 560, H = 160, padL = 36, padR = 16, padT = 12, padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const scores = history.map((s) => s.score);
  const minS   = Math.max(0, Math.min(...scores) - 10);
  const maxS   = Math.min(100, Math.max(...scores) + 10);
  const range  = maxS - minS || 1;

  const toX = (i: number) => padL + (i / Math.max(history.length - 1, 1)) * innerW;
  const toY = (s: number) => padT + innerH - ((s - minS) / range) * innerH;

  const pts   = history.map((s, i) => `${toX(i).toFixed(1)},${toY(s.score).toFixed(1)}`).join(" ");
  const areaD = `M ${toX(0)},${toY(history[0].score)} ` +
    history.map((s, i) => `L ${toX(i).toFixed(1)},${toY(s.score).toFixed(1)}`).join(" ") +
    ` L ${toX(history.length - 1)},${padT + innerH} L ${toX(0)},${padT + innerH} Z`;

  const yGridLines = [0, 25, 50, 75, 100].filter((v) => v >= minS - 5 && v <= maxS + 5);
  const step = Math.max(1, Math.floor(history.length / 5));

  return (
    <div style={{ padding: "1rem", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: H, display: "block" }}>
        <defs>
          <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={COLORS.sage} stopOpacity="0.2" />
            <stop offset="100%" stopColor={COLORS.sage} stopOpacity="0" />
          </linearGradient>
        </defs>

        {yGridLines.map((v) => (
          <g key={v}>
            <line x1={padL} y1={toY(v)} x2={padL + innerW} y2={toY(v)} stroke={COLORS.rule} strokeWidth="0.5" strokeDasharray="3,3" />
            <text x={padL - 4} y={toY(v)} textAnchor="end" dominantBaseline="middle" fill={COLORS.plumMid} fontSize="9" fontFamily={FONTS.mono}>{v}</text>
          </g>
        ))}

        <path d={areaD} fill="url(#scoreAreaGrad)" />
        <polyline points={pts} fill="none" stroke={COLORS.sage} strokeWidth="1.5" strokeLinejoin="round" />

        {history.map((s, i) => (
          <circle key={i} cx={toX(i)} cy={toY(s.score)} r="2.5" fill={COLORS.sage} />
        ))}

        {history.map((s, i) => {
          if (i % step !== 0 && i !== history.length - 1) return null;
          const d   = new Date(s.timestamp);
          const lbl = `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, "0")}`;
          return (
            <text key={i} x={toX(i)} y={padT + innerH + 14} textAnchor="middle" fill={COLORS.plumMid} fontSize="8" fontFamily={FONTS.mono}>
              {lbl}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
