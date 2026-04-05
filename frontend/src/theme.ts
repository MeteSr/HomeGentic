// ─── HomeGentic Design Tokens ─────────────────────────────────────────────────────
// Single source of truth for inline-style components.
// CSS classes (index.css) use the :root custom properties.

export const COLORS = {
  plum:       "#2E2540",   // primary text / headings / CTA fill
  plumMid:    "#6B5B7B",   // muted text, secondary labels
  plumDark:   "#1E1928",   // deep emphasis
  sage:       "#7AAF76",   // success / accent / active state
  sageMid:    "#C4DCC2",   // borders on sage surfaces
  sageLight:  "#E5F0E4",   // surface tint / background cards
  blush:      "#F0CDBA",   // warm accent surface (quotes, offers)
  sky:        "#BAD5E8",   // cool accent surface (sensors, IoT)
  butter:     "#F5E9BB",   // highlight surface (warranties, milestones)
  white:      "#FDFCFA",   // page background
  rule:       "#D4CFC8",   // borders / dividers
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
