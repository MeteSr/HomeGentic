// HomeGentic mobile design tokens — v3 (cobalt + yellow on cool neutrals).
// Matches the web app's V2_COLORS / V2_FONTS (frontend/src/theme.ts) and the
// "HomeGentic Mobile v3" design.

import type { TextStyle } from "react-native";

export const v3 = {
  bg:         "#EDEEF2",   // app background
  surface:    "#FFFFFF",   // cards
  paper:      "#FCFCFD",   // tab bar, sheets, text on dark
  field:      "#F7F8FB",   // inset panels, inputs
  line:       "#E6E7EE",   // card borders
  lineSoft:   "#F0F1F5",   // row dividers, neutral icon tiles
  chipLine:   "#D9DBE4",   // outlined chips and secondary buttons
  ink:        "#0B0D1A",
  muted:      "#6B7080",
  blue:       "#2B34FF",
  blueTint:   "#E0E2FF",
  blueLine:   "#B9BDF5",
  yellow:     "#FFD23F",
  yellowTint: "#FFF6DB",
  red:        "#C23F1F",
  redTint:    "#FFF0EC",
  redLine:    "#F3C7BC",
  scrim:      "rgba(11,13,26,0.42)",
  paperDim:   "rgba(252,252,253,0.72)",
} as const;

/** Font family names registered by App.tsx via @expo-google-fonts. */
export const family = {
  display:     "BricolageGrotesque_800ExtraBold",
  displayBold: "BricolageGrotesque_700Bold",
  body:        "HankenGrotesk_400Regular",
  bodyMedium:  "HankenGrotesk_500Medium",
  bodySemi:    "HankenGrotesk_600SemiBold",
  mono:        "JetBrainsMono_400Regular",
  monoMedium:  "JetBrainsMono_500Medium",
  monoBold:    "JetBrainsMono_700Bold",
} as const;

/**
 * Text styles from the design. CSS `letter-spacing: .14em` on 9px is 1.26px;
 * line heights are the CSS multipliers times the font size.
 */
export const type = {
  kicker:    { fontFamily: family.monoMedium, fontSize: 9, lineHeight: 11, letterSpacing: 1.26, color: v3.muted },
  chip:      { fontFamily: family.monoMedium, fontSize: 9, lineHeight: 11, letterSpacing: 0.9 },
  meta:      { fontFamily: family.mono, fontSize: 11.5, lineHeight: 16, color: v3.muted },
  pageTitle: { fontFamily: family.display, fontSize: 27, lineHeight: 30, letterSpacing: -0.81, color: v3.ink },
  cardTitle: { fontFamily: family.displayBold, fontSize: 17, lineHeight: 20.5, letterSpacing: -0.34, color: v3.ink },
  rowTitle:  { fontFamily: family.bodySemi, fontSize: 14.5, lineHeight: 19, color: v3.ink },
  body:      { fontFamily: family.body, fontSize: 12.5, lineHeight: 19, color: v3.muted },
  button:    { fontFamily: family.bodySemi, fontSize: 13 },
} satisfies Record<string, TextStyle>;

export const radius = { card: 22, tile: 18, inset: 16, sheet: 26, pill: 100 } as const;

export const shadow = {
  shadowColor:   v3.ink,
  shadowOpacity: 0.06,
  shadowRadius:  12,
  shadowOffset:  { width: 0, height: 2 },
  elevation:     2,
} as const;

// ── Legacy names ─────────────────────────────────────────────────────────────
// Screens written for the old paper/rust theme still import these. They now
// resolve to the v3 palette so every screen picks up the new look.

export const colors = {
  ink:      v3.ink,
  paper:    v3.paper,
  rule:     v3.chipLine,
  rust:     v3.blue,
  inkLight: v3.muted,
  sage:     v3.blue,
  white:    "#FFFFFF",
} as const;

export const fonts = {
  serif:       family.displayBold,
  serifBlack:  family.display,
  mono:        family.mono,
  monoMedium:  family.monoMedium,
  sans:        family.body,
  sansRegular: family.body,
  sansMedium:  family.bodySemi,
} as const;

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const borderWidth = 1;
export const borderRadius = 12;
