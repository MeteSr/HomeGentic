/**
 * §17.3.5 — "Documented maintenance value" section for HomeGentic Report.
 * Buyer-facing; uses best available estimate.
 */

import React from "react";
import { getDocumentedValueEstimate, formatValueRange } from "@/services/scoreToValue";
import { V2_COLORS, V2_FONTS } from "@/theme";

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
      border:     `1px solid ${V2_COLORS.border}`,
      padding:    "1rem 1.5rem",
      display:    "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap:   "wrap",
      gap:        "0.75rem",
    }}>
      <div>
        <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, color: V2_COLORS.muted, marginBottom: "0.25rem" }}>
          Documented Maintenance Value
        </p>
        <p style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: V2_COLORS.ink }}>
          {formatValueRange(result)}
        </p>
      </div>
      <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 300, color: V2_COLORS.muted, maxWidth: "22rem" }}>
        Estimated buyer premium based on verified maintenance history · score {score}/100
      </p>
    </div>
  );
}
