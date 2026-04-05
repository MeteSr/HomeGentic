/**
 * SEO.8 — Core Web Vitals baseline
 *
 * Validates build-time optimisations that directly affect CWV scores:
 *   1. Google Fonts link has font-display=swap in the CSS @font-face (or
 *      index.html has preconnect hints)
 *   2. index.html has <link rel="preconnect"> for fonts.googleapis.com
 *   3. docs/PERFORMANCE.md exists (baseline scores documented)
 *   4. vite.config.ts does not have sourcemap: true in production
 *      (reduces bundle size / parse time)
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT    = resolve(__dirname, "../../../");
const INDEX   = resolve(ROOT, "index.html");
const VITE    = resolve(ROOT, "vite.config.ts");

describe("index.html — font preconnect hints", () => {
  let html: string;
  beforeAll(() => { html = readFileSync(INDEX, "utf-8"); });

  it("has preconnect to fonts.googleapis.com", () => {
    expect(html).toMatch(/rel=["']preconnect["'][^>]*fonts\.googleapis\.com/);
  });

  it("has preconnect to fonts.gstatic.com", () => {
    expect(html).toMatch(/fonts\.gstatic\.com/);
  });
});

describe("index.html — font-display swap", () => {
  let html: string;
  beforeAll(() => { html = readFileSync(INDEX, "utf-8"); });

  it("Google Fonts URL includes display=swap", () => {
    expect(html).toMatch(/display=swap/);
  });
});

describe("vite.config.ts — production build settings", () => {
  let config: string;
  beforeAll(() => { config = readFileSync(VITE, "utf-8"); });

  it("does not enable sourcemap in production build", () => {
    // sourcemap: false is already set; we just verify it's not 'true'
    expect(config).not.toMatch(/sourcemap:\s*true/);
  });
});

describe("docs/PERFORMANCE.md", () => {
  it("file exists (baseline scores documented)", () => {
    const p = resolve(ROOT, "..", "docs", "PERFORMANCE.md");
    expect(existsSync(p)).toBe(true);
  });

  it("contains Lighthouse or LCP mention", () => {
    const p = resolve(ROOT, "..", "docs", "PERFORMANCE.md");
    const content = readFileSync(p, "utf-8");
    expect(content.toLowerCase()).toMatch(/lighthouse|lcp|core web vitals/);
  });
});
