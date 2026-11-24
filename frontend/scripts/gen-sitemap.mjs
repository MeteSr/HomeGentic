/**
 * dist/sitemap.xml from PUBLIC_ROUTES (src/seo/publicRoutes.ts), written by
 * `npm run build` after the prerender. The same list gives each page its
 * per-route HTML, so the sitemap can't name a page the build didn't write.
 *
 * No <lastmod>: a build date would tell crawlers every page changed on every
 * deploy. Google ignores changefreq and priority, so neither is written.
 *
 * Usage:
 *   node scripts/gen-sitemap.mjs                         # https://homegentic.app
 *   node scripts/gen-sitemap.mjs https://example.test     # another base URL
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PUBLIC_ROUTES, SITE_ORIGIN, canonicalUrl } from "../src/seo/publicRoutes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function generateSitemap(baseUrl = SITE_ORIGIN) {
  const base = baseUrl.replace(/\/+$/, "");
  const urls = PUBLIC_ROUTES.map(
    (r) => `  <url><loc>${base}${canonicalUrl(r.path).slice(SITE_ORIGIN.length)}</loc></url>`,
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.join("\n") +
    `\n</urlset>\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const baseUrl = process.argv[2] || SITE_ORIGIN;
  const xml = generateSitemap(baseUrl);
  const dist = resolve(__dirname, "../dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(resolve(dist, "sitemap.xml"), xml);
  console.log(`gen-sitemap: wrote dist/sitemap.xml (${PUBLIC_ROUTES.length} URLs, base ${baseUrl})`);
}
