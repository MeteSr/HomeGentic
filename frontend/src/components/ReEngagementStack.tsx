import React, { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "@/theme";
import type { ReEngagementPrompt } from "@/services/reEngagementService";

const S = {
  ink:      COLORS.plum,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  mono:     FONTS.mono,
};

export interface ReEngagementStackProps {
  prompts:        ReEngagementPrompt[];
  onRequestQuote: (prefill: { serviceType?: string; contractorName?: string }) => void;
  onLogJob:       (prefill: { serviceType?: string; contractorName?: string }) => void;
}

export function ReEngagementStack({
  prompts,
  onRequestQuote,
  onLogJob,
}: ReEngagementStackProps) {
  const [dismissed, setDismissed] = useState<Set<string>>(
    () =>
      new Set(
        Object.keys(localStorage)
          .filter((k) => k.startsWith("homefax_reengage_"))
          .map((k) => k.replace("homefax_reengage_", ""))
      )
  );

  const visible = prompts.filter((p) => !dismissed.has(p.jobId));

  if (visible.length === 0) return null;

  function dismiss(jobId: string) {
    localStorage.setItem(`homefax_reengage_${jobId}`, "1");
    setDismissed((prev) => new Set([...prev, jobId]));
  }

  return (
    <>
      {visible.map((prompt) => (
        <div
          key={prompt.jobId}
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            border: `1px solid ${S.rule}`,
            padding: "1rem 1.25rem",
            marginBottom: "1rem",
            background: COLORS.white,
            flexWrap: "wrap",
            borderRadius: RADIUS.sm,
          }}
        >
          <div style={{ display: "flex", gap: "0.75rem", flex: 1 }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                border: `1px solid ${S.rule}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                borderRadius: RADIUS.sm,
              }}
            >
              <ShieldCheck size={13} color={S.sage} />
            </div>
            <div>
              <p
                style={{
                  fontFamily: S.mono,
                  fontSize: "0.6rem",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: S.sage,
                  marginBottom: "0.2rem",
                }}
              >
                Book Again — {prompt.serviceType}
              </p>
              <p
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 400,
                  color: S.ink,
                  marginBottom: "0.5rem",
                }}
              >
                {prompt.message}
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  onClick={() =>
                    onRequestQuote({
                      serviceType:    prompt.serviceType,
                      contractorName: prompt.contractorName,
                    })
                  }
                  style={{
                    fontFamily: S.mono,
                    fontSize: "0.55rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "0.35rem 0.875rem",
                    border: `1px solid ${S.sage}`,
                    background: "none",
                    color: S.sage,
                    cursor: "pointer",
                    borderRadius: RADIUS.sm,
                  }}
                >
                  Request Quote →
                </button>
                <button
                  onClick={() =>
                    onLogJob({
                      serviceType:    prompt.serviceType,
                      contractorName: prompt.contractorName,
                    })
                  }
                  style={{
                    fontFamily: S.mono,
                    fontSize: "0.55rem",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    padding: "0.35rem 0.875rem",
                    border: `1px solid ${S.rule}`,
                    background: "none",
                    color: S.inkLight,
                    cursor: "pointer",
                    borderRadius: RADIUS.sm,
                  }}
                >
                  Log Job
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={() => dismiss(prompt.jobId)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: S.inkLight,
              flexShrink: 0,
            }}
            aria-label={`Dismiss ${prompt.serviceType} re-engagement`}
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </>
  );
}

export default ReEngagementStack;
