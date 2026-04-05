import React from "react";
import { ShieldCheck } from "lucide-react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

export interface ScorePanelProps {
  score:         number;
  grade:         string;
  delta:         number;
  certified:     boolean;
  premium:       { low: number; high: number } | null;
  market:        string;
  onResaleReady: () => void;
  onCopyCertLink?: () => void;
}

export function ScorePanel({
  score,
  grade,
  delta,
  certified,
  premium,
  market,
  onResaleReady,
  onCopyCertLink,
}: ScorePanelProps) {
  return (
    <div
      style={{
        background: COLORS.plum,
        borderRadius: RADIUS.card,
        padding: "1.5rem",
        marginBottom: "1.5rem",
        boxShadow: SHADOWS.card,
      }}
    >
      {/* Score + grade */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span
          aria-label="HomeGentic Score"
          style={{
            fontFamily: S.serif,
            fontWeight: 900,
            fontSize: "3rem",
            lineHeight: 1,
            color: COLORS.white,
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontFamily: S.mono,
            fontSize: "0.75rem",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          /100 · {grade}
        </span>
      </div>

      {/* Delta chip — hidden when 0 */}
      {delta !== 0 && (
        <div
          aria-label="Score delta"
          style={{
            display: "inline-block",
            fontFamily: S.mono,
            fontSize: "0.65rem",
            fontWeight: 700,
            color: delta > 0 ? COLORS.sage : COLORS.blush,
            background: "rgba(255,255,255,0.1)",
            padding: "0.2rem 0.6rem",
            borderRadius: RADIUS.pill,
            marginBottom: "1rem",
            letterSpacing: "0.06em",
          }}
        >
          {delta > 0 ? "+" : ""}{delta} pts
        </div>
      )}

      {/* Certified badge */}
      {certified && (
        <div
          aria-label="HomeGentic Certified"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.375rem",
            fontFamily: S.mono,
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: COLORS.sage,
            border: `1px solid ${COLORS.sage}60`,
            padding: "0.25rem 0.625rem",
            borderRadius: RADIUS.pill,
            marginBottom: "1rem",
            marginLeft: delta !== 0 ? "0.5rem" : "0",
          }}
        >
          <ShieldCheck size={11} />
          HomeGentic Certified
        </div>
      )}

      {/* Premium range card */}
      {premium && (
        <div
          aria-label="Premium estimate"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: RADIUS.sm,
            padding: "0.875rem 1rem",
            marginBottom: "1.25rem",
          }}
        >
          <p
            style={{
              fontFamily: S.mono,
              fontSize: "0.55rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: COLORS.sage,
              marginBottom: "0.3rem",
            }}
          >
            Buyer Premium · {market}
          </p>
          <p
            style={{
              fontFamily: S.serif,
              fontWeight: 900,
              fontSize: "1.5rem",
              lineHeight: 1,
              color: COLORS.white,
            }}
          >
            ${premium.low.toLocaleString()} – ${premium.high.toLocaleString()}
          </p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.625rem", flexWrap: "wrap" }}>
        <button
          onClick={onResaleReady}
          style={{
            fontFamily: S.mono,
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "0.4rem 0.875rem",
            border: `1px solid ${COLORS.sage}`,
            background: "none",
            color: COLORS.sage,
            cursor: "pointer",
            borderRadius: RADIUS.sm,
          }}
        >
          View Resale Report
        </button>
        {onCopyCertLink && (
          <button
            onClick={onCopyCertLink}
            style={{
              fontFamily: S.mono,
              fontSize: "0.6rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.4rem 0.875rem",
              border: "1px solid rgba(255,255,255,0.25)",
              background: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              borderRadius: RADIUS.sm,
            }}
          >
            Copy Cert Link
          </button>
        )}
      </div>
    </div>
  );
}

export default ScorePanel;
