import React from "react";
import { ShieldCheck } from "lucide-react";
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  inkLight: V2_COLORS.muted,
  sage:     V2_COLORS.blue,
  serif:    V2_FONTS.display,
  mono:     V2_FONTS.body,
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
        background: V2_COLORS.ink,
        borderRadius: V2_RADIUS.card,
        padding: "1.5rem",
        marginBottom: "1.5rem",
        boxShadow: V2_SHADOWS.card,
      }}
    >
      {/* Score + grade */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span
          aria-label="HomeGentic Score"
          style={{
            fontFamily: UI.serif,
            fontWeight: 900,
            fontSize: "3rem",
            lineHeight: 1,
            color: V2_COLORS.paper,
          }}
        >
          {score}
        </span>
        <span
          style={{
            fontFamily: UI.mono,
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
            fontFamily: UI.mono,
            fontSize: "0.65rem",
            fontWeight: 700,
            color: delta > 0 ? V2_COLORS.blue : V2_COLORS.attentionBg,
            background: "rgba(255,255,255,0.1)",
            padding: "0.2rem 0.6rem",
            borderRadius: V2_RADIUS.pill,
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
            fontFamily: UI.mono,
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: V2_COLORS.blue,
            border: `1px solid ${V2_COLORS.blue}60`,
            padding: "0.25rem 0.625rem",
            borderRadius: V2_RADIUS.pill,
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
            borderRadius: V2_RADIUS.sm,
            padding: "0.875rem 1rem",
            marginBottom: "1.25rem",
          }}
        >
          <p
            style={{
              fontFamily: UI.mono,
              fontSize: "0.55rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: V2_COLORS.blue,
              marginBottom: "0.3rem",
            }}
          >
            Buyer Premium · {market}
          </p>
          <p
            style={{
              fontFamily: UI.serif,
              fontWeight: 900,
              fontSize: "1.5rem",
              lineHeight: 1,
              color: V2_COLORS.paper,
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
            fontFamily: UI.mono,
            fontSize: "0.6rem",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "0.4rem 0.875rem",
            border: `1px solid ${V2_COLORS.blue}`,
            background: "none",
            color: V2_COLORS.blue,
            cursor: "pointer",
            borderRadius: V2_RADIUS.sm,
          }}
        >
          View Resale Report
        </button>
        {onCopyCertLink && (
          <button
            onClick={onCopyCertLink}
            style={{
              fontFamily: UI.mono,
              fontSize: "0.6rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.4rem 0.875rem",
              border: "1px solid rgba(255,255,255,0.25)",
              background: "none",
              color: "rgba(255,255,255,0.7)",
              cursor: "pointer",
              borderRadius: V2_RADIUS.sm,
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
