/**
 * scripts/ci/diff-coverage.mjs (test-gap audit 2026-11-03, TDD gate): of
 * the executable lines a PR adds or changes in frontend source, at least
 * the threshold share must be run by a test.
 */

import { describe, it, expect } from "vitest";
// @ts-expect-error plain ESM module without types
import { parseLcov, parseDiff, diffCoverage } from "../../../../scripts/ci/diff-coverage.mjs";

const LCOV = `TN:
SF:/repo/frontend/src/services/a.ts
DA:1,1
DA:2,0
DA:3,4
DA:5,0
end_of_record
SF:src/services/b.ts
DA:10,1
end_of_record
`;

const DIFF = `diff --git a/frontend/src/services/a.ts b/frontend/src/services/a.ts
--- a/frontend/src/services/a.ts
+++ b/frontend/src/services/a.ts
@@ -1,0 +1,3 @@
+one
+two
+three
@@ -9 +5,2 @@
-old
+five
+six (a blank or comment line: not in lcov)
diff --git a/frontend/src/services/b.ts b/frontend/src/services/b.ts
--- a/frontend/src/services/b.ts
+++ b/frontend/src/services/b.ts
@@ -10 +10 @@
-x
+y
diff --git a/frontend/src/__tests__/x.test.ts b/frontend/src/__tests__/x.test.ts
+++ b/frontend/src/__tests__/x.test.ts
@@ -0,0 +1 @@
+test
diff --git a/frontend/src/gone.ts b/frontend/src/gone.ts
+++ /dev/null
@@ -1 +0,0 @@
-bye
`;

describe("parseLcov", () => {
  it("maps each file, absolute or relative, to repo-relative paths with per-line hits", () => {
    const cov = parseLcov(LCOV, { repoRoot: "/repo", lcovRoot: "frontend" });
    expect([...cov.keys()].sort()).toEqual(["frontend/src/services/a.ts", "frontend/src/services/b.ts"]);
    expect(cov.get("frontend/src/services/a.ts")).toEqual(
      new Map([
        [1, 1],
        [2, 0],
        [3, 4],
        [5, 0],
      ]),
    );
  });
});

describe("parseDiff", () => {
  it("collects added line numbers per new file, ignoring deleted files", () => {
    const d = parseDiff(DIFF);
    expect(d.get("frontend/src/services/a.ts")).toEqual([1, 2, 3, 5, 6]);
    expect(d.get("frontend/src/services/b.ts")).toEqual([10]);
    expect(d.has("frontend/src/gone.ts")).toBe(false);
  });
});

describe("diffCoverage", () => {
  const cov = parseLcov(LCOV, { repoRoot: "/repo", lcovRoot: "frontend" });

  it("counts only changed lines lcov calls executable, skipping test files", () => {
    const r = diffCoverage(cov, parseDiff(DIFF), { include: /^frontend\/src\//, exclude: /__tests__|\.test\./ });
    // a.ts: 1 (hit), 2 (miss), 3 (hit), 5 (miss); 6 not executable. b.ts: 10 (hit).
    expect(r.total).toBe(5);
    expect(r.covered).toBe(3);
    expect(r.percent).toBe(60);
    expect(r.uncovered).toEqual(["frontend/src/services/a.ts:2", "frontend/src/services/a.ts:5"]);
  });

  it("a changed source file no test loads at all counts every changed line as uncovered", () => {
    const r = diffCoverage(new Map(), parseDiff(DIFF), { include: /^frontend\/src\/services\/b/, exclude: /x^/ });
    expect(r.total).toBe(1);
    expect(r.covered).toBe(0);
    expect(r.unloaded).toEqual(["frontend/src/services/b.ts"]);
  });

  it("is 100% when no executable line changed", () => {
    const r = diffCoverage(cov, new Map(), { include: /./, exclude: /x^/ });
    expect(r).toMatchObject({ total: 0, covered: 0, percent: 100 });
  });
});
