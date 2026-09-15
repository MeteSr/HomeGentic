/**
 * DashboardV3 — scoped design tokens.
 *
 * The v3 dashboard mockup ("HomeGentic Dashboard v3 left nav") runs a dark,
 * cobalt/yellow "HUD" palette with its own light mode — a deliberate
 * departure from the rest of the app's single light V2_COLORS palette. It is
 * scoped entirely to `.hg-v3` (via CSS custom properties) rather than
 * touching theme.ts, so the rest of the app is unaffected.
 *
 * Colors mirror the shipped mockup 1:1 (see the design handoff bundle,
 * `HomeGentic Dashboard v3 left nav.dc.html`).
 */
import "./dashboardV3.css";

export const HG_EASE = "cubic-bezier(.2,.8,.2,1)";
export const HG_RISE = ["hgRiseA", "hgRiseB"];
export const HG_BAR = ["hgBarA", "hgBarB"];
