/**
 * Shared HUD-theme primitives.
 *
 * Reuses the exact .hg-v3 CSS custom properties DashboardV3 defines
 * (components/dashboardV3/dashboardV3.css) rather than a second token
 * system, so every page built with these stays visually identical to
 * the dashboard the theme originated from. Originally colocated with
 * PropertyDetailPage's tabs; promoted here once a second page (Market)
 * needed the same Panel/Pill/button/input patterns.
 */
import React from "react";
import "@/components/dashboardV3/dashboardV3.css";

export const HG_EASE = "cubic-bezier(.2,.8,.2,1)";

// ── Panel (Card replacement) ────────────────────────────────────────────────

export function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "var(--hg-surface)",
        border: "1px solid var(--hg-line)",
        borderRadius: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── SectionHeader ────────────────────────────────────────────────────────────

export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ font: "700 .9375rem/1.3 'Hanken Grotesk',sans-serif", color: "var(--hg-ink)" }}>{title}</div>
      {sub && (
        <div style={{ font: "400 .8125rem/1.4 'Hanken Grotesk',sans-serif", color: "var(--hg-muted)", marginTop: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Pill (Badge replacement — Badge.tsx has no style-override prop) ─────────

export type PillTone = "good" | "bad" | "warn" | "info" | "neutral";

const PILL_TONE_STYLES: Record<PillTone, React.CSSProperties> = {
  good:    { background: "var(--hg-good-wash)",   color: "var(--hg-good)",     border: "1px solid var(--hg-good-edge)" },
  bad:     { background: "rgba(255,92,57,0.14)",  color: "var(--hg-bad)",      border: "1px solid rgba(255,92,57,0.4)" },
  warn:    { background: "var(--hg-yel-wash)",    color: "var(--hg-yel-ink)",  border: "1px solid var(--hg-yel-edge)" },
  info:    { background: "var(--hg-blue-wash)",   color: "var(--hg-blue-ink)", border: "1px solid var(--hg-blue-edge)" },
  neutral: { background: "var(--hg-fill)",        color: "var(--hg-muted)",    border: "1px solid var(--hg-line-2)" },
};

export function Pill({ tone = "neutral", children }: { tone?: PillTone; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "'JetBrains Mono',monospace",
        fontWeight: 500,
        fontSize: "0.65rem",
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        borderRadius: 100,
        padding: "0.2rem 0.625rem",
        whiteSpace: "nowrap",
        ...PILL_TONE_STYLES[tone],
      }}
    >
      {children}
    </span>
  );
}

// ── hudButtonStyle — overrides for the shared <Button style={...}> prop ─────

export type HudButtonVariant = "primary" | "outline" | "ghost" | "danger";

export function hudButtonStyle(variant: HudButtonVariant = "primary"): React.CSSProperties {
  switch (variant) {
    case "primary":
      return { backgroundColor: "var(--hg-blue)", color: "#FCFCFD", borderColor: "var(--hg-blue)" };
    case "outline":
      return { backgroundColor: "transparent", color: "var(--hg-blue-ink)", borderColor: "var(--hg-blue-edge)" };
    case "ghost":
      return { backgroundColor: "transparent", color: "var(--hg-muted)", borderColor: "var(--hg-line-2)" };
    case "danger":
      return { backgroundColor: "var(--hg-bad)", color: "#FCFCFD", borderColor: "var(--hg-bad)" };
  }
}

// ── hudInputStyle — shared style for hand-styled inputs/selects/textareas ───

export const hudInputStyle: React.CSSProperties = {
  fontFamily: "'Hanken Grotesk',sans-serif",
  fontSize: "0.875rem",
  color: "var(--hg-ink)",
  background: "var(--hg-fill)",
  border: "1.5px solid var(--hg-line-2)",
  borderRadius: 10,
  padding: "0.55rem 0.75rem",
};

// ── spinnerVars — locally rescopes the .spinner-lg element's global
// --v2-border/--v2-blue custom properties (meant for a white background)
// to their hg-v3 equivalents. CSS custom properties cascade downward
// only, so this is scoped to the wrapped subtree. ─────────────────────────

export const spinnerVars: React.CSSProperties = {
  ["--v2-border" as any]: "var(--hg-line-2)",
  ["--v2-blue" as any]: "var(--hg-blue)",
};
