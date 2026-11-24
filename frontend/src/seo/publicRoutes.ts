/**
 * The public, indexable pages: the one list behind each page's <head> tags
 * (RouteHead), the per-route HTML written at build time (scripts/prerender.mjs)
 * and sitemap.xml (scripts/gen-sitemap.mjs).
 *
 * Node imports this file directly at build time (type stripping), so keep it
 * to erasable TypeScript: type annotations only, no enums, no imports.
 *
 * Leave out pages that are no use in search: sign-in, checkout and payment
 * results, gift redemption, private token links (those are noindex), and
 * anything behind ProtectedRoute.
 */

export const SITE_ORIGIN = "https://homegentic.app";

/** The share image for every page that has no picture of its own (1200×630). */
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/og-default.png`;

export interface PublicRoute {
  path: string;
  /** <title>, og:title and twitter:title. */
  title: string;
  /** meta description, og:description and twitter:description. */
  description: string;
}

export const PUBLIC_ROUTES: PublicRoute[] = [
  {
    path: "/",
    title: "HomeGentic™ — Your house keeps receipts.",
    description:
      "HomeGentic keeps every repair in one verified record, signed by the contractor who did the work and stored where nobody can edit it.",
  },
  {
    path: "/pricing",
    title: "Pricing — HomeGentic",
    description:
      "HomeGentic is free for one home. Pro is $59 a year for up to 20 homes, more photos and documents, and unlimited quote requests. Plans for contractors too.",
  },
  {
    path: "/for-pros",
    title: "For Contractors — Join the HomeGentic Network",
    description:
      "Contractors: grow your business with HomeGentic. Get leads from verified homeowners, auto-log completed work, and build a trusted profile.",
  },
  {
    path: "/homes",
    title: "FSBO Homes for Sale — Verified Listings with HomeGentic Scores",
    description:
      "Browse homes for sale by owner with verified maintenance histories, HomeGentic scores, and transparent system ages.",
  },
  {
    path: "/sell",
    title: "Sell your home with Bid to List | HomeGentic",
    description:
      "Verified agents bid for your listing with their commission and marketing plan. Agents set their own terms, and you choose.",
  },
  {
    path: "/check",
    title: "Check Address | HomeGentic™",
    description:
      "Verify a property's HomeGentic maintenance report. Search by address to see if a verified home history is available.",
  },
  {
    path: "/instant-forecast",
    title: "Instant Maintenance Forecast | HomeGentic",
    description:
      "Get a free instant forecast of your home's upcoming maintenance costs. Enter your address and year built — no login required.",
  },
  {
    path: "/home-systems",
    title: "Home System Age Estimator | HomeGentic",
    description:
      "Enter your home's year built to see estimated ages and urgency for the roof, HVAC, water heater and other major systems. No account needed.",
  },
  {
    path: "/prices",
    title: "Home repair cost lookup | HomeGentic",
    description:
      "See what a home repair usually costs before you hire: prices from finished jobs nearby owners chose to share, or the typical U.S. range.",
  },
  {
    path: "/sample-report",
    title: "Sample Property Report — HomeGentic",
    description:
      "See what a HomeGentic verified property report looks like — score, job history, contractor signatures, and a shareable link.",
  },
  {
    path: "/truth-kit",
    title: "Buyer's Truth Kit — Know What You're Actually Buying",
    description:
      "Enter any home address and seller claims. Get a personalized due-diligence kit: permit records, red flags, questions to ask, and documents to request.",
  },
  {
    path: "/demo",
    title: "See HomeGentic in Action — Interactive Demo",
    description: "Explore HomeGentic features for homeowners, contractors, realtors, and property managers.",
  },
  {
    path: "/gift",
    title: "Gift a HomeGentic Subscription",
    description:
      "Give the gift of a verified home. Gift a HomeGentic Pro subscription to a buyer, client, or homeowner you care about.",
  },
  {
    path: "/verify-record",
    title: "Check a signed record | HomeGentic™",
    description: "Check that a HomeGentic report or score certificate is exactly what HomeGentic issued.",
  },
  {
    path: "/faq",
    title: "FAQ — HomeGentic",
    description:
      "Answers to common questions about HomeGentic's verified home maintenance records, who owns your data, subscription plans, and more.",
  },
  {
    path: "/support",
    title: "Support — HomeGentic",
    description:
      "Get help with HomeGentic: billing, cancellation, Internet Identity, sharing reports, and more. Find answers or contact our support team.",
  },
  {
    path: "/privacy",
    title: "Privacy Policy — HomeGentic",
    description:
      "HomeGentic's Privacy Policy: what we collect, who we share it with, how long we keep it, and how to export or delete your data.",
  },
  {
    path: "/terms",
    title: "Terms of Service — HomeGentic",
    description:
      "HomeGentic's Terms of Service: acceptable use, subscriptions, billing, AI disclaimers, and your legal rights.",
  },
];

/** The absolute URL a page should be indexed under (no query or hash). */
export function canonicalUrl(path: string): string {
  return path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${path.replace(/\/+$/, "")}`;
}

export function publicRoute(path: string): PublicRoute {
  const route = PUBLIC_ROUTES.find((r) => r.path === path);
  if (!route) throw new Error(`${path} is not in PUBLIC_ROUTES (src/seo/publicRoutes.ts)`);
  return route;
}
