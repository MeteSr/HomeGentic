/**
 * §17.3.2 — Score → Dollar Value banner for property detail / score panel.
 * Uses best available estimate: homeValue > zip > flat bands.
 */

import React from "react";
import { getDocumentedValueEstimate, formatValueRange } from "@/services/scoreToValue";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface ScoreValueBannerProps {
  score:           number;
  zip?:            string;
  homeValueDollars?: number;
}

export function ScoreValueBanner({ score, zip, homeValueDollars }: ScoreValueBannerProps) {
  const result = getDocumentedValueEstimate(score, { zip, homeValueDollars });
  if (!result) return null;

  return (
    <div style={{
      padding:    "1rem 1.25rem",
      background: V2_COLORS.lblue,
      border:     `1px solid ${V2_COLORS.cobalTint}`,
      display:    "flex",
      flexDirection: "column",
      gap:        "0.25rem",
    }}>
      <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.7rem", fontWeight: 600, color: V2_COLORS.blue }}>
        Documented value · buyer confidence
      </div>
      <div style={{ fontFamily: V2_FONTS.display, fontWeight: 900, fontSize: "1.5rem", lineHeight: 1, color: V2_COLORS.ink }}>
        {formatValueRange(result)}
      </div>
      <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.75rem", fontWeight: 300, color: V2_COLORS.muted }}>
        Estimated buyer premium from verified maintenance records · score {score}/100
      </div>
    </div>
  );
}
