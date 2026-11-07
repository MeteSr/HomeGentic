#!/usr/bin/env node
// Diff coverage: of the executable lines a PR adds or changes in frontend
// source, at least --threshold percent must be run by a unit test. The
// project-wide floor in frontend/vite.config.ts stops coverage dropping; this
// stops new code arriving without tests (TDD, test-gap audit 2026-11-03).
//
//   node scripts/ci/diff-coverage.mjs --lcov frontend/coverage/lcov.info \
//     --base origin/main [--threshold 80]
//
// A line counts when lcov lists it (DA) for that file. A changed source file
// no test loads is missing from lcov, so all its changed lines count as
// uncovered. Tests themselves, declarations and generated types are left out.
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

/** lcov text → Map<repo-relative path, Map<line, hits>>. */
export function parseLcov(text, { repoRoot, lcovRoot }) {
  const out = new Map();
  let file = null;
  for (const line of text.split("\n")) {
    if (line.startsWith("SF:")) {
      const sf = line.slice(3).trim();
      const abs = isAbsolute(sf) ? sf : resolve(repoRoot, lcovRoot, sf);
      file = relative(repoRoot, abs).split("\\").join("/");
      if (!out.has(file)) out.set(file, new Map());
    } else if (line.startsWith("DA:") && file) {
      const [n, hits] = line.slice(3).split(",");
      out.get(file).set(Number(n), Number(hits));
    } else if (line.startsWith("end_of_record")) {
      file = null;
    }
  }
  return out;
}

/** `git diff --unified=0` text → Map<new path, added line numbers>. */
export function parseDiff(text) {
  const out = new Map();
  let file = null;
  let next = 0;
  for (const line of text.split("\n")) {
    if (line.startsWith("+++ ")) {
      const p = line.slice(4).trim();
      file = p === "/dev/null" ? null : p.replace(/^b\//, "");
      if (file && !out.has(file)) out.set(file, []);
      continue;
    }
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (!file || line.startsWith("---")) continue;
    if (line.startsWith("+")) out.get(file).push(next++);
  }
  for (const [f, lines] of out) if (lines.length === 0) out.delete(f);
  return out;
}

/** Covered share of changed executable lines in the files `include` matches. */
export function diffCoverage(cov, diff, { include, exclude }) {
  let total = 0;
  let covered = 0;
  const uncovered = [];
  const unloaded = [];
  for (const [file, lines] of diff) {
    if (!include.test(file) || exclude.test(file)) continue;
    const hits = cov.get(file);
    if (!hits) {
      unloaded.push(file);
      total += lines.length;
      uncovered.push(...lines.map((n) => `${file}:${n}`));
      continue;
    }
    for (const n of lines) {
      if (!hits.has(n)) continue;
      total++;
      if (hits.get(n) > 0) covered++;
      else uncovered.push(`${file}:${n}`);
    }
  }
  const percent = total === 0 ? 100 : Math.round((covered / total) * 1000) / 10;
  return { total, covered, percent, uncovered, unloaded };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}

/** Collapse consecutive line numbers: a.ts:3-7, a.ts:12. */
function ranges(list) {
  const out = [];
  for (const item of list) {
    const [f, n] = [item.slice(0, item.lastIndexOf(":")), Number(item.slice(item.lastIndexOf(":") + 1))];
    const last = out[out.length - 1];
    if (last && last.f === f && last.to === n - 1) last.to = n;
    else out.push({ f, from: n, to: n });
  }
  return out.map((r) => `${r.f}:${r.from}${r.to > r.from ? `-${r.to}` : ""}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
  const lcovPath = arg("lcov", "frontend/coverage/lcov.info");
  const base = arg("base", "origin/main");
  const threshold = Number(arg("threshold", "80"));
  const cov = parseLcov(readFileSync(resolve(repoRoot, lcovPath), "utf8"), { repoRoot, lcovRoot: "frontend" });
  const mergeBase = execFileSync("git", ["merge-base", base, "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
  const diff = parseDiff(
    execFileSync("git", ["diff", "--unified=0", "--no-color", mergeBase, "--", "frontend/src", "packages/shared/src"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }),
  );
  const r = diffCoverage(cov, diff, {
    include: /^(frontend\/src|packages\/shared\/src)\/.*\.(ts|tsx)$/,
    exclude: /__tests__|\.test\.|\.d\.ts$|^packages\/shared\/src\/(declarations|types)\//,
  });
  console.log(
    `Diff coverage: ${r.covered}/${r.total} changed executable lines run by a test (${r.percent}%, need ${threshold}%)`,
  );
  if (r.unloaded.length) console.log(`No test loads: ${r.unloaded.join(", ")}`);
  if (r.percent < threshold) {
    console.log("Not covered:");
    for (const line of ranges(r.uncovered).slice(0, 200)) console.log(`  ${line}`);
    console.log("Write tests for the new code first (TDD), then make them pass.");
    process.exit(1);
  }
}
