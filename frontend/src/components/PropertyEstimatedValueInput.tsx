/**
 * §17.3.4 — Property estimated home value input.
 * Persisted in localStorage keyed by propertyId.
 * Optional Zestimate integration deferred.
 */

import React, { useState, useEffect } from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

interface PropertyEstimatedValueInputProps {
  propertyId:    string;
  onValueChange?: (valueDollars: number) => void;
}

function storageKey(propertyId: string) {
  return `hf_est_val_${propertyId}`;
}

export function PropertyEstimatedValueInput({ propertyId, onValueChange }: PropertyEstimatedValueInputProps) {
  const [value, setValue] = useState("");

  // Load saved value on mount / propertyId change
  useEffect(() => {
    const saved = localStorage.getItem(storageKey(propertyId)) ?? "";
    setValue(saved);
  }, [propertyId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setValue(raw);
    localStorage.setItem(storageKey(propertyId), raw);
    const num = parseInt(raw, 10);
    if (!isNaN(num) && onValueChange) onValueChange(num);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      <label
        htmlFor={`est-val-${propertyId}`}
        style={{ fontFamily: V2_FONTS.body, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: V2_COLORS.muted }}
      >
        Estimated Home Value
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        <span style={{ fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted }}>$</span>
        <input
          id={`est-val-${propertyId}`}
          aria-label="estimated home value"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={handleChange}
          placeholder="400000"
          style={{
            padding:    "0.5rem 0.75rem",
            border:     `1px solid ${V2_COLORS.border}`,
            fontFamily: V2_FONTS.body,
            fontSize:   "0.875rem",
            outline:    "none",
            width:      "10rem",
          }}
        />
      </div>
      <div style={{ fontFamily: V2_FONTS.body, fontSize: "0.55rem", color: V2_COLORS.muted }}>
        Used to personalize your score-to-value estimate
      </div>
    </div>
  );
}

/** Read the saved estimated value for a property (dollars). Returns null if not set. */
export function getStoredEstimatedValue(propertyId: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(propertyId));
    if (!raw) return null;
    const num = parseInt(raw, 10);
    return isNaN(num) ? null : num;
  } catch {
    return null;
  }
}
