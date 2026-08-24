import React from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

type StepStatus = "done" | "pending" | "expected";

interface TimelineStep {
  label  : string;
  detail : string;
  status : StepStatus;
  date  ?: string;
}

interface Props {
  steps: TimelineStep[];
}

export function VerificationTimeline({ steps }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {steps.map((step, i) => {
        const isDone     = step.status === "done";
        const isPending  = step.status === "pending";
        const isExpected = step.status === "expected";
        const circleColor = isDone ? V2_COLORS.blue : isPending ? "transparent" : "#D1D5DB";
        const circleBorder = isDone ? V2_COLORS.blue : isPending ? V2_COLORS.blue : "#D1D5DB";
        const isLast = i === steps.length - 1;

        return (
          <div key={i} style={{ display: "flex", gap: 16 }}>
            {/* Spine */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{
                width       : 20,
                height      : 20,
                borderRadius: "50%",
                background  : circleColor,
                border      : `2px solid ${circleBorder}`,
                display     : "flex",
                alignItems  : "center",
                justifyContent: "center",
                flexShrink  : 0,
              }}>
                {isDone && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              {!isLast && (
                <div style={{ width: 2, flex: 1, background: isDone ? V2_COLORS.blue : V2_COLORS.border, minHeight: 24, marginTop: 2, marginBottom: 2 }} />
              )}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: isLast ? 0 : 20, flex: 1 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 14, fontFamily: V2_FONTS.body, fontWeight: 600, color: isExpected ? V2_COLORS.muted : V2_COLORS.ink }}>
                  {step.label}
                </span>
                {step.date && (
                  <span style={{ fontSize: 11, fontFamily: V2_FONTS.mono, color: V2_COLORS.muted }}>
                    {step.date}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, fontFamily: V2_FONTS.body, color: V2_COLORS.muted }}>
                {step.detail}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
