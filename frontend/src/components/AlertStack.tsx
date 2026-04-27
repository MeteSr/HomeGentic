import React, { useState } from "react";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "@/theme";
import type { AtRiskWarning } from "@/services/scoreDecayService";
import type { PlanTier } from "@/services/payment";

const UI = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  mono:     FONTS.sans,
};

export interface AlertStackProps {
  atRiskWarnings:  AtRiskWarning[];
  scoreStagnant:   boolean;
  pulseTip:        { headline: string; detail: string; category: string } | null;
  pulseEnabled:    boolean;
  userTier:        PlanTier;
  onLogJob:        () => void;
  onNavigate:      (path: string) => void;
}

const PULSE_KEY = `homegentic_pulse_${new Date().toISOString().slice(0, 7)}`;

export function AlertStack({
  atRiskWarnings,
  scoreStagnant,
  pulseTip,
  pulseEnabled,
  userTier,
  onLogJob,
  onNavigate,
}: AlertStackProps) {
  const [pulseDismissed, setPulseDismissed] = useState(
    () => !!localStorage.getItem(PULSE_KEY)
  );
  const showPulse = pulseEnabled && !!pulseTip && !pulseDismissed;

  return (
    <>
      {/* Score at Risk (8.7.7) */}
      {atRiskWarnings.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
            border: "1px solid #f59e0b40",
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: "#fffbeb",
            borderRadius: RADIUS.sm,
          }}
        >
          <div
            style={{
              width: "1.75rem",
              height: "1.75rem",
              background: "#fef3c7",
              border: "1px solid #f59e0b60",
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
                fontSize: "0.65rem",
                fontWeight: 700,
                color: "#b45309",
              }}
            >
              !
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontFamily: UI.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: "#b45309",
                marginBottom: "0.375rem",
              }}
            >
              Score at Risk
            </p>
            {atRiskWarnings.map((w) => (
              <p
                key={w.id}
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 300,
                  color: "#78350f",
                  marginBottom: "0.2rem",
                }}
              >
                {w.label} —{" "}
                <strong style={{ fontWeight: 600 }}>{w.pts} pts</strong> in{" "}
                {w.daysRemaining} day{w.daysRemaining !== 1 ? "s" : ""}
              </p>
            ))}
            <button
              onClick={onLogJob}
              style={{
                marginTop: "0.5rem",
                fontFamily: UI.mono,
                fontSize: "0.55rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "0.35rem 0.875rem",
                background: "#b45309",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                borderRadius: RADIUS.pill,
              }}
            >
              Log a Job <ArrowRight size={11} />
            </button>
          </div>
        </div>
      )}

      {/* Score stagnation nudge */}
      {scoreStagnant && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            border: `1px solid ${UI.rule}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: "#fff",
            flexWrap: "wrap",
            borderRadius: RADIUS.sm,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                border: `1px solid ${UI.rule}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderRadius: RADIUS.sm,
              }}
            >
              <Sparkles size={13} color={UI.inkLight} />
            </div>
            <div>
              <p
                style={{
                  fontFamily: UI.mono,
                  fontSize: "0.6rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: UI.inkLight,
                  marginBottom: "0.2rem",
                }}
              >
                Score Hasn't Moved in 30 Days
              </p>
              <p style={{ fontSize: "0.8rem", fontWeight: 300, color: UI.inkLight }}>
                Log a recent job or verify a property to keep your HomeGentic Score growing.
              </p>
            </div>
          </div>
          <button
            onClick={onLogJob}
            style={{
              fontFamily: UI.mono,
              fontSize: "0.6rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "0.5rem 1rem",
              background: UI.ink,
              color: UI.paper,
              border: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              flexShrink: 0,
              borderRadius: RADIUS.pill,
            }}
          >
            Log a Job <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* Weekly Pulse tip */}
      {showPulse && pulseTip && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            border: `1px solid ${UI.rule}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: "#fff",
            flexWrap: "wrap",
            borderRadius: RADIUS.sm,
          }}
        >
          <div style={{ display: "flex", gap: "0.875rem", flex: 1 }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                border: `1px solid ${UI.rule}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: "0.125rem",
                borderRadius: RADIUS.sm,
              }}
            >
              <Sparkles size={13} color={UI.sage} />
            </div>
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginBottom: "0.25rem",
                }}
              >
                <p
                  style={{
                    fontFamily: UI.mono,
                    fontSize: "0.6rem",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: UI.sage,
                  }}
                >
                  Home Pulse
                </p>
                <span
                  style={{
                    fontFamily: UI.mono,
                    fontSize: "0.55rem",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: UI.inkLight,
                    border: `1px solid ${UI.rule}`,
                    padding: "0.05rem 0.375rem",
                    borderRadius: RADIUS.pill,
                  }}
                >
                  {pulseTip.category}
                </span>
              </div>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: "0.25rem" }}>
                {pulseTip.headline}
              </p>
              <p style={{ fontSize: "0.8rem", color: UI.inkLight, fontWeight: 300 }}>
                {pulseTip.detail}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.setItem(PULSE_KEY, "1");
              setPulseDismissed(true);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: UI.inkLight,
              flexShrink: 0,
            }}
            aria-label="Dismiss pulse tip"
          >
            <X size={15} />
          </button>
        </div>
      )}

    </>
  );
}

export default AlertStack;
