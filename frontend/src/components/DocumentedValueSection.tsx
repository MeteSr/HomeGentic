/**
 * §17.3.5 — "Documented maintenance value" section for HomeGentic Report.
 * Buyer-facing; uses best available estimate.
 */

import React from "react";
import { getDocumentedValueEstimate, formatValueRange } from "@/services/scoreToValue";
import { COLORS, FONTS } from "@/theme";

interface DocumentedValueSectionProps {
  score:            number;
  zip?:             string;
  homeValueDollars?: number;
}

export function DocumentedValueSection({ score, zip, homeValueDollars }: DocumentedValueSectionProps) {
  const result = getDocumentedValueEstimate(score, { zip, homeValueDollars });
  if (!result) return null;

  return (
    <div style={{
      border:     `1px solid ${COLORS.rule}`,
      padding:    "1rem 1.5rem",
      display:    "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap:   "wrap",
      gap:        "0.75rem",
    }}>
      <div>
        <p style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.14em", textTransform: "uppercase", color: COLORS.plumMid, marginBottom: "0.25rem" }}>
          Documented Maintenance Value
        </p>
        <p style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: COLORS.plum }}>
          {formatValueRange(result)}
        </p>
      </div>
      <p style={{ fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.06em", color: COLORS.plumMid, maxWidth: "22rem" }}>
        Estimated buyer premium based on verified maintenance history · score {score}/100
      </p>
    </div>
  );
}
