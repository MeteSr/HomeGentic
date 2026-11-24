/**
 * SEO — share image, favicon, home-screen icons and web manifest.
 *
 * The share image (og-default.png) is what iMessage, Slack, Facebook,
 * LinkedIn and X show under every HomeGentic link. It was a blank 3.6 KB
 * purple rectangle; it must be a real 1200×630 branded image. Search results
 * show the favicon next to the site name, and iOS and Android use the touch
 * icons and manifest when someone adds the site to their home screen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";
// @ts-expect-error -- plain .mjs build script, no type declarations
import { pngInfo } from "../../../scripts/iiAppMetadata.mjs";

const FRONTEND = resolve(__dirname, "../../..");
const PUBLIC = resolve(FRONTEND, "public");
const INDEX = readFileSync(resolve(FRONTEND, "index.html"), "utf8");

const png = (name: string) => pngInfo(readFileSync(resolve(PUBLIC, name)));

describe("og-default.png", () => {
  it("is a 1200×630 PNG (the size every network crops to)", () => {
    expect(png("og-default.png")).toEqual({ width: 1200, height: 630 });
  });

  it("has real artwork, not a flat placeholder", () => {
    expect(statSync(resolve(PUBLIC, "og-default.png")).size).toBeGreaterThan(20_000);
  });

  it("index.html declares its size and alt text", () => {
    expect(INDEX).toMatch(/<meta property="og:image:width"\s+content="1200"/);
    expect(INDEX).toMatch(/<meta property="og:image:height"\s+content="630"/);
    expect(INDEX).toMatch(/<meta property="og:image:alt"\s+content="[^"]+"/);
  });
});

describe("icons", () => {
  it("has an SVG favicon and a 48×48 PNG fallback, linked from index.html", () => {
    expect(readFileSync(resolve(PUBLIC, "favicon.svg"), "utf8")).toMatch(/^<svg[^>]*viewBox/);
    expect(png("favicon-48.png")).toEqual({ width: 48, height: 48 });
    expect(INDEX).toMatch(/<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/);
    expect(INDEX).toMatch(/<link rel="icon" href="\/favicon-48\.png" sizes="48x48" type="image\/png"/);
  });

  it("has a 180×180 apple-touch-icon, linked from index.html", () => {
    expect(png("apple-touch-icon.png")).toEqual({ width: 180, height: 180 });
    expect(INDEX).toMatch(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  });

  it("serves /favicon.ico, which browsers and crawlers request without asking the page", () => {
    const ico = readFileSync(resolve(PUBLIC, "favicon.ico"));
    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0]); // ICONDIR, type 1 = icon
  });
});

describe("site.webmanifest", () => {
  const manifest = JSON.parse(readFileSync(resolve(PUBLIC, "site.webmanifest"), "utf8"));

  it("is linked from index.html", () => {
    expect(INDEX).toMatch(/<link rel="manifest" href="\/site\.webmanifest"/);
  });

  it("names the app and uses the brand colours", () => {
    expect(manifest.name).toBe("HomeGentic");
    expect(manifest.short_name).toBe("HomeGentic");
    expect(manifest.start_url).toBe("/");
    expect(manifest.theme_color).toBe("#2B34FF");
    expect(INDEX).toMatch(/<meta name="theme-color" content="#2B34FF"/);
  });

  it("lists 192 and 512 icons that exist at those sizes", () => {
    const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of manifest.icons) {
      const file = resolve(PUBLIC, icon.src.replace(/^\//, ""));
      expect(existsSync(file), icon.src).toBe(true);
      const [w, h] = icon.sizes.split("x").map(Number);
      expect(png(icon.src.replace(/^\//, ""))).toEqual({ width: w, height: h });
    }
  });
});

describe("_headers", () => {
  it("gen-ic-assets gives the manifest its media type (it has no well-known extension)", () => {
    const src = readFileSync(resolve(FRONTEND, "scripts/gen-ic-assets.mjs"), "utf8");
    expect(src).toMatch(/block\("\/site\.webmanifest", \{ "Content-Type": "application\/manifest\+json" \}\)/);
  });
});
