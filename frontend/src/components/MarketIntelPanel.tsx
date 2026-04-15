import React from "react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import type { ProjectRecommendation } from "@/services/market";

const UI = {
  ink:      COLORS.plum,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  mono:     FONTS.mono,
  serif:    FONTS.serif,
};

export interface MarketIntelPanelProps {
  recommendations: ProjectRecommendation[];
  onLogJob:        (prefill: { serviceType?: string }) => void;
  onSeeAll:        () => void;
}

export function MarketIntelPanel({
  recommendations,
  onLogJob,
  onSeeAll,
}: MarketIntelPanelProps) {
  if (recommendations.length === 0) return null;

  function priorityColor(p: string) {
    if (p === "High")   return UI.sage;
    if (p === "Medium") return COLORS.plumMid;
    return UI.inkLight;
  }

  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.875rem",
        }}
      >
        <span
          style={{
            fontFamily: UI.mono,
            fontSize: "0.65rem",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: UI.inkLight,
          }}
        >
          Recommended Projects
        </span>
        <button
          onClick={onSeeAll}
          style={{
            fontFamily: UI.mono,
            fontSize: "0.6rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: UI.sage,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          See all →
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(15rem, 1fr))",
          gap: "1rem",
        }}
      >
        {recommendations.map((rec) => (
          <div
            key={rec.name}
            style={{
              background: COLORS.white,
              padding: "1.25rem",
              borderRadius: RADIUS.card,
              border: `1px solid ${COLORS.rule}`,
              boxShadow: SHADOWS.card,
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  color: UI.ink,
                  lineHeight: 1.2,
                }}
              >
                {rec.name}
              </p>
              <span
                style={{
                  fontFamily: UI.mono,
                  fontSize: "0.5rem",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: priorityColor(rec.priority),
                  border: `1px solid ${priorityColor(rec.priority)}`,
                  padding: "0.1rem 0.4rem",
                  flexShrink: 0,
                  opacity: 0.8,
                  borderRadius: RADIUS.pill,
                }}
              >
                {rec.priority}
              </span>
            </div>

            <div style={{ display: "flex", gap: "1.5rem" }}>
              <div>
                <p
                  style={{
                    fontFamily: UI.mono,
                    fontSize: "0.5rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: UI.inkLight,
                    marginBottom: "0.1rem",
                  }}
                >
                  Est. Cost
                </p>
                <p
                  style={{
                    fontFamily: UI.serif,
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    color: UI.ink,
                  }}
                >
                  ${(rec.estimatedCostCents / 100).toLocaleString()}
                </p>
              </div>
              <div>
                <p
                  style={{
                    fontFamily: UI.mono,
                    fontSize: "0.5rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: UI.inkLight,
                    marginBottom: "0.1rem",
                  }}
                >
                  ROI
                </p>
                <p
                  style={{
                    fontFamily: UI.serif,
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    color: UI.sage,
                  }}
                >
                  {rec.estimatedRoiPercent}%
                </p>
              </div>
            </div>

            <p
              style={{
                fontFamily: UI.mono,
                fontSize: "0.6rem",
                color: UI.inkLight,
                letterSpacing: "0.04em",
                lineHeight: 1.5,
                flex: 1,
              }}
            >
              {rec.rationale}
            </p>

            <button
              onClick={() => onLogJob({ serviceType: rec.category })}
              style={{
                fontFamily: UI.mono,
                fontSize: "0.55rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "0.35rem 0.75rem",
                border: `1px solid ${UI.rule}`,
                background: "none",
                color: UI.inkLight,
                cursor: "pointer",
                alignSelf: "flex-start",
                borderRadius: RADIUS.sm,
              }}
            >
              Log This Job →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MarketIntelPanel;
