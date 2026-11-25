/**
 * Regenerates the brand images in public/ from the landing page's logo and
 * colours: the share image (og-default.png, 1200×630), the favicons, the
 * apple-touch-icon and the web-manifest icons.
 *
 * Not part of the build: the PNGs are committed. Run it by hand after a brand
 * change (needs Playwright's Chromium and network access to Google Fonts):
 *
 *   node frontend/scripts/gen-brand-images.mjs
 *   CHROMIUM_PATH=/path/to/chrome node frontend/scripts/gen-brand-images.mjs
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "@playwright/test";

const PUBLIC = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

const BLUE = "#2B34FF",
  YELLOW = "#FFD23F",
  INK = "#0B0D1A",
  PAPER = "#FCFCFD";
const LBLUE = "#F3F4FF",
  VBADGE = "#E0E2FF",
  MUTED2 = "#5A5F70";

// The landing page's Logo (src/pages/LandingPage.tsx), 28×28 viewBox.
const LOGO_PATHS = (body, check) => `
  <path d="M14 2.4 25.4 11.2V24a1.8 1.8 0 0 1-1.8 1.8H4.4A1.8 1.8 0 0 1 2.6 24V11.2z" fill="${body}"/>
  <path d="M14 2.4 25.4 11.2H2.6z" fill="${YELLOW}"/>
  <path d="m9.4 17.2 3.4 3.4 6.4-6.6" stroke="${check}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

/** Logo on a cobalt rounded square: reads on light and dark browser tabs. */
export const FAVICON_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" rx="7" fill="${BLUE}"/>` +
  `<g transform="translate(3 2.6) scale(0.93)">${LOGO_PATHS(PAPER, BLUE)}</g></svg>\n`;

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Hanken+Grotesk:wght@400;500&family=JetBrains+Mono:wght@700&display=block" rel="stylesheet">`;

const ROWS = [
  ["Roof replacement", "Signed by the roofer", "VERIFIED", BLUE, VBADGE],
  ["Panel upgrade to 200A", "Signed by the electrician", "VERIFIED", BLUE, VBADGE],
  ["Water heater · 14 yrs", "Past its 10-year rated life", "AT RISK", "#8C2402", "#FFDCD3"],
];

const OG_HTML = `<!doctype html><html><head>${FONTS}<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: ${BLUE}; overflow: hidden; position: relative; font-family: "Hanken Grotesk", sans-serif; }
  .c1 { position: absolute; top: -220px; right: -160px; width: 640px; height: 640px; border-radius: 50%; background: #3D46FF; }
  .c2 { position: absolute; bottom: -300px; left: -140px; width: 560px; height: 560px; border-radius: 50%; background: #1F27E8; }
  .left { position: absolute; left: 72px; top: 64px; width: 600px; }
  .brand { display: flex; align-items: center; gap: 14px; font: 800 34px/1 "Bricolage Grotesque"; letter-spacing: -.03em; color: ${PAPER}; }
  .brand span { color: ${YELLOW}; }
  h1 { margin-top: 64px; font: 800 86px/.95 "Bricolage Grotesque"; letter-spacing: -.045em; color: ${PAPER}; }
  h1 span { color: ${YELLOW}; }
  p { margin-top: 28px; font: 400 25px/1.45 "Hanken Grotesk"; color: ${PAPER}; max-width: 540px; }
  .url { position: absolute; left: 72px; bottom: 52px; font: 700 17px/1 "JetBrains Mono"; letter-spacing: .14em; color: ${PAPER}; opacity: .85; }
  .card { position: absolute; right: 64px; top: 112px; width: 420px; background: ${PAPER}; border-radius: 28px; padding: 26px; box-shadow: 0 44px 90px rgba(11,13,26,.4); }
  .kick { font: 700 12px/1 "JetBrains Mono"; letter-spacing: .16em; color: ${MUTED2}; }
  .score { display: flex; align-items: baseline; gap: 10px; margin-top: 12px; font: 800 52px/1 "Bricolage Grotesque"; letter-spacing: -.04em; color: ${INK}; }
  .score small { font: 500 16px/1 "Hanken Grotesk"; letter-spacing: 0; color: ${MUTED2}; }
  .row { margin-top: 12px; background: ${LBLUE}; border-radius: 16px; padding: 15px 16px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .row b { display: block; font: 700 17px/1.2 "Bricolage Grotesque"; color: ${INK}; }
  .row i { display: block; margin-top: 5px; font: 400 13.5px/1.2 "Hanken Grotesk"; font-style: normal; color: ${MUTED2}; }
  .tag { font: 700 11px/1 "JetBrains Mono"; letter-spacing: .1em; padding: 7px 10px; border-radius: 100px; white-space: nowrap; }
</style></head><body>
  <div class="c1"></div><div class="c2"></div>
  <div class="left">
    <div class="brand"><svg width="40" height="40" viewBox="0 0 28 28">${LOGO_PATHS(PAPER, BLUE)}</svg><div>Home<span>Gentic</span></div></div>
    <h1>Your house<br>keeps <span>receipts</span>.</h1>
    <p>Every repair in one verified record, signed by the contractor who did the work.</p>
  </div>
  <div class="url">HOMEGENTIC.APP</div>
  <div class="card">
    <div class="kick">HOME RECORD · EXAMPLE</div>
    <div class="score">82<small>HomeGentic score</small></div>
    ${ROWS.map(([t, m, tag, fg, bg]) => `<div class="row"><div><b>${t}</b><i>${m}</i></div><span class="tag" style="color:${fg};background:${bg}">${tag}</span></div>`).join("")}
  </div>
</body></html>`;

/** Full-bleed cobalt square with the logo inside the maskable safe zone. */
const ICON_HTML = (size) => `<!doctype html><html><head><style>
  * { margin: 0; } body { width: ${size}px; height: ${size}px; background: ${BLUE}; display: flex; align-items: center; justify-content: center; }
</style></head><body><svg width="${Math.round(size * 0.58)}" height="${Math.round(size * 0.58)}" viewBox="0 0 28 28">${LOGO_PATHS(PAPER, BLUE)}</svg></body></html>`;

const FAVICON_HTML = (size) => `<!doctype html><html><head><style>
  * { margin: 0; } html, body { width: ${size}px; height: ${size}px; background: transparent; }
  img { width: ${size}px; height: ${size}px; display: block; }
</style></head><body><img src="data:image/svg+xml;base64,${Buffer.from(FAVICON_SVG).toString("base64")}"></body></html>`;

/** A .ico holding PNG images (supported by every current browser). */
export function icoFromPngs(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ size, bytes }, i) => {
    const e = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, e);
    header.writeUInt8(size >= 256 ? 0 : size, e + 1);
    header.writeUInt8(0, e + 2);
    header.writeUInt8(0, e + 3);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(bytes.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += bytes.length;
  });
  return Buffer.concat([header, ...pngs.map((p) => p.bytes)]);
}

async function shoot(browser, html, width, height, transparent = false) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const bytes = await page.screenshot({ type: "png", omitBackground: transparent });
  await page.close();
  return bytes;
}

async function main() {
  // CHROMIUM_PATH: a Chromium other than the one this Playwright version installs.
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  try {
    writeFileSync(resolve(PUBLIC, "og-default.png"), await shoot(browser, OG_HTML, 1200, 630));
    for (const [name, size] of [
      ["apple-touch-icon.png", 180],
      ["icon-192.png", 192],
      ["icon-512.png", 512],
    ]) {
      writeFileSync(resolve(PUBLIC, name), await shoot(browser, ICON_HTML(size), size, size));
    }
    writeFileSync(resolve(PUBLIC, "favicon.svg"), FAVICON_SVG);
    const fav = {};
    for (const size of [16, 32, 48]) fav[size] = await shoot(browser, FAVICON_HTML(size), size, size, true);
    writeFileSync(resolve(PUBLIC, "favicon-48.png"), fav[48]);
    writeFileSync(
      resolve(PUBLIC, "favicon.ico"),
      icoFromPngs([16, 32, 48].map((size) => ({ size, bytes: fav[size] }))),
    );
    console.log(
      "gen-brand-images: wrote og-default.png, favicon.svg/.ico, favicon-48.png, apple-touch-icon.png, icon-192.png, icon-512.png",
    );
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
