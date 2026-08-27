import React, { useState } from "react";
import { X } from "lucide-react";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

const UI = {
  ink:      V2_COLORS.ink,
  paper:    V2_COLORS.paper,
  rule:     V2_COLORS.border,
  inkLight: V2_COLORS.muted,
  sage:     V2_COLORS.blue,
  mono:     V2_FONTS.body,
  serif:    V2_FONTS.display,
};

const MILESTONE_KEY  = "homegentic_milestone_dismissed";
const MILESTONE3_KEY = "homegentic_3job_milestone";
const CERTIFIED_KEY  = "homegentic_certified_dismissed";

export interface MilestoneStackProps {
  verifiedJobCount: number;
  accountAgeMs:     number;
  certified:        boolean;
  onNavigate:       (path: string) => void;
}

const ELEVEN_MONTHS_MS = 11 * 30 * 24 * 60 * 60 * 1000;

export function MilestoneStack({
  verifiedJobCount,
  accountAgeMs,
  certified,
  onNavigate,
}: MilestoneStackProps) {
  const [annualDismissed, setAnnualDismissed] = useState(
    () => !!localStorage.getItem(MILESTONE_KEY)
  );
  const [milestone3Dismissed, setMilestone3Dismissed] = useState(
    () => !!localStorage.getItem(MILESTONE3_KEY)
  );
  const [certDismissed, setCertDismissed] = useState(
    () => !!localStorage.getItem(CERTIFIED_KEY)
  );

  const showAnnual    = accountAgeMs >= ELEVEN_MONTHS_MS && verifiedJobCount >= 1 && !annualDismissed;
  const showMilestone3 = verifiedJobCount >= 3 && !milestone3Dismissed;
  const showCertified  = certified && !certDismissed;

  if (!showAnnual && !showMilestone3 && !showCertified) return null;

  return (
    <>
      {/* Annual milestone */}
      {showAnnual && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            border: `1px solid ${UI.sage}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: UI.ink,
            flexWrap: "wrap",
            borderRadius: V2_RADIUS.sm,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: UI.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: UI.sage,
                marginBottom: "0.25rem",
              }}
            >
              One Year of HomeGentic
            </p>
            <p
              style={{
                fontFamily: V2_FONTS.body,
                fontSize: "0.875rem",
                color: UI.paper,
                fontWeight: 300,
              }}
            >
              You've been building your verified home history for nearly a year.
            </p>
            <button
              onClick={() => onNavigate("/resale-ready")}
              style={{
                marginTop: "0.5rem",
                fontFamily: UI.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "0.4rem 1rem",
                border: `1px solid ${UI.sage}`,
                background: "none",
                color: UI.sage,
                cursor: "pointer",
                borderRadius: V2_RADIUS.sm,
              }}
            >
              View Resale Summary →
            </button>
          </div>
          <button
            onClick={() => {
              localStorage.setItem(MILESTONE_KEY, "1");
              setAnnualDismissed(true);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: V2_COLORS.muted,
              flexShrink: 0,
            }}
            aria-label="Dismiss annual milestone"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* 3-job milestone */}
      {showMilestone3 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            border: `1px solid ${UI.sage}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: V2_COLORS.lblue,
            flexWrap: "wrap",
            borderRadius: V2_RADIUS.sm,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                border: `2px solid ${UI.sage}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: UI.sage,
                borderRadius: V2_RADIUS.sm,
              }}
            >
              <span style={{ fontFamily: UI.serif, fontWeight: 900, fontSize: "0.875rem" }}>
                3
              </span>
            </div>
            <div>
              <p
                style={{
                  fontFamily: UI.mono,
                  fontSize: "0.6rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: UI.sage,
                  marginBottom: "0.2rem",
                }}
              >
                Milestone — Your Home History Is Taking Shape
              </p>
              <p style={{ fontSize: "0.875rem", fontWeight: 300, color: UI.ink }}>
                <strong style={{ fontWeight: 600 }}>{verifiedJobCount} verified records</strong>{" "}
                on the blockchain. Buyers can now see a real maintenance history.
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              localStorage.setItem(MILESTONE3_KEY, "1");
              setMilestone3Dismissed(true);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: UI.sage,
              flexShrink: 0,
            }}
            aria-label="Dismiss 3-job milestone"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* HomeGentic Certified */}
      {showCertified && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            border: `1px solid ${V2_COLORS.blue}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: V2_COLORS.lblue,
            flexWrap: "wrap",
            borderRadius: V2_RADIUS.sm,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: UI.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: V2_COLORS.blue,
                marginBottom: "0.2rem",
              }}
            >
              HomeGentic Certified
            </p>
            <p style={{ fontSize: "0.875rem", fontWeight: 300, color: UI.ink }}>
              Your home has achieved HomeGentic Certified status. Share your report to attract buyers.
            </p>
          </div>
          <button
            onClick={() => {
              localStorage.setItem(CERTIFIED_KEY, "1");
              setCertDismissed(true);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: UI.sage,
              flexShrink: 0,
            }}
            aria-label="Dismiss certified banner"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}

export default MilestoneStack;
