import { useEffect, useRef, useState } from "react";
import { matchPath, useLocation, useNavigationType } from "react-router-dom";

/**
 * Single-page navigation doesn't reload the document, so on its own a route
 * change keeps the old <title>, leaves focus on the link that was clicked
 * (often now gone), and tells screen-reader users nothing (WCAG 2.4.2, 2.4.3,
 * 4.1.3). On every pathname change after the first this:
 *  - sets a per-route title (a page's own <PageHead> still wins, it runs later);
 *  - moves focus to the new page's <h1> once it has rendered, unless the page
 *    already put focus somewhere itself (screen readers read the focused heading);
 *  - otherwise announces the new title in a polite live region.
 * Redirects (replace navigations) only update the title: they happen before
 * the user has seen the page they asked for.
 */

const SUFFIX = " | HomeGentic";
const DEFAULT_TITLE = typeof document !== "undefined" ? document.title : "HomeGentic";

// First match wins, so specific patterns come before their parents.
const ROUTE_TITLES: [pattern: string, title: string][] = [
  ["/login", "Sign in"],
  ["/pricing", "Pricing"],
  ["/privacy", "Privacy Policy"],
  ["/terms", "Terms of Service"],
  ["/support", "Support"],
  ["/faq", "FAQ"],
  ["/gift", "Gift HomeGentic"],
  ["/for-pros", "For contractors"],
  ["/payment-success", "Payment complete"],
  ["/payment-failure", "Payment failed"],
  ["/checkout", "Checkout"],
  ["/plans", "Plans"],
  ["/homes", "Homes for sale"],
  ["/my-listing/:propertyId", "My listing"],
  ["/for-sale/:propertyId", "Home for sale"],
  ["/transfer/claim/:token", "Claim a home"],
  ["/manage/claim/:token", "Accept manager invite"],
  ["/register", "Create your account"],
  ["/dashboard", "Dashboard"],
  ["/contractor-dashboard", "Contractor dashboard"],
  ["/contractors", "Find contractors"],
  ["/contractor/profile", "Contractor profile"],
  ["/contractor/:id", "Contractor"],
  ["/properties/:id/verify/*", "Verify ownership"],
  ["/properties/:id/systems", "System ages"],
  ["/properties/:id", "Property"],
  ["/jobs/new", "Post a job"],
  ["/jobs", "Jobs"],
  ["/quotes/new", "Request a quote"],
  ["/quotes/:id", "Quote request"],
  ["/settings", "Settings"],
  ["/refer", "Refer a friend"],
  ["/market", "Market intelligence"],
  ["/maintenance", "Maintenance"],
  ["/admin", "Admin"],
  ["/sensors", "Sensors"],
  ["/warranties", "Warranty wallet"],
  ["/insurance-defense", "Insurance defense"],
  ["/resale-ready", "Resale ready"],
  ["/recurring/new", "Add a recurring service"],
  ["/recurring/:id", "Recurring service"],
  ["/people", "People"],
  ["/listing/new", "List your home"],
  ["/listing/:id", "Listing"],
  ["/agents/verify", "Agent verification"],
  ["/agents/browse", "Homes taking bids"],
  ["/agents/listings/:id/bid", "Submit a bid"],
  ["/agents/bids/:id", "Bid"],
  ["/agents/bids", "My bids"],
  ["/demo/*", "Demo"],
  ["/truth-kit", "Buyer's Truth Kit"],
  ["/sample-report", "Sample report"],
  ["/home-systems", "Home systems estimator"],
  ["/check", "Check an address"],
  ["/prices", "Price lookup"],
  ["/instant-forecast", "Instant forecast"],
  ["/verify/:token", "Verify a job"],
  ["/report/:token", "Home report"],
  ["/badge/:token", "HomeGentic badge"],
  ["/cert/:token", "Score certificate"],
];

export function titleForPath(pathname: string): string {
  const hit = ROUTE_TITLES.find(([pattern]) => matchPath({ path: pattern, end: true }, pathname));
  return hit ? hit[1] + SUFFIX : DEFAULT_TITLE;
}

export function RouteAnnouncer() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const [message, setMessage] = useState("");
  const first = useRef(true);

  useEffect(() => {
    document.title = titleForPath(pathname);
    if (first.current) { first.current = false; return; }
    if (navType === "REPLACE") return;
    setMessage("");

    window.scrollTo(0, 0);
    const startFocus = document.activeElement;
    let tries = 0;
    let timer: number;
    // Lazy pages render after a Suspense fallback, so wait for the <h1>.
    const settle = () => {
      const pageMovedFocus = document.activeElement !== startFocus && document.activeElement !== document.body;
      const h1 = document.querySelector<HTMLElement>("main h1, h1");
      if (!pageMovedFocus && !h1 && ++tries < 20) { timer = window.setTimeout(settle, 100); return; }
      if (!pageMovedFocus && h1) {
        if (!h1.hasAttribute("tabindex")) h1.setAttribute("tabindex", "-1");
        h1.focus({ preventScroll: true });
        return;
      }
      setMessage(document.title);
    };
    timer = window.setTimeout(settle, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="route-announcer">
      {message}
    </div>
  );
}
