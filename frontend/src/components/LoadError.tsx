import React from "react";
import { V2_COLORS, V2_FONTS } from "@/theme";

/**
 * Shown when data failed to load, so an outage doesn't read as a real empty
 * state ("0 devices", "No jobs"). `role="alert"` announces it to screen readers.
 * Colours follow the `.hg-v3` tokens when inside one, else the v2 palette.
 */
export function LoadError({
  what,
  onRetry,
  compact = false,
  style,
}: {
  /** What failed, lower case: "your jobs", "sensor devices". */
  what: string;
  onRetry: () => void;
  /** Inline one-liner for small panels. */
  compact?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div
      role="alert"
      data-testid="load-error"
      style={{
        display: "flex",
        flexDirection: compact ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 10 : 12,
        padding: compact ? "10px 0" : "2.5rem 1.5rem",
        textAlign: "center",
        fontFamily: V2_FONTS.body,
        ...style,
      }}
    >
      <p style={{ margin: 0, fontSize: compact ? 13 : 15, fontWeight: 600, color: `var(--hg-ink, ${V2_COLORS.ink})` }}>
        Couldn't load {what}.
        {!compact && (
          <span style={{ display: "block", marginTop: 4, fontSize: 13, fontWeight: 400, color: `var(--hg-muted, ${V2_COLORS.muted})` }}>
            Check your connection and try again.
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={onRetry}
        style={{
          fontFamily: V2_FONTS.body,
          fontSize: 13,
          fontWeight: 700,
          color: `var(--hg-ink, ${V2_COLORS.ink})`,
          background: "transparent",
          border: `1px solid var(--hg-line-2, ${V2_COLORS.border})`,
          borderRadius: 100,
          padding: compact ? "4px 12px" : "8px 18px",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
