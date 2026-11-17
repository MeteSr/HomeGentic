/**
 * Gate: page footers show the current year, never a hardcoded one. Several
 * footers still said "© 2025" in late 2026 (Mete, 2026-11-17: "those should
 * be dynamically generated"). Write `© {new Date().getFullYear()}` instead.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";

const ROOT = resolve(__dirname, "../../../..");
const DIRS = ["frontend/src", "mobile/src", "dashboard/src"];
const BANNED = /(©|&copy;|\\u00a9)\s*(\{["'`])?\s*(19|20)\d\d/i;

function files(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((f) => {
    const p = resolve(dir, f);
    if (f === "__tests__" || f === "node_modules") return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("copyright year gate", () => {
  it("no footer hardcodes a copyright year", () => {
    const hits = DIRS.flatMap((d) => files(resolve(ROOT, d))).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) => (BANNED.test(line) ? [`${relative(ROOT, f)}:${i + 1}`] : [])),
    );
    expect(hits, "use © {new Date().getFullYear()}").toEqual([]);
  });
});
