/**
 * TDD — 13.4.4: Bundle size audit
 *
 * Walks frontend/dist/assets/ and asserts:
 *   - Total initial JS bundle (all .js files) is < 200KB gzipped
 *   - No single chunk exceeds 150KB gzipped (coarse guard against megabyte blobs)
 *   - Source maps are not included in dist/ (they inflate bundle size perception)
 *
 * If dist/ does not exist (build hasn't been run), the test is skipped.
 * Run `cd frontend && npm run build` first, then re-run this test file.
 *
 * Note: "initial" here means all JS files since Vite splits lazily-loaded
 * routes into separate chunks. In practice most chunks are < 50KB gzipped.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";
import { gzipSync } from "zlib";

const ROOT  = resolve(__dirname, "../../../../");
const DIST  = join(ROOT, "frontend", "dist");
const ASSETS = join(DIST, "assets");

const DIST_EXISTS = existsSync(ASSETS);

function gzippedSize(filePath: string): number {
  const content = readFileSync(filePath);
  return gzipSync(content, { level: 9 }).length;
}

function walk(dir: string, ext: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => join(dir, e.name));
}

describe("13.4.4: Bundle size audit", () => {
  it.skipIf(!DIST_EXISTS)("dist/assets/ exists after build", () => {
    expect(existsSync(ASSETS)).toBe(true);
  });

  it.skipIf(!DIST_EXISTS)("total JS bundle is < 200KB gzipped", () => {
    const jsFiles = walk(ASSETS, ".js");
    expect(jsFiles.length, "No JS files found in dist/assets/").toBeGreaterThan(0);

    let totalGzip = 0;
    for (const f of jsFiles) {
      totalGzip += gzippedSize(f);
    }
    const totalKB = totalGzip / 1024;
    expect(
      totalGzip,
      `Total JS bundle is ${totalKB.toFixed(1)}KB gzipped — exceeds 200KB target. ` +
      `Run 'vite-bundle-visualizer' to identify large dependencies.`
    ).toBeLessThan(200 * 1024);
  });

  it.skipIf(!DIST_EXISTS)("no single JS chunk exceeds 150KB gzipped", () => {
    const jsFiles = walk(ASSETS, ".js");
    for (const f of jsFiles) {
      const size = gzippedSize(f);
      const kb = size / 1024;
      expect(
        size,
        `Chunk ${f.split("/").pop()} is ${kb.toFixed(1)}KB gzipped — exceeds 150KB per-chunk limit`
      ).toBeLessThan(150 * 1024);
    }
  });

  it.skipIf(!DIST_EXISTS)("no .map files are shipped in dist/assets/ (source maps excluded from bundle)", () => {
    const mapFiles = walk(ASSETS, ".map");
    expect(
      mapFiles.map((f) => f.split("/").pop()),
      "Source map files found in dist/assets/ — add build.sourcemap: false to vite.config.ts"
    ).toHaveLength(0);
  });

  it.skipIf(!DIST_EXISTS)("index.html exists in dist/", () => {
    expect(existsSync(join(DIST, "index.html"))).toBe(true);
  });

  it.skipIf(!DIST_EXISTS)("reports actual bundle sizes for audit visibility", () => {
    const jsFiles = walk(ASSETS, ".js");
    const sizes = jsFiles
      .map((f) => ({ name: f.split("\\").pop()!.split("/").pop()!, kb: gzippedSize(f) / 1024 }))
      .sort((a, b) => b.kb - a.kb);

    const report = sizes.map((s) => `  ${s.name}: ${s.kb.toFixed(1)}KB gzip`).join("\n");
    const total  = sizes.reduce((s, x) => s + x.kb, 0);

    // This "test" always passes — it prints the bundle breakdown for CI logs
    console.info(`\n[13.4.4] Bundle size report:\n${report}\n  TOTAL: ${total.toFixed(1)}KB gzip`);
    expect(true).toBe(true);
  });

  // Always-run guard: vite.config.ts should not enable sourcemaps in production
  it("vite.config.ts does not enable sourcemap in production build", () => {
    const config = readFileSync(join(ROOT, "frontend", "vite.config.ts"), "utf-8");
    // sourcemap: true or sourcemap: 'inline' in build config would be a problem
    // It's OK if it's absent (default false) or explicitly false
    const hasDangerousSourcemap = /build\s*:\s*\{[^}]*sourcemap\s*:\s*(true|['"]inline['"])/s.test(config);
    expect(
      hasDangerousSourcemap,
      "vite.config.ts enables sourcemap in build config — this inflates bundle size"
    ).toBe(false);
  });
});
