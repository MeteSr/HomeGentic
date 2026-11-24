/**
 * SEO — the one list of public, indexable pages (src/seo/publicRoutes.ts).
 *
 * It drives each page's <head> tags (RouteHead), the per-route HTML written
 * at build time (scripts/prerender.mjs) and sitemap.xml, so it must name
 * every public marketing page, none that sign-in hides, and each page in it
 * must take its tags from it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { PUBLIC_ROUTES, SITE_ORIGIN, DEFAULT_OG_IMAGE, canonicalUrl, publicRoute } from "@/seo/publicRoutes";

const FRONTEND = resolve(__dirname, "../../..");
const APP = readFileSync(resolve(FRONTEND, "src/App.tsx"), "utf8");
const paths = PUBLIC_ROUTES.map((r) => r.path);

describe("PUBLIC_ROUTES", () => {
  it.each([
    "/",
    "/pricing",
    "/for-pros",
    "/homes",
    "/sell",
    "/check",
    "/instant-forecast",
    "/home-systems",
    "/prices",
    "/sample-report",
    "/truth-kit",
    "/demo",
    "/gift",
    "/verify-record",
    "/faq",
    "/support",
    "/privacy",
    "/terms",
  ])("lists %s", (path) => {
    expect(paths).toContain(path);
  });

  it.each(["/login", "/register", "/checkout", "/payment-success", "/gift/redeem", "/mobile-auth", "/dashboard"])(
    "leaves out %s, which is no use in search",
    (path) => {
      expect(paths).not.toContain(path);
    },
  );

  it("has no duplicate paths or titles", () => {
    expect(new Set(paths).size).toBe(paths.length);
    const titles = PUBLIC_ROUTES.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("gives every page a title that fits a search result and a real description", () => {
    for (const r of PUBLIC_ROUTES) {
      expect(r.title.length, r.path).toBeGreaterThan(0);
      expect(r.title.length, r.path).toBeLessThanOrEqual(70);
      expect(r.description.length, r.path).toBeGreaterThanOrEqual(50);
      expect(r.description.length, r.path).toBeLessThanOrEqual(170);
    }
  });

  it("lists only routes App.tsx serves without sign-in", () => {
    for (const path of paths) {
      const line = APP.split("\n").find((l) => l.includes(`path="${path}"`));
      expect(line, `${path} is not a route in App.tsx`).toBeDefined();
      expect(line, `${path} is behind sign-in`).not.toMatch(/ProtectedRoute|RealtorRoute|PaidHomeownerRoute|Navigate/);
    }
  });

  it("names no stale plan prices (only Free and Pro $59/year exist)", () => {
    const text = JSON.stringify(PUBLIC_ROUTES);
    expect(text).not.toMatch(/\$(10|20|40)\b/);
    expect(text).not.toMatch(/Premium|Basic plan/);
  });
});

describe("canonicalUrl", () => {
  it("is the production origin plus the path, with no trailing slash", () => {
    expect(canonicalUrl("/")).toBe(`${SITE_ORIGIN}/`);
    expect(canonicalUrl("/pricing")).toBe("https://homegentic.app/pricing");
    expect(canonicalUrl("/pricing/")).toBe("https://homegentic.app/pricing");
  });
});

describe("publicRoute", () => {
  it("returns the entry for a listed path and throws for an unlisted one", () => {
    expect(publicRoute("/pricing").title).toMatch(/Pricing/);
    expect(() => publicRoute("/dashboard")).toThrow(/PUBLIC_ROUTES/);
  });
});

describe("DEFAULT_OG_IMAGE", () => {
  it("points at a file in public/", () => {
    expect(DEFAULT_OG_IMAGE.startsWith(SITE_ORIGIN)).toBe(true);
    expect(existsSync(resolve(FRONTEND, "public", DEFAULT_OG_IMAGE.slice(SITE_ORIGIN.length + 1)))).toBe(true);
  });
});

// Each listed page renders <RouteHead path="..."> so the tags a browser sets
// match the tags written into that page's HTML at build time.
describe("every listed page uses RouteHead for its own path", () => {
  it.each(paths)("%s", (path) => {
    const line = APP.split("\n").find((l) => l.includes(`path="${path}"`))!;
    const component = line.match(/element=\{<(\w+)/)![1];
    const src = readFileSync(resolve(FRONTEND, "src/pages", `${component}.tsx`), "utf8");
    expect(src).toContain(`<RouteHead`);
    expect(src).toContain(`path="${path}"`);
  });
});
