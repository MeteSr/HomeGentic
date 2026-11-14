import React from "react";
import { V2_COLORS, V2_FONTS, V2_RADIUS } from "@/theme";

/** A labelled on/off switch row, as the Settings tabs use. */
export function ToggleRow({
  label,
  desc,
  value,
  onChange,
  last = false,
  disabled = false,
  children,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "0.875rem 0", borderBottom: last ? "none" : `1px solid ${V2_COLORS.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        <div>
          <p style={{ fontFamily: V2_FONTS.body, fontSize: "0.9375rem", fontWeight: 500, color: V2_COLORS.ink }}>
            {label}
          </p>
          {desc && (
            <p
              style={{
                fontFamily: V2_FONTS.body,
                fontSize: "0.8125rem",
                color: V2_COLORS.muted,
                marginTop: "0.125rem",
              }}
            >
              {desc}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={value}
          aria-label={label}
          disabled={disabled}
          onClick={() => onChange(!value)}
          style={{
            width: "2.5rem",
            height: "1.25rem",
            background: value ? V2_COLORS.blue : V2_COLORS.border,
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.5 : 1,
            position: "relative",
            flexShrink: 0,
            borderRadius: V2_RADIUS.pill,
            border: "none",
            padding: 0,
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "0.125rem",
              left: value ? "1.375rem" : "0.125rem",
              width: "1rem",
              height: "1rem",
              background: V2_COLORS.paper,
              transition: "left 0.15s",
              borderRadius: "50%",
            }}
          />
        </button>
      </div>
      {children}
    </div>
  );
}
