// ─── HomeGentic Design Tokens ─────────────────────────────────────────────────────
// Single source of truth for inline-style components.
// CSS classes (index.css) use the :root custom properties.
//
// ── Migration status ──────────────────────────────────────────────────────────
// V2 (cobalt) is the target palette. All new pages must use V2_COLORS + V2_FONTS.
// COLORS / FONTS / RADIUS / SHADOWS / focusRing are legacy — kept while the
// ~25 remaining legacy pages migrate. Do not use in new code.

import type React from "react";

/** @deprecated Use V2_COLORS instead. */
export const COLORS = {
  plum:       "#2E2540",
  plumMid:    "#6B5B7B",
  plumDark:   "#1E1928",
  sage:       "#00CEC8",
  sageText:   "#007B78",
  sageMid:    "#A0EDED",
  sageLight:  "#E0FAFA",
  blush:      "#FCEFC3",
  sky:        "#BAD5E8",
  butter:     "#F5E9BB",
  white:      "#FDFCFA",
  canvas:     "#FFFFFF",
  rule:       "#D4CFC8",
  rust:       "#C94C2E",
  errorText:  "#AA3820",
  navActive:     "#C83A00",
  navActiveBg:   "#FFF3EE",
  navInactive:   "#6B7280",
} as const;

/** @deprecated Use V2_FONTS instead. */
export const FONTS = {
  serif: "'Fraunces', Georgia, serif",
  sans:  "'Plus Jakarta Sans', system-ui, sans-serif",
  mono:  "'IBM Plex Mono', 'Courier New', monospace",
} as const;

/** @deprecated Use V2_RADIUS instead. */
export const RADIUS = {
  pill: 100,
  card: 20,
  input: 10,
  sm: 8,
} as const;

/** @deprecated Use V2_SHADOWS instead. */
export const SHADOWS = {
  card:   "0 2px 12px rgba(46,37,64,0.06)",
  hover:  "0 8px 24px rgba(46,37,64,0.14)",
  modal:  "0 16px 48px rgba(46,37,64,0.18)",
} as const;

/** @deprecated Use v2FocusRing instead. */
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

// ── V2 Design System ──────────────────────────────────────────────────────────
// All new pages and components must use these tokens exclusively.
// Fonts: Bricolage Grotesque (headings) · Hanken Grotesk (body) · JetBrains Mono (labels/code)

export const V2_COLORS = {
  // ── Primary ──────────────────────────────────────────────────────────────
  blue:        "#2B34FF",   // cobalt — primary CTA, active states, links
  yellow:      "#FFD23F",   // attention / highlight
  coral:       "#FF5C39",   // error / destructive (large surfaces only)
  coralText:   "#C2341A",   // error copy — 5.1:1 on white, WCAG AA at all sizes
  // ── Neutrals ─────────────────────────────────────────────────────────────
  ink:         "#0B0D1A",   // primary text
  paper:       "#FCFCFD",   // card / popover background
  muted:       "#6B7080",   // secondary text
  muted2:      "#5A5F70",   // tertiary / disabled text
  // ── Surfaces & structure ─────────────────────────────────────────────────
  page:        "#EDEEF2",   // page background (was "border" in v1 of this token set)
  surface:     "#F7F8FB",   // subtle surface — table rows, input bg
  border:      "#E6E7EE",   // standard border / divider line
  divider:     "#D9DBE4",   // heavier divider / section break
  // ── Cobalt tints ─────────────────────────────────────────────────────────
  lblue:       "#F3F4FF",   // cobalt 4% tint — hover bg on ghost buttons
  vbadge:      "#E0E2FF",   // cobalt 12% tint — verified badge background
  cobalTint:   "#B9BDF5",   // cobalt 30% tint — badge border, focus ring glow
  // ── Semantic surfaces ─────────────────────────────────────────────────────
  attentionBg: "#FFF6DB",   // attention / info surface (yellow-family)
  // ── Bid to List additions — success/caution semantics the base V2 set lacks ─
  faint:        "#C3C7D4",   // faint text / empty state
  blueTintBg:   "#F2F3FF",   // blue tint background (advisory strips, sealed slots)
  blueTintBorder: "#C7CBFF", // blue tint border
  blueTintSurface: "#E0E2FF", // blue tint surface (shortlisted rows)
  blueDeepText: "#1F2794",   // blue deep text (on blue tint bg)
  neutralRowTint: "#FAFAFF", // shortlisted row tint
  green:        "#0F7A48",   // success — highest net, verified, checks
  greenBg:      "#E4F6EC",   // green background
  greenBright:  "#7BE3A8",   // green, bright (on dark surfaces)
  greenRowTint: "#F7FDF9",   // green row tint
  orange:       "#C4552F",   // caution — over-comp flag, thin comps, open permit
  orangeBg:     "#FBE7DF",   // orange background
  orangeBorder: "#E8B49B",   // orange border
  orangeRowTint: "#FFFBF9",  // orange row tint
  amberBg:      "#FFF9EC",   // amber warning background (disclosure, photo scan notice)
  amberBorder:  "#F0DFA8",   // amber warning border
  amberText:    "#5F4A0C",   // amber warning text
  neutralSurface: "#F2F3F9", // neutral card surface
  neutralSurface2: "#F7F8FB", // neutral card surface, lighter
  neutralSurface3: "#EDEEF4", // neutral card surface, filled tile
  cardBorder:   "#D6D9E4",   // card border
  buttonBorder: "#D9DBE4",   // outline button border
} as const;

export const V2_FONTS = {
  display: "'Bricolage Grotesque', system-ui, sans-serif",
  body:    "'Hanken Grotesk', sans-serif",
  mono:    "'JetBrains Mono', monospace",
} as const;

export const V2_RADIUS = {
  pill:  100,   // buttons, pills
  card:   16,   // cards / panels
  input:  10,   // form inputs
  sm:      6,   // tags, small elements
} as const;

export const V2_SHADOWS = {
  card:  "0 2px 12px rgba(11,13,26,0.06)",
  hover: "0 8px 24px rgba(11,13,26,0.12)",
  modal: "0 16px 48px rgba(11,13,26,0.16)",
} as const;

/** Cobalt focus ring — 4.5:1 on V2_COLORS.page and V2_COLORS.paper. */
export const v2FocusRing = "2px solid #2B34FF";
