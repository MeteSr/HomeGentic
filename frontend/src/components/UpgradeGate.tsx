/**
 * UpgradeGate (15.7.1)
 *
 * Drop-in lock card for Pro/Premium-only features. Shows a clean, empty
 * gate — no blurred preview (which would leak data to the DOM).
 *
 * Usage:
 *   <UpgradeGate feature="Score Breakdown" description="See exactly what's dragging your score down." />
 *   <UpgradeGate feature="5-Year Calendar" description="Plan ahead with cost estimates." tier="Pro" />
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

interface UpgradeGateProps {
  /** Short feature name shown as the card heading */
  feature: string;
  /** One-line value prop explaining what the user unlocks */
  description: string;
  /** Minimum tier required — defaults to "Pro" */
  tier?: "Pro" | "Premium";
  /** Optional: replace the default lock icon with an emoji or element */
  icon?: React.ReactNode;
  /** Override card width/layout when embedded in a specific context */
  style?: React.CSSProperties;
}

export function UpgradeGate({
  feature,
  description,
  tier = "Pro",
  icon,
  style,
}: UpgradeGateProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        background: COLORS.sageLight,
        border: `1.5px solid ${COLORS.sageMid}`,
        borderRadius: RADIUS.card,
        padding: "2rem 1.75rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "1rem",
        boxShadow: SHADOWS.card,
        ...style,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: "3rem",
          height: "3rem",
          borderRadius: "50%",
          background: COLORS.white,
          border: `1.5px solid ${COLORS.sageMid}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
        }}
      >
        {icon ?? <Lock size={20} color={COLORS.plumMid} />}
      </div>

      {/* Text */}
      <div>
        <p
          style={{
            fontFamily: FONTS.serif,
            fontWeight: 700,
            fontSize: "1.1rem",
            color: COLORS.plum,
            marginBottom: "0.375rem",
          }}
        >
          {feature}
        </p>
        <p
          style={{
            fontFamily: FONTS.sans,
            fontSize: "0.875rem",
            fontWeight: 400,
            color: COLORS.plumMid,
            lineHeight: 1.5,
            maxWidth: "22rem",
          }}
        >
          {description}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate("/pricing")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          background: COLORS.plum,
          color: COLORS.white,
          border: "none",
          borderRadius: RADIUS.pill,
          padding: "0.55rem 1.4rem",
          fontFamily: FONTS.sans,
          fontWeight: 600,
          fontSize: "0.875rem",
          cursor: "pointer",
        }}
      >
        Upgrade to {tier} →
      </button>
    </div>
  );
}
