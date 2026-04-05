/**
 * SEO.5 — Build-time sitemap.xml generator
 *
 * Generates a sitemap for all static routes (from SSG_ROUTES) and writes
 * it to dist/sitemap.xml.  A <sitemapindex> entry points crawlers to a
 * dynamic sitemap endpoint on the backend for listing/profile pages.
 *
 * Usage:
 *   node scripts/gen-sitemap.mjs                       # writes dist/sitemap.xml
 *   node scripts/gen-sitemap.mjs https://homegentic.app  # custom base URL
 *
 * Exported for unit testing:
 *   import { generateSitemap } from "./gen-sitemap.mjs";
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Load SSG_ROUTES from ssg-routes.ts ────────────────────────────────────────
function loadRoutes() {
  const src = readFileSync(resolve(ROOT, "src", "ssg-routes.ts"), "utf-8");
  return [...src.matchAll(/"(\/[^"]*)"/g)].map(([, p]) => p);
}

// ── generateSitemap(baseUrl) — exported for tests ─────────────────────────────
export function generateSitemap(baseUrl = "https://homegentic.app") {
  const base = baseUrl.replace(/\/$/, "");
  const routes = loadRoutes();
  const today = new Date().toISOString().slice(0, 10);

  const urls = routes.map((route) => {
    const loc = route === "/" ? `${base}/` : `${base}${route}`;
    const priority = route === "/" ? "1.0" : "0.8";
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
}

// ── CLI entry point ───────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseUrl = process.argv[2] || "https://homegentic.app";
  const xml = generateSitemap(baseUrl);
  const dist = resolve(ROOT, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(resolve(dist, "sitemap.xml"), xml);
  console.log(`gen-sitemap: wrote dist/sitemap.xml (${xml.length} bytes, base: ${baseUrl})`);
}
