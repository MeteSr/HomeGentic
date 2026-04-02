/**
 * TDD — 14.4.6: Anthropic API key not exposed in Vite build
 *
 * Verifies the static guardrails:
 *  1. No VITE_ANTHROPIC_* var in vite.config.ts (Vite inlines VITE_* into bundle)
 *  2. post-build security-checks.mjs exists and scans for the key pattern
 *  3. package.json "build" script runs check:security after vite build
 *  4. The voice proxy holds the key server-side only
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

describe("14.4.6: Anthropic API key bundle safety", () => {
  it("vite.config.ts does not define any VITE_ANTHROPIC_* variable", () => {
    const config = read("frontend/vite.config.ts");
    expect(config).not.toMatch(/VITE_ANTHROPIC/i);
  });

  it("vite.config.ts define block does not include ANTHROPIC_API_KEY", () => {
    const config = read("frontend/vite.config.ts");
    const defineStart = config.indexOf("define:");
    if (defineStart === -1) return; // no define block — trivially safe
    expect(config.slice(defineStart)).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  it(".env.example has no VITE_ANTHROPIC_* line", () => {
    const example = read(".env.example");
    expect(example).not.toMatch(/VITE_ANTHROPIC/i);
  });

  it("post-build security-checks.mjs exists", () => {
    const script = read("frontend/scripts/security-checks.mjs");
    expect(script.length).toBeGreaterThan(0);
  });

  it("security-checks.mjs scans for Anthropic API key pattern in dist", () => {
    const script = read("frontend/scripts/security-checks.mjs");
    expect(script).toMatch(/sk-ant-/);
    expect(script).toMatch(/ANTHROPIC/);
  });

  it("security-checks.mjs scans for VITE_ANTHROPIC in dist", () => {
    const script = read("frontend/scripts/security-checks.mjs");
    expect(script).toMatch(/VITE_ANTHROPIC/);
  });

  it("package.json build script runs check:security after vite build", () => {
    const pkg = JSON.parse(read("frontend/package.json")) as Record<string, any>;
    expect(pkg.scripts.build).toContain("check:security");
    expect(pkg.scripts["check:security"]).toBeTruthy();
  });

  it("voice agent server holds ANTHROPIC_API_KEY in process.env — not a VITE_ var", () => {
    const server = read("agents/voice/server.ts");
    expect(server).toMatch(/process\.env\.ANTHROPIC_API_KEY/);
    expect(server).not.toMatch(/VITE_ANTHROPIC/i);
    expect(server).not.toMatch(/import\.meta\.env\.VITE_/);
  });
});
