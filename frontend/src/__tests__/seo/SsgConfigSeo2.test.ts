/**
 * SEO.2 — vite-plugin-ssg build integration
 *
 * Validates:
 *   1. SSG_ROUTES manifest exists and contains all required static paths
 *   2. public/_redirects exists with ICP SPA fallback rule
 *   3. package.json has a build:ssg script
 *   4. Route manifest quality (no duplicates, all start with /)
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../");
const PUBLIC = resolve(ROOT, "public");
const PKG = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));

// ── SSG_ROUTES manifest ───────────────────────────────────────────────────────

describe("SSG_ROUTES manifest", () => {
  let SSG_ROUTES: string[];

  beforeAll(async () => {
    const mod = await import("@/ssg-routes");
    SSG_ROUTES = mod.SSG_ROUTES;
  });

  it("exports SSG_ROUTES as a non-empty array", () => {
    expect(Array.isArray(SSG_ROUTES)).toBe(true);
    expect(SSG_ROUTES.length).toBeGreaterThan(0);
  });

  it("includes the landing page /", () => {
    expect(SSG_ROUTES).toContain("/");
  });

  it("includes /pricing", () => {
    expect(SSG_ROUTES).toContain("/pricing");
  });

  it("includes /check (address lookup)", () => {
    expect(SSG_ROUTES).toContain("/check");
  });

  it("includes /sell (Bid to List for sellers)", () => {
    expect(SSG_ROUTES).toContain("/sell");
  });

  it("includes /instant-forecast", () => {
    expect(SSG_ROUTES).toContain("/instant-forecast");
  });

  it("includes /home-systems", () => {
    expect(SSG_ROUTES).toContain("/home-systems");
  });

  it("includes /prices (price lookup)", () => {
    expect(SSG_ROUTES).toContain("/prices");
  });

  it("all routes start with /", () => {
    SSG_ROUTES.forEach((r) => expect(r.startsWith("/")).toBe(true));
  });

  it("has no duplicate routes", () => {
    const unique = [...new Set(SSG_ROUTES)];
    expect(unique.length).toBe(SSG_ROUTES.length);
  });

  it("does NOT include protected (auth-required) routes", () => {
    const authRoutes = ["/dashboard", "/settings", "/jobs/new", "/properties/new"];
    authRoutes.forEach((r) => expect(SSG_ROUTES).not.toContain(r));
  });
});

// ── public/_redirects (ICP SPA fallback) ─────────────────────────────────────

describe("public/_redirects", () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(resolve(PUBLIC, "_redirects"), "utf-8");
  });

  it("file exists and is non-empty", () => {
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it("contains SPA catch-all rule /* /index.html 200", () => {
    expect(content).toMatch(/\/\*\s+\/index\.html\s+200/);
  });
});

// ── package.json build:ssg script ────────────────────────────────────────────

describe("package.json build scripts", () => {
  it("has a build:ssg script", () => {
    expect(PKG.scripts?.["build:ssg"]).toBeTruthy();
  });

  it("build:ssg script references the prerender step", () => {
    const script: string = PKG.scripts["build:ssg"];
    expect(script).toMatch(/prerender|ssg/i);
  });
});
