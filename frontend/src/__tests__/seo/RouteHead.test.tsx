/**
 * SEO — RouteHead and DefaultCanonical.
 *
 * RouteHead gives a public page its title, description, canonical, Open Graph
 * and Twitter tags from PUBLIC_ROUTES, the same list the build writes into the
 * page's HTML. DefaultCanonical gives every other page a canonical on
 * homegentic.app, so copies served from the canister's icp0.io address aren't
 * indexed as duplicates. Private token links get none (they are noindex).
 */
import { render, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, afterEach } from "vitest";
import type { ReactNode } from "react";
import { RouteHead, DefaultCanonical } from "@/components/RouteHead";
import { publicRoute } from "@/seo/publicRoutes";

const attr = (sel: string, name = "content") => document.head.querySelector(sel)?.getAttribute(name) ?? null;
const canonical = () => attr('link[rel="canonical"]', "href");

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  document.title = "";
});

describe("RouteHead", () => {
  it("sets every tag from the route's entry", () => {
    const r = publicRoute("/pricing");
    render(<RouteHead path="/pricing" />);
    expect(document.title).toBe(r.title);
    expect(attr('meta[name="description"]')).toBe(r.description);
    expect(canonical()).toBe("https://homegentic.app/pricing");
    expect(attr('meta[property="og:title"]')).toBe(r.title);
    expect(attr('meta[property="og:description"]')).toBe(r.description);
    expect(attr('meta[property="og:url"]')).toBe("https://homegentic.app/pricing");
    expect(attr('meta[property="og:type"]')).toBe("website");
    expect(attr('meta[property="og:image"]')).toBe("https://homegentic.app/og-default.png");
    expect(attr('meta[name="twitter:title"]')).toBe(r.title);
    expect(attr('meta[name="twitter:description"]')).toBe(r.description);
    expect(attr('meta[name="twitter:image"]')).toBe("https://homegentic.app/og-default.png");
  });

  it("lets a page override the title and description for what it is showing", () => {
    render(
      <RouteHead
        path="/check"
        title="Check Address — 1 Main St | HomeGentic™"
        description="A longer description of this one address."
      />,
    );
    expect(document.title).toBe("Check Address — 1 Main St | HomeGentic™");
    expect(attr('meta[property="og:title"]')).toBe("Check Address — 1 Main St | HomeGentic™");
    expect(attr('meta[name="description"]')).toBe("A longer description of this one address.");
    expect(canonical()).toBe("https://homegentic.app/check");
  });

  it("adds extra tags passed as children, such as JSON-LD", () => {
    render(
      <RouteHead path="/faq">
        <script type="application/ld+json">{JSON.stringify({ "@type": "FAQPage" })}</script>
      </RouteHead>,
    );
    expect(document.head.querySelector('script[type="application/ld+json"]')?.textContent).toContain("FAQPage");
  });

  it("refuses a path that isn't in PUBLIC_ROUTES", () => {
    expect(() => render(<RouteHead path="/dashboard" />)).toThrow(/PUBLIC_ROUTES/);
  });
});

describe("DefaultCanonical", () => {
  function at(path: string, page?: ReactNode) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <DefaultCanonical />
        <Routes>
          <Route path="*" element={page ?? null} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("points at the same path on homegentic.app, without the query string", () => {
    at("/for-sale/prop-1?ref=share");
    expect(canonical()).toBe("https://homegentic.app/for-sale/prop-1");
  });

  it("is overridden by a page's own canonical", () => {
    at("/demo/homeowner", <RouteHead path="/demo" />);
    expect(canonical()).toBe("https://homegentic.app/demo");
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  });

  it("adds none on a private token link, which is noindex", () => {
    at("/report/tok-1");
    expect(canonical()).toBeNull();
  });
});
