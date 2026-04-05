/**
 * SEO.5 — sitemap.xml + robots.txt
 *
 * Validates:
 *   1. public/robots.txt exists, allows all crawlers, points to sitemap
 *   2. scripts/gen-sitemap.mjs exists
 *   3. gen-sitemap produces valid XML with one <url> per SSG route
 *   4. package.json has a gen:sitemap script
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
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

// ── gen-sitemap produces valid XML ────────────────────────────────────────────
describe("gen-sitemap output", () => {
  let xml: string;

  beforeAll(async () => {
    // Run the generator with DIST pointing to a temp dir so no real dist needed
    const tmpDist = resolve(ROOT, "dist-test-sitemap");
    mkdirSync(tmpDist, { recursive: true });
    writeFileSync(resolve(tmpDist, "index.html"), "<html></html>");

    // Dynamic import of the generator module (it exports generateSitemap)
    const mod = await import(resolve(ROOT, "scripts/gen-sitemap.mjs") + `?t=${Date.now()}`);
    xml = mod.generateSitemap("https://homegentic.app");
  });

  it("returns a string", () => {
    expect(typeof xml).toBe("string");
  });

  it("is valid XML (starts with <?xml)", () => {
    expect(xml.trimStart()).toMatch(/^<\?xml/);
  });

  it("contains <urlset>", () => {
    expect(xml).toContain("<urlset");
  });

  it("contains at least one <loc> for the landing page", () => {
    expect(xml).toContain("<loc>https://homegentic.app/</loc>");
  });

  it("contains /pricing", () => {
    expect(xml).toContain("/pricing");
  });

  it("contains /instant-forecast", () => {
    expect(xml).toContain("/instant-forecast");
  });
});

// ── package.json gen:sitemap script ──────────────────────────────────────────
describe("package.json scripts", () => {
  it("has a gen:sitemap script", () => {
    expect(PKG.scripts?.["gen:sitemap"]).toBeTruthy();
  });
});
