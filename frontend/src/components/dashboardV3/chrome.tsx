/**
 * Shared v3 app chrome — the brand mark and left-rail chip styles used by both
 * the dashboard (DashboardV3) and every other page's shell (Layout), so the two
 * can't drift apart visually.
 */
import React from "react";
import "./dashboardV3.css";

/** Width of the left rail's chip column, and the page gutter / rail gap around it. */
export const RAIL_WIDTH  = 158;
export const SHELL_GUTTER = 24;
export const RAIL_GAP     = 22;

const MONO = "'JetBrains Mono',monospace";

/** "HomeGentic  HOME" — the header brand mark. */
export function BrandMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{ font: "800 15px/1 'Bricolage Grotesque',system-ui,sans-serif", color: "var(--hg-ink)", letterSpacing: "-.02em" }}>HomeGentic</div>
      <div style={{ font: `500 9px/1 ${MONO}`, letterSpacing: ".14em", color: "var(--hg-muted)" }}>HOME</div>
    </div>
  );
}

/** The thin vertical divider between header groups. */
export function HeaderDivider() {
  return <div style={{ width: 1, height: 16, background: "var(--hg-line)", flex: "none" }} />;
}

/**
 * A left-rail chip. `on` is the current destination; `dashed` marks a chip that
 * leaves the current surface or is locked (an upsell, or an action like Add
 * property) rather than a peer destination.
 */
export function railChipStyle({ on = false, dashed = false }: { on?: boolean; dashed?: boolean } = {}): React.CSSProperties {
  return {
    minHeight: 31, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between",
    gap: 8, padding: "0 12px", borderRadius: 100,
    background: dashed ? "transparent" : on ? "var(--hg-blue-fill)" : "var(--hg-fill)",
    border: dashed ? "1.5px dashed var(--hg-line-2)" : `1.5px solid ${on ? "#2B34FF" : "var(--hg-line-2)"}`,
    font: `500 10.5px/1 ${MONO}`, letterSpacing: ".06em", textTransform: "uppercase",
    color: dashed ? "var(--hg-muted)" : on ? "var(--hg-chip-on)" : "var(--hg-ink-3)",
    cursor: "pointer", textDecoration: "none",
  };
}

/** Right-aligned count or tag inside a rail chip. */
export function RailChipCount({ children }: { children: React.ReactNode }) {
  return <span style={{ font: `400 10px/1 ${MONO}`, color: "var(--hg-muted)", textTransform: "none" }}>{children}</span>;
}
