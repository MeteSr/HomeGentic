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
import { V2_COLORS, V2_FONTS, V2_RADIUS, V2_SHADOWS } from "@/theme";

interface UpgradeGateProps {
  /** Short feature name shown as the card heading */
  feature: string;
  /** One-line value prop explaining what the user unlocks */
  description: string;
  /** Minimum tier required — defaults to "Basic" */
  tier?: "Basic" | "Pro" | "Premium";
  /** Optional: replace the default lock icon with an emoji or element */
  icon?: React.ReactNode;
  /** Override card width/layout when embedded in a specific context */
  style?: React.CSSProperties;
  /** When provided, called instead of navigating to /pricing */
  onUpgrade?: () => void;
}

export function UpgradeGate({
  feature,
  description,
  tier = "Basic",
  icon,
  style,
  onUpgrade,
}: UpgradeGateProps) {
  const navigate = useNavigate();

  return (
    <div
      style={{
        background: V2_COLORS.lblue,
        border: `1.5px solid ${V2_COLORS.cobalTint}`,
        borderRadius: V2_RADIUS.card,
        padding: "2rem 1.75rem",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: "1rem",
        boxShadow: V2_SHADOWS.card,
        ...style,
      }}
    >
      {/* Icon */}
      <div
        style={{
          width: "3rem",
          height: "3rem",
          borderRadius: "50%",
          background: V2_COLORS.paper,
          border: `1.5px solid ${V2_COLORS.cobalTint}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
        }}
      >
        {icon ?? <Lock size={20} color={V2_COLORS.muted} />}
      </div>

      {/* Text */}
      <div>
        <p
          style={{
            fontFamily: V2_FONTS.display,
            fontWeight: 700,
            fontSize: "1.1rem",
            color: V2_COLORS.ink,
            marginBottom: "0.375rem",
          }}
        >
          {feature}
        </p>
        <p
          style={{
            fontFamily: V2_FONTS.body,
            fontSize: "0.875rem",
            fontWeight: 400,
            color: V2_COLORS.muted,
            lineHeight: 1.5,
            maxWidth: "22rem",
          }}
        >
          {description}
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => onUpgrade ? onUpgrade() : navigate("/pricing")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.375rem",
          background: V2_COLORS.ink,
          color: V2_COLORS.paper,
          border: "none",
          borderRadius: V2_RADIUS.pill,
          padding: "0.55rem 1.4rem",
          fontFamily: V2_FONTS.body,
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
