import React from "react";
import { COLORS, FONTS, RADIUS } from "@/theme";
import {
  categoryColor,
  categoryBg,
  type ScoreEvent,
} from "@/services/scoreEventService";
import {
  decayCategoryColor,
  decayCategoryBg,
  type DecayEvent,
} from "@/services/scoreDecayService";

const UI = {
  ink:      COLORS.plum,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  mono:     FONTS.mono,
};

export interface ScoreActivityFeedProps {
  scoreEvents: ScoreEvent[];
  decayEvents: DecayEvent[];
}

export function ScoreActivityFeed({ scoreEvents, decayEvents }: ScoreActivityFeedProps) {
  if (scoreEvents.length === 0 && decayEvents.length === 0) return null;

  return (
    <div style={{ marginBottom: "2rem" }}>
      <div
        style={{
          fontFamily: UI.mono,
          fontSize: "0.65rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: UI.inkLight,
          marginBottom: "1rem",
        }}
      >
        Score Activity
      </div>
      <div
        style={{
          border: `1px solid ${UI.rule}`,
          borderRadius: RADIUS.card,
          overflow: "hidden",
        }}
      >
        {/* Positive events */}
        {scoreEvents.slice(0, 5).map((ev) => (
          <div
            key={ev.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.875rem",
              padding: "0.75rem 1rem",
              borderBottom: `1px solid ${UI.rule}`,
              background: COLORS.white,
            }}
          >
            <div
              style={{
                width: "2rem",
                height: "2rem",
                background: categoryBg(ev.category),
                border: `1px solid ${categoryColor(ev.category)}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderRadius: RADIUS.sm,
              }}
            >
              <span
                style={{
                  fontFamily: UI.mono,
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  color: categoryColor(ev.category),
                }}
              >
                +{ev.pts}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: "0.8rem", fontWeight: 500 }}>{ev.label}</p>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                {ev.detail}
              </p>
            </div>
            <span
              style={{
                fontFamily: UI.mono,
                fontSize: "0.55rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0.2rem 0.5rem",
                border: `1px solid ${categoryColor(ev.category)}40`,
                color: categoryColor(ev.category),
                flexShrink: 0,
                borderRadius: RADIUS.pill,
              }}
            >
              {ev.category}
            </span>
          </div>
        ))}

        {/* Decay events */}
        {decayEvents.map((ev, i) => (
          <div
            key={ev.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.875rem",
              padding: "0.75rem 1rem",
              borderBottom: i < decayEvents.length - 1 ? `1px solid ${UI.rule}` : "none",
              background: decayCategoryBg(ev.category),
            }}
          >
            <div
              style={{
                width: "2rem",
                height: "2rem",
                background: "#fff",
                border: `1px solid ${decayCategoryColor(ev.category)}40`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderRadius: RADIUS.sm,
              }}
            >
              <span
                style={{
                  fontFamily: UI.mono,
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  color: decayCategoryColor(ev.category),
                }}
              >
                {ev.pts}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  fontSize: "0.8rem",
                  fontWeight: 500,
                  color: decayCategoryColor(ev.category),
                }}
              >
                {ev.label}
              </p>
              <p style={{ fontFamily: UI.mono, fontSize: "0.6rem", color: UI.inkLight }}>
                {ev.detail}
              </p>
              {ev.recoveryPrompt && (
                <p
                  style={{
                    fontFamily: UI.mono,
                    fontSize: "0.58rem",
                    color: decayCategoryColor(ev.category),
                    marginTop: "0.2rem",
                    fontStyle: "italic",
                  }}
                >
                  ↑ {ev.recoveryPrompt}
                </p>
              )}
            </div>
            <span
              style={{
                fontFamily: UI.mono,
                fontSize: "0.55rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                padding: "0.2rem 0.5rem",
                border: `1px solid ${decayCategoryColor(ev.category)}40`,
                color: decayCategoryColor(ev.category),
                flexShrink: 0,
                borderRadius: RADIUS.pill,
              }}
            >
              {ev.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ScoreActivityFeed;
