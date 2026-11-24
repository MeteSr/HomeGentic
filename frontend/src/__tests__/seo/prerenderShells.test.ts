/**
 * SEO — per-route HTML written at build time (scripts/prerender.mjs).
 *
 * Link previews (iMessage, Slack, Facebook, LinkedIn, X) and crawlers that
 * don't run JavaScript read only the HTML the server sends. Each public page
 * gets its own file with its own title, description, canonical and share
 * tags. Files are written as dist/<name>.html, which the certified-assets
 * canister serves at /<name> with no trailing-slash redirect. Every other URL
 * falls back to app-shell.html, the generic shell, which names no canonical
 * or og:url, so a listing link isn't previewed or indexed as the homepage.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "fs";
import { resolve } from "path";
import os from "os";
import { PUBLIC_ROUTES, publicRoute } from "@/seo/publicRoutes";

const FRONTEND = resolve(__dirname, "../../..");
const PKG = JSON.parse(readFileSync(resolve(FRONTEND, "package.json"), "utf8"));
const SOURCE_INDEX = readFileSync(resolve(FRONTEND, "index.html"), "utf8");

// Plain .mjs build script, no type declarations.
type Route = { path: string; title: string; description: string };
let mod: {
  routeFile(path: string): string;
  renderRouteShell(shell: string, route: Route): string;
  prerender(dist: string): number;
};
beforeEach(async () => {
  mod = await import(resolve(FRONTEND, "scripts/prerender.mjs"));
});

const SHELL = `<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Generic</title>
    <meta name="description" content="Generic description" />
    <meta property="og:title"       content="Generic" />
    <meta property="og:description" content="Generic description" />
    <meta property="og:image"       content="https://homegentic.app/og-default.png" />
    <meta name="twitter:card"        content="summary_large_image" />
    <meta name="twitter:title"       content="Generic" />
    <meta name="twitter:description" content="Generic description" />
  </head>
  <body><div id="root"></div></body>
</html>`;

const tag = (html: string, re: RegExp) => html.match(re)?.[1] ?? null;
const title = (html: string) => tag(html, /<title>([^<]*)<\/title>/);
const meta = (html: string, key: string) =>
  tag(html, new RegExp(`<meta (?:name|property)="${key}"\\s+content="([^"]*)"`));
const canonical = (html: string) => tag(html, /<link rel="canonical" href="([^"]*)"/);

describe("routeFile", () => {
  it("maps / to index.html and other routes to <name>.html (no trailing-slash redirect)", () => {
    expect(mod.routeFile("/")).toBe("index.html");
    expect(mod.routeFile("/pricing")).toBe("pricing.html");
    expect(mod.routeFile("/verify-record")).toBe("verify-record.html");
  });
});

describe("renderRouteShell", () => {
  it("writes the route's title, description, canonical and share tags", () => {
    const r = publicRoute("/pricing");
    const html = mod.renderRouteShell(SHELL, r);
    expect(title(html)).toBe(r.title);
    expect(meta(html, "description")).toBe(r.description);
    expect(meta(html, "og:title")).toBe(r.title);
    expect(meta(html, "og:description")).toBe(r.description);
    expect(meta(html, "og:url")).toBe("https://homegentic.app/pricing");
    expect(meta(html, "twitter:title")).toBe(r.title);
    expect(meta(html, "twitter:description")).toBe(r.description);
    expect(canonical(html)).toBe("https://homegentic.app/pricing");
    expect(html).not.toContain("Generic");
  });

  it("escapes HTML in the copy", () => {
    const html = mod.renderRouteShell(SHELL, { path: "/x", title: `A <b>"quoted"</b> & co`, description: "d" });
    expect(title(html)).toBe("A &lt;b&gt;&quot;quoted&quot;&lt;/b&gt; &amp; co");
  });

  it("fails loudly when the shell is missing a tag it must replace", () => {
    expect(() => mod.renderRouteShell("<html><head></head></html>", publicRoute("/pricing"))).toThrow(/title/);
  });
});

describe("prerender(dist)", () => {
  let dist: string;
  beforeEach(() => {
    dist = mkdtempSync(resolve(os.tmpdir(), "prerender-"));
    writeFileSync(resolve(dist, "index.html"), SHELL);
  });
  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  it("keeps the generic shell as app-shell.html and writes one file per public route", () => {
    mod.prerender(dist);
    expect(readFileSync(resolve(dist, "app-shell.html"), "utf8")).toBe(SHELL);
    for (const r of PUBLIC_ROUTES) {
      const html = readFileSync(resolve(dist, mod.routeFile(r.path)), "utf8");
      expect(canonical(html), r.path).toBe(
        r.path === "/" ? "https://homegentic.app/" : `https://homegentic.app${r.path}`,
      );
    }
  });

  it("can run twice (CI and deploy both build) and gives the same result", () => {
    mod.prerender(dist);
    const first = readFileSync(resolve(dist, "index.html"), "utf8");
    mod.prerender(dist);
    expect(readFileSync(resolve(dist, "index.html"), "utf8")).toBe(first);
    expect(readFileSync(resolve(dist, "app-shell.html"), "utf8")).toBe(SHELL);
  });

  it("writes no folder per route (dist/pricing/index.html would be served at /pricing/)", () => {
    mod.prerender(dist);
    expect(existsSync(resolve(dist, "pricing", "index.html"))).toBe(false);
  });
});

describe("source index.html is the generic shell", () => {
  it("names no canonical or og:url (they would claim every deep link is the homepage)", () => {
    expect(SOURCE_INDEX).not.toMatch(/rel="canonical"/);
    expect(SOURCE_INDEX).not.toMatch(/og:url/);
  });

  it("has every tag the prerender replaces", () => {
    expect(() => mod.renderRouteShell(SOURCE_INDEX, publicRoute("/"))).not.toThrow();
  });

  it("uses the homepage title from PUBLIC_ROUTES, so crawlers and the app agree", () => {
    expect(title(SOURCE_INDEX)).toBe(publicRoute("/").title);
  });
});

describe("wiring", () => {
  it("public/_redirects falls back to app-shell.html", () => {
    const redirects = readFileSync(resolve(FRONTEND, "public/_redirects"), "utf8");
    expect(redirects).toMatch(/^\/\*\s+\/app-shell\.html\s+200$/m);
    expect(redirects).not.toMatch(/\/index\.html\s+200/);
  });

  it("npm run build runs the prerender and the sitemap after vite build, so deploy.sh gets both", () => {
    const build: string = PKG.scripts.build;
    const vite = build.indexOf("vite build");
    expect(build.indexOf("prerender.mjs")).toBeGreaterThan(vite);
    expect(build.indexOf("gen-sitemap.mjs")).toBeGreaterThan(vite);
  });

  it("the old per-folder manifest is gone", () => {
    expect(existsSync(resolve(FRONTEND, "src/ssg-routes.ts"))).toBe(false);
  });
});
