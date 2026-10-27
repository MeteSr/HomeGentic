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
 * shared primitive with its disabled state filled in. The button itself is
 * 28px (WCAG 2.5.8 asks for 24px) with a negative margin, so the bigger hit
 * area doesn't change layout.
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

  const hit = 28;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); if (!disabled) onChange(!checked); }}
      style={{
        flexShrink: 0, width: hit, height: hit, margin: (size - hit) / 2, padding: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "none", border: "none", borderRadius: V2_RADIUS.sm,
        cursor: style.cursor,
      }}
    >
      <span aria-hidden="true" style={style}>
        {checked && !disabled && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={V2_COLORS.paper} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 13 4.5 4.5L19 7" />
          </svg>
        )}
      </span>
    </button>
  );
}
