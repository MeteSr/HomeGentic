import React, { useState } from "react";
import { X } from "lucide-react";
import { COLORS, FONTS, RADIUS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  mono:     FONTS.mono,
  serif:    FONTS.serif,
};

const MILESTONE_KEY  = "homefax_milestone_dismissed";
const MILESTONE3_KEY = "homefax_3job_milestone";
const CERTIFIED_KEY  = "homefax_certified_dismissed";

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
            border: `1px solid ${S.sage}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: S.ink,
            flexWrap: "wrap",
            borderRadius: RADIUS.sm,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: S.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: S.sage,
                marginBottom: "0.25rem",
              }}
            >
              One Year of HomeFax
            </p>
            <p
              style={{
                fontFamily: "'IBM Plex Sans', sans-serif",
                fontSize: "0.875rem",
                color: S.paper,
                fontWeight: 300,
              }}
            >
              You've been building your verified home history for nearly a year.
            </p>
            <button
              onClick={() => onNavigate("/resale-ready")}
              style={{
                marginTop: "0.5rem",
                fontFamily: S.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                padding: "0.4rem 1rem",
                border: `1px solid ${S.sage}`,
                background: "none",
                color: S.sage,
                cursor: "pointer",
                borderRadius: RADIUS.sm,
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
              color: COLORS.plumMid,
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
            border: `1px solid ${S.sage}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: COLORS.sageLight,
            flexWrap: "wrap",
            borderRadius: RADIUS.sm,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.875rem" }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                border: `2px solid ${S.sage}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: S.sage,
                borderRadius: RADIUS.sm,
              }}
            >
              <span style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "0.875rem" }}>
                3
              </span>
            </div>
            <div>
              <p
                style={{
                  fontFamily: S.mono,
                  fontSize: "0.6rem",
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: S.sage,
                  marginBottom: "0.2rem",
                }}
              >
                Milestone — Your Home History Is Taking Shape
              </p>
              <p style={{ fontSize: "0.875rem", fontWeight: 300, color: S.ink }}>
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
              color: S.sage,
              flexShrink: 0,
            }}
            aria-label="Dismiss 3-job milestone"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* HomeFax Certified */}
      {showCertified && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            border: `1px solid ${COLORS.sage}`,
            padding: "1rem 1.25rem",
            marginBottom: "1.5rem",
            background: COLORS.sageLight,
            flexWrap: "wrap",
            borderRadius: RADIUS.sm,
          }}
        >
          <div>
            <p
              style={{
                fontFamily: S.mono,
                fontSize: "0.6rem",
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: COLORS.sage,
                marginBottom: "0.2rem",
              }}
            >
              HomeFax Certified
            </p>
            <p style={{ fontSize: "0.875rem", fontWeight: 300, color: S.ink }}>
              Your home has achieved HomeFax Certified status. Share your report to attract buyers.
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
              color: S.sage,
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
