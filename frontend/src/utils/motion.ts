/**
 * CSS can't reach `scrollIntoView({ behavior: "smooth" })`, so script-driven
 * scrolling checks the OS "reduce motion" setting here (WCAG 2.3.3).
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** "smooth", or "auto" (an instant jump) when the user asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
