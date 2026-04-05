// HomeGentic design tokens — ported from frontend/src/theme.ts
// Editorial blueprint aesthetic: sharp corners, warm paper tones, serif display

export const colors = {
  ink:       "#0E0E0C",   // near-black text
  paper:     "#F4F1EB",   // warm off-white background
  rule:      "#C8C3B8",   // warm gray borders
  rust:      "#C94C2E",   // primary accent (CTAs, critical urgency)
  inkLight:  "#7A7268",   // muted / secondary text
  sage:      "#4A7C59",   // success states, verification badges
  white:     "#FFFFFF",
} as const;

export const fonts = {
  serif: "PlayfairDisplay_700Bold",
  serifBlack: "PlayfairDisplay_900Black",
  mono: "IBMPlexMono_400Regular",
  monoMedium: "IBMPlexMono_500Medium",
  sans: "IBMPlexSans_300Light",
  sansRegular: "IBMPlexSans_400Regular",
  sansMedium: "IBMPlexSans_500Medium",
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
// No border-radius anywhere — sharp editorial corners
export const borderRadius = 0;
