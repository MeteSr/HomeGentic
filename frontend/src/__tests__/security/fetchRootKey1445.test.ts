/**
 * TDD — 14.4.5: Verify fetchRootKey is never called in production
 *
 * shouldFetchRootKey: true disables certificate verification and must never
 * appear unconditionally in production code paths.
 *
 * getAgent() now fetches the root key explicitly with a 2 s timeout instead
 * of relying on the shouldFetchRootKey flag, which caused hangs when no
 * replica was reachable (E2E mock mode, CI without dfx).
 *
 * Checks:
 *  1. getAgent() does NOT pass shouldFetchRootKey: true to HttpAgent.create()
 *  2. getAgent() calls fetchRootKey() only inside an IS_LOCAL guard
 *  3. The explicit fetchRootKey call has a timeout (prevents hangs in mock mode)
 *  4. Any occurrence of shouldFetchRootKey: true is inside a DEV-guarded block
 *  5. loginWithLocalIdentity() is hard-blocked in production
 *  6. No other TS/TSX source file uses fetchRootKey: true outside actor.ts
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

  it("getAgent() does not pass shouldFetchRootKey: true to HttpAgent.create()", () => {
    // shouldFetchRootKey: true disables cert verification — must never be hardcoded.
    // getAgent() now fetches root key explicitly with a timeout instead of using this flag.
    const start = actor.indexOf("async function getAgent");
    expect(start).toBeGreaterThan(-1);
    const snippet = actor.slice(start, start + 800);
    expect(snippet).not.toMatch(/shouldFetchRootKey:\s*true/);
  });

  it("getAgent() calls fetchRootKey() inside an IS_LOCAL guard with a timeout", () => {
    const start = actor.indexOf("async function getAgent");
    expect(start).toBeGreaterThan(-1);
    const snippet = actor.slice(start, start + 800);
    // Must be gated on IS_LOCAL — never called unconditionally
    expect(snippet).toMatch(/if\s*\(IS_LOCAL\)/);
    // Must use an explicit fetchRootKey() call (not the flag)
    expect(snippet).toMatch(/fetchRootKey\(\)/);
    // Must have a timeout to prevent indefinite hangs when no replica is reachable
    expect(snippet).toMatch(/setTimeout/);
  });

  it("every shouldFetchRootKey: true in actor.ts is inside a local-only guard", () => {
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
    // Guard uses IS_LOCAL (DFX_NETWORK-based) rather than import.meta.env.DEV
    expect(actor).toMatch(/if\s*\(!IS_LOCAL\)/);
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
