/**
 * Per-route HTML for the public pages, written after `vite build`.
 *
 * Every URL used to get the same index.html, so link previews (iMessage,
 * Slack, Facebook, LinkedIn, X) and crawlers that don't run JavaScript saw
 * the homepage's title and description everywhere. For each page in
 * PUBLIC_ROUTES (src/seo/publicRoutes.ts) this writes a copy of the built
 * shell with that page's title, description, canonical and share tags:
 *
 *   /          → dist/index.html
 *   /pricing   → dist/pricing.html   (served at /pricing, static-site skill:
 *                                     a folder index would 307 to /pricing/)
 *
 * The untouched shell is kept as dist/app-shell.html, the SPA fallback in
 * public/_redirects for every other URL. It names no canonical or og:url, so
 * a listing or report link isn't claimed to be the homepage.
 *
 * Runs as part of `npm run build` (so scripts/deploy.sh and CI get it) and can
 * run again on the same dist/: it always starts from app-shell.html.
 *
 * Imports the route table straight from TypeScript: Node 22.18+ strips types.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PUBLIC_ROUTES, canonicalUrl } from "../src/seo/publicRoutes.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const APP_SHELL = "app-shell.html";

const escapeHtml = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The file under dist/ that the canister serves at this route's URL. */
export function routeFile(path) {
  return path === "/" ? "index.html" : `${path.replace(/^\/+|\/+$/g, "")}.html`;
}

/** The shell with this route's tags in place of the generic ones. */
export function renderRouteShell(shell, route) {
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  const url = escapeHtml(canonicalUrl(route.path));
  let html = shell;

  const replace = (name, re, value) => {
    if (!re.test(html)) throw new Error(`prerender: the shell has no ${name} tag to replace`);
    html = html.replace(re, value);
  };
  const metaContent = (attr, key) => new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);

  replace("title", /<title>[^<]*<\/title>/, `<title>${title}</title>`);
  replace("description", metaContent("name", "description"), `$1${description}$2`);
  replace("og:title", metaContent("property", "og:title"), `$1${title}$2`);
  replace("og:description", metaContent("property", "og:description"), `$1${description}$2`);
  replace("twitter:title", metaContent("name", "twitter:title"), `$1${title}$2`);
  replace("twitter:description", metaContent("name", "twitter:description"), `$1${description}$2`);

  const extra =
    `    <link rel="canonical" href="${url}" />\n` +
    `    <meta property="og:url" content="${url}" />\n`;
  replace("</head>", /\n?\s*<\/head>/, `\n${extra}  </head>`);
  return html;
}

/** Writes app-shell.html and one file per public route into dist. */
export function prerender(dist) {
  const shellPath = resolve(dist, APP_SHELL);
  const indexPath = resolve(dist, "index.html");
  if (!existsSync(shellPath)) {
    if (!existsSync(indexPath)) throw new Error(`prerender: ${indexPath} not found; run vite build first`);
    writeFileSync(shellPath, readFileSync(indexPath, "utf8"));
  }
  const shell = readFileSync(shellPath, "utf8");
  for (const route of PUBLIC_ROUTES) {
    writeFileSync(resolve(dist, routeFile(route.path)), renderRouteShell(shell, route));
  }
  return PUBLIC_ROUTES.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dist = resolve(__dirname, "../dist");
  try {
    const n = prerender(dist);
    console.log(`prerender: wrote ${n} public pages + ${APP_SHELL}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
