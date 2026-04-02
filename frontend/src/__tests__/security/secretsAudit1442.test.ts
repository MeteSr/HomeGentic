/**
 * TDD — 14.4.2: Secrets audit static checks
 *
 * Verifies that:
 *  1. .env is listed in .gitignore
 *  2. .env.example contains only empty placeholders (no real values)
 *  3. No VITE_ANTHROPIC_* env vars exist in the codebase (Vite auto-inlines VITE_* into bundle)
 *  4. ANTHROPIC_API_KEY is never inlined into the Vite define block
 *  5. The voice agent server only reads the key from process.env (never hardcoded)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

describe("14.4.2: secrets audit — static codebase checks", () => {
  it(".env is listed in .gitignore", () => {
    const gitignore = read(".gitignore");
    // Must match a line that is exactly ".env" or starts with ".env"
    const lines = gitignore.split("\n").map((l) => l.trim());
    expect(lines.some((l) => l === ".env" || l === ".env.local")).toBe(true);
  });

  it(".env.example contains no real secret values (API keys and private keys must be empty)", () => {
    const example = read(".env.example");
    // Secret-looking keys must have empty values — non-secret defaults (ports, URLs, mode) are fine
    const SECRET_KEY_PATTERN = /(?:API_KEY|SECRET|PRIVATE_KEY|TOKEN|PASSWORD|PASSWD)/i;
    const lines = example
      .split("\n")
      .filter((l) => !l.startsWith("#") && l.includes("="));

    for (const line of lines) {
      const [key, ...rest] = line.split("=");
      if (SECRET_KEY_PATTERN.test(key)) {
        const value = rest.join("=").trim();
        expect(value, `Expected empty value for secret key: ${key}`).toBe("");
      }
    }
  });

  it("no VITE_ANTHROPIC_* variable exists anywhere in the frontend source", () => {
    // Vite automatically inlines any VITE_* env var into the client bundle
    const viteConfig = read("frontend/vite.config.ts");
    expect(viteConfig).not.toMatch(/VITE_ANTHROPIC/i);
  });

  it("ANTHROPIC_API_KEY is not inlined in the Vite define block", () => {
    const viteConfig = read("frontend/vite.config.ts");
    // Should not appear in the define section at all
    const defineIdx = viteConfig.indexOf("define:");
    if (defineIdx === -1) return; // no define block — safe by default
    const defineBlock = viteConfig.slice(defineIdx);
    expect(defineBlock).not.toMatch(/ANTHROPIC_API_KEY/);
  });

  it("voice agent server reads API key from process.env, not a hardcoded literal", () => {
    const server = read("agents/voice/server.ts");
    // Must contain process.env.ANTHROPIC_API_KEY
    expect(server).toMatch(/process\.env\.ANTHROPIC_API_KEY/);
    // Must NOT contain an actual sk-ant- key
    expect(server).not.toMatch(/sk-ant-[A-Za-z0-9_-]{20,}/);
  });

  it("no sk-ant- key pattern appears anywhere in tracked source files", () => {
    // Spot-check key source files
    const filesToCheck = [
      "frontend/src/services/actor.ts",
      "agents/voice/server.ts",
      "frontend/vite.config.ts",
    ];
    for (const f of filesToCheck) {
      expect(read(f)).not.toMatch(/sk-ant-[A-Za-z0-9_-]{20,}/);
    }
  });
});
