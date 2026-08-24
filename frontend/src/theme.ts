// ─── HomeGentic Design Tokens ─────────────────────────────────────────────────────
// Single source of truth for inline-style components.
// CSS classes (index.css) use the :root custom properties.

import type React from "react";

export const COLORS = {
  plum:       "#2E2540",   // primary text / headings / CTA fill
  plumMid:    "#6B5B7B",   // muted text, secondary labels
  plumDark:   "#1E1928",   // deep emphasis
  sage:       "#00CEC8",   // success / accent / active state (backgrounds + borders only)
  sageText:   "#007B78",   // sage-family text — passes WCAG AA on white
  sageMid:    "#A0EDED",   // borders on sage surfaces
  sageLight:  "#E0FAFA",   // surface tint / background cards
  blush:      "#FCEFC3",   // warm accent surface (quotes, offers)
  sky:        "#BAD5E8",   // cool accent surface (sensors, IoT)
  butter:     "#F5E9BB",   // highlight surface (warranties, milestones)
  white:      "#FDFCFA",   // warm off-white (cards, popovers)
  canvas:     "#FFFFFF",   // pure white — sidebar, main content area
  rule:       "#D4CFC8",   // borders / dividers
  rust:       "#C94C2E",   // error / destructive states — use as accent/border only
  errorText:  "#AA3820",   // error text — 6.4:1 on white, passes WCAG AA at small sizes
  // ── Nav / sidebar active state ────────────────────────────────────────────
  navActive:     "#C83A00",   // active nav text, icon, border — 5.2:1 on white, 4.8:1 on navActiveBg
  navActiveBg:   "#FFF3EE",   // active nav item background
  navInactive:   "#6B7280",   // inactive nav text and icons
} as const;

export const FONTS = {
  serif: "'Fraunces', Georgia, serif",         // headings (700 / 900)
  sans:  "'Plus Jakarta Sans', system-ui, sans-serif",  // body (300–700)
  mono:  "'IBM Plex Mono', 'Courier New', monospace",   // labels / data values
} as const;

export const RADIUS = {
  pill: 100,   // buttons
  card: 20,    // cards / panels
  input: 10,   // form inputs
  sm: 8,       // small elements
} as const;

export const SHADOWS = {
  card:   "0 2px 12px rgba(46,37,64,0.06)",
  hover:  "0 8px 24px rgba(46,37,64,0.14)",
  modal:  "0 16px 48px rgba(46,37,64,0.18)",
} as const;

// ── Accessibility ─────────────────────────────────────────────────────────────

/** Visible focus ring — 4.5:1 contrast against all app backgrounds. */
export const focusRing = "2px solid #C94C2E";

/** Visually hidden but announced by screen readers (WCAG 1.3.1 / 4.1.2). */
export const srOnly: React.CSSProperties = {
  position:   "absolute",
  width:       1,
  height:      1,
  padding:     0,
  margin:     -1,
  overflow:   "hidden",
  clip:       "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border:      0,
};

// ── Verify v2 / Landing design tokens ─────────────────────────────────────────
// Used by PropertyVerify pages and the public landing page.
export const V2_COLORS = {
  blue:   "#2B34FF",
  yellow: "#FFD23F",
  coral:  "#FF5C39",
  ink:    "#0B0D1A",
  paper:  "#FCFCFD",
  muted:  "#6B7080",
  muted2: "#5A5F70",
  border: "#EDEEF2",
  lblue:  "#F3F4FF",
  vbadge: "#E0E2FF",
} as const;

export const V2_FONTS = {
  display: "'Bricolage Grotesque', system-ui, sans-serif",
  body:    "'Hanken Grotesk', sans-serif",
  mono:    "'JetBrains Mono', monospace",
} as const;
