/**
 * SEO.5 — sitemap.xml + robots.txt
 *
 * Validates:
 *   1. public/robots.txt exists, allows all crawlers, points to sitemap
 *   2. scripts/gen-sitemap.mjs exists
 *   3. gen-sitemap lists exactly PUBLIC_ROUTES (src/seo/publicRoutes.ts)
 *   4. package.json has a gen:sitemap script
 */
import { readFileSync, existsSync } from "fs";
import { PUBLIC_ROUTES, canonicalUrl } from "@/seo/publicRoutes";
import { resolve } from "path";

const ROOT   = resolve(__dirname, "../../../");
const PUBLIC = resolve(ROOT, "public");
const PKG    = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf-8"));

// ── robots.txt ────────────────────────────────────────────────────────────────
describe("public/robots.txt", () => {
  let content: string;
  beforeAll(() => { content = readFileSync(resolve(PUBLIC, "robots.txt"), "utf-8"); });

  it("exists and is non-empty", () => {
    expect(content.trim().length).toBeGreaterThan(0);
  });

  it("allows all crawlers (User-agent: *)", () => {
    expect(content).toMatch(/User-agent:\s*\*/);
  });

  it("has Disallow: (even if empty — means allow all)", () => {
    expect(content).toMatch(/Disallow:/);
  });

  it("references the sitemap URL", () => {
    expect(content).toMatch(/Sitemap:/i);
    expect(content).toMatch(/sitemap\.xml/i);
  });
});

// ── gen-sitemap script exists ─────────────────────────────────────────────────
describe("scripts/gen-sitemap.mjs", () => {
  it("file exists", () => {
    expect(existsSync(resolve(ROOT, "scripts/gen-sitemap.mjs"))).toBe(true);
  });
});

// ── gen-sitemap produces valid XML from PUBLIC_ROUTES ─────────────────────────
describe("gen-sitemap output", () => {
  let xml: string;
  let locs: string[];

  beforeAll(async () => {
    const mod = await import(resolve(ROOT, "scripts/gen-sitemap.mjs"));
    xml = mod.generateSitemap("https://homegentic.app");
    locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  });

  it("is a sitemap urlset", () => {
    expect(xml.trimStart()).toMatch(/^<\?xml/);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  });

  it("lists exactly the public routes, each once, as canonical URLs", () => {
    expect(locs).toEqual(PUBLIC_ROUTES.map((r) => canonicalUrl(r.path)));
  });

  it.each(["/pricing", "/homes", "/sell", "/check", "/home-systems", "/prices", "/sample-report", "/truth-kit", "/demo", "/gift"])(
    "includes %s",
    (path) => {
      expect(locs).toContain(`https://homegentic.app${path}`);
    },
  );

  it("leaves out /login and /register", () => {
    expect(locs.some((l) => /\/(login|register)$/.test(l))).toBe(false);
  });

  it("writes no lastmod (a build date would claim every page changed on each deploy)", () => {
    expect(xml).not.toContain("<lastmod>");
  });

  it("uses the base URL it is given", async () => {
    const mod = await import(resolve(ROOT, "scripts/gen-sitemap.mjs"));
    expect(mod.generateSitemap("https://example.test/")).toContain("<loc>https://example.test/pricing</loc>");
  });
});

// ── one sitemap, generated at build ──────────────────────────────────────────
describe("public/sitemap.xml", () => {
  it("is gone: the build writes dist/sitemap.xml from PUBLIC_ROUTES", () => {
    expect(existsSync(resolve(PUBLIC, "sitemap.xml"))).toBe(false);
  });
});

// ── package.json gen:sitemap script ──────────────────────────────────────────
describe("package.json scripts", () => {
  it("has a gen:sitemap script", () => {
    expect(PKG.scripts?.["gen:sitemap"]).toBeTruthy();
  });
});
