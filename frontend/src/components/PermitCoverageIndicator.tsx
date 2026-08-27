/**
 * §17.5.5 — Permit Coverage Indicator
 *
 * Shown in the address step of AddPropertyModal once city+state are filled.
 * Tells the homeowner whether permit auto-import will be available for their area.
 */

import React from "react";
import { isPermitDataAvailable } from "@/services/permitImport";
import { V2_COLORS, V2_FONTS } from "@/theme";

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
        border:        `1px solid ${available ? V2_COLORS.cobalTint : V2_COLORS.border}`,
        background:    available ? V2_COLORS.lblue : V2_COLORS.paper,
        fontFamily:    V2_FONTS.body,
        fontSize:      "0.6rem",
        letterSpacing: "0.08em",
        color:         available ? V2_COLORS.blue : V2_COLORS.muted,
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
