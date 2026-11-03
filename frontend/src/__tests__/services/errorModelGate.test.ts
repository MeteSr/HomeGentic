/**
 * Gate (test-gap audit 2026-11-03): client services turn a canister's #err
 * into a typed CanisterError (CLAUDE.md, "Errors"), never an Error whose
 * message is the variant serialised as JSON. That JSON reached toasts as
 * `{"InvalidInput":"…"}` and defeated hasErrorCode / isRetryable.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, relative } from "path";

const ROOT = resolve(__dirname, "../../../..");
const DIRS = ["frontend/src/services", "mobile/src", "dashboard/src", "packages/shared/src"];
const BANNED = /new Error\(\s*JSON\.stringify\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = resolve(dir, f);
    if (f === "__tests__" || f === "node_modules") return [];
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("error model gate", () => {
  it("no client code throws a canister error as JSON text", () => {
    const hits = DIRS.flatMap((d) => files(resolve(ROOT, d))).flatMap((f) =>
      readFileSync(f, "utf8")
        .split("\n")
        .flatMap((line, i) => (BANNED.test(line) ? [`${relative(ROOT, f)}:${i + 1}`] : [])),
    );
    expect(hits, "throw canisterError(result.err) instead").toEqual([]);
  });
});
