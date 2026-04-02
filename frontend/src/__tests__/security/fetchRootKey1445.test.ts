/**
 * TDD — 14.4.5: Verify fetchRootKey is never called in production
 *
 * shouldFetchRootKey: true is safe only in local dev — it disables certificate
 * verification and must never appear in production code paths.
 *
 * Checks:
 *  1. The production getAgent() path uses shouldFetchRootKey: IS_LOCAL (not true)
 *  2. Any occurrence of shouldFetchRootKey: true is inside a DEV-guarded block
 *  3. No file other than actor.ts uses fetchRootKey: true outside a DEV guard
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, join } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

/** Walk a directory tree and return all .ts/.tsx files. */
function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      results.push(...walk(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe("14.4.5: fetchRootKey production safety", () => {
  const actor = read("frontend/src/services/actor.ts");

  it("production getAgent() uses shouldFetchRootKey: IS_LOCAL (not hardcoded true)", () => {
    // Extract the getAgent function body (up to the first closing brace after its open)
    const start = actor.indexOf("async function getAgent");
    expect(start).toBeGreaterThan(-1);
    // Grab up to 600 chars — enough to cover the whole function
    const snippet = actor.slice(start, start + 600);
    expect(snippet).toMatch(/shouldFetchRootKey:\s*IS_LOCAL/);
    expect(snippet).not.toMatch(/shouldFetchRootKey:\s*true/);
  });

  it("every shouldFetchRootKey: true in actor.ts is inside a DEV-guarded block", () => {
    const trueOccurrences: number[] = [];
    let pos = 0;
    while (true) {
      const idx = actor.indexOf("shouldFetchRootKey: true", pos);
      if (idx === -1) break;
      trueOccurrences.push(idx);
      pos = idx + 1;
    }

    for (const idx of trueOccurrences) {
      // Look back up to 500 chars for a DEV guard
      const lookback = actor.slice(Math.max(0, idx - 500), idx);
      const hasDevGuard =
        lookback.includes("import.meta.env.DEV") ||
        lookback.includes("IS_LOCAL") ||
        lookback.includes("loginWithLocalIdentity");
      expect(hasDevGuard, `shouldFetchRootKey: true at offset ${idx} is not inside a DEV guard`).toBe(true);
    }
  });

  it("loginWithLocalIdentity() is hard-blocked in production", () => {
    expect(actor).toMatch(/if\s*\(!import\.meta\.env\.DEV\)/);
    expect(actor).toMatch(/throw new Error/);
  });

  it("no other TS/TSX source file uses fetchRootKey: true outside actor.ts", () => {
    const frontendSrc = resolve(ROOT, "frontend/src");
    const allFiles = walk(frontendSrc).filter((f) => !f.includes("__tests__"));

    const violations: string[] = [];
    for (const file of allFiles) {
      if (file.endsWith("actor.ts")) continue; // already audited above
      const content = readFileSync(file, "utf-8");
      if (content.includes("fetchRootKey: true") || content.includes("shouldFetchRootKey: true")) {
        violations.push(file.replace(ROOT, ""));
      }
    }
    expect(violations, `Unexpected fetchRootKey: true in: ${violations.join(", ")}`).toHaveLength(0);
  });
});
