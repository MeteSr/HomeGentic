/**
 * §17.5.5 — Permit Coverage Indicator
 *
 * Shown in the address step of PropertyRegisterPage once city+state are filled.
 * Tells the homeowner whether permit auto-import will be available for their area.
 */

import React from "react";
import { isPermitDataAvailable } from "@/services/permitImport";
import { COLORS, FONTS } from "@/theme";

interface Props {
  city:  string;
  state: string;
}

export default function PermitCoverageIndicator({ city, state }: Props) {
  if (!city.trim() || !state.trim()) return null;

  const available = isPermitDataAvailable(city, state);

  return (
    <div
      role="status"
      style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           "0.375rem",
        padding:       "0.3rem 0.625rem",
        border:        `1px solid ${available ? COLORS.sageMid : COLORS.rule}`,
        background:    available ? COLORS.sageLight : COLORS.white,
        fontFamily:    FONTS.mono,
        fontSize:      "0.6rem",
        letterSpacing: "0.08em",
        color:         available ? COLORS.sage : COLORS.plumMid,
        marginTop:     "0.5rem",
      }}
    >
      {available ? (
        <>&#10003; Permit data available for {city}</>
      ) : (
        <>Permit data not available in your area</>
      )}
    </div>
  );
}
