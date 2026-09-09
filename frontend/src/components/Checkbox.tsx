import React from "react";
import { V2_COLORS, V2_RADIUS } from "@/theme";

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * 20px box, 6px radius, 2px border, cobalt fill when checked. Matches the
 * checkbox already in use across the Bid to List flow, promoted here to a
 * shared primitive with its disabled state filled in.
 */
export function Checkbox({ checked, onChange, disabled, ...rest }: CheckboxProps) {
  const size = 20;
  const style: React.CSSProperties = {
    flexShrink: 0,
    width: size,
    height: size,
    borderRadius: V2_RADIUS.sm,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "not-allowed" : "pointer",
    ...(disabled
      ? { background: V2_COLORS.surface, border: `2px solid ${V2_COLORS.border}` }
      : checked
      ? { background: V2_COLORS.blue, border: `2px solid ${V2_COLORS.blue}` }
      : { background: "#FFFFFF", border: `2px solid ${V2_COLORS.divider}` }),
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      style={{ ...style, padding: 0, border: style.border, background: style.background }}
    >
      {checked && !disabled && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={V2_COLORS.paper} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 13 4.5 4.5L19 7" />
        </svg>
      )}
    </button>
  );
}
