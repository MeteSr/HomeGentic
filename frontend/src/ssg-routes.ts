/**
 * SSG_ROUTES — static route manifest for build-time pre-rendering (SEO.2).
 *
 * Only includes public, static routes that can be rendered without
 * authenticated user data or dynamic path parameters.
 * Dynamic routes (/for-sale/:id, /contractor/:id, /agent/:id, /cert/:token, …)
 * are served as the SPA shell — crawlers hit the catch-all /index.html fallback.
 */
export const SSG_ROUTES: string[] = [
  "/",
  "/pricing",
  "/privacy",
  "/support",
  "/check",
  "/sell",
  "/instant-forecast",
  "/home-systems",
  "/prices",
  "/login",
];
