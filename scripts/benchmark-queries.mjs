#!/usr/bin/env node
/**
 * 13.1.1 — Cycles baseline: query calls
 *
 * Calls each read endpoint once (or N times with --repeat N) and records
 * wall-clock latency + cycles cost.
 *
 * Usage:
 *   node scripts/benchmark-queries.mjs                  # dry-run (no replica)
 *   node scripts/benchmark-queries.mjs --live           # requires a running dfx
 *                                                        # replica, deployed and
 *                                                        # wired via scripts/ci/
 *                                                        # deploy-canisters.sh +
 *                                                        # seed-perf-data.sh
 *   node scripts/benchmark-queries.mjs --repeat 5       # repeat each call 5× for avg
 *   node scripts/benchmark-queries.mjs --csv            # output CSV only (no headers)
 *
 * Output columns:
 *   canister, method, mode, latency_p50_ms, latency_p99_ms, cycles_estimate, usd_per_1k_calls
 *
 * Cycles accounting:
 *   Query execution itself is not cycle-metered on IC (it's answered by a
 *   boundary node without going through consensus), so there's no balance
 *   delta to measure the way update calls have one. What --live *can*
 *   measure directly is the actual response payload size, which is the
 *   dominant variable in the per-KB cost model below — a diff that grows a
 *   query's response (more fields, more rows) now shows up here even though
 *   the raw cycles number is still an estimate, not a metered charge.
 *
 *   Dry-run (no replica) has no real response to measure and falls back
 *   fully to the static per-target byte-size guesses.
 *
 *   ICP mainnet pricing (2024) backing the estimate:
 *     Query call base cost: 590_000 cycles
 *     Each KB of argument/response: ~1_000 cycles
 *     USD per trillion cycles: $1.39
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── ICP pricing constants ────────────────────────────────────────────────────

const QUERY_BASE_CYCLES    = 590_000n;
const CYCLES_PER_KB_ARG    = 1_000n;
const USD_PER_TRILLION     = 1.39;
const CYCLES_PER_TRILLION  = 1_000_000_000_000n;

function estimateCycles(argSizeBytes = 0, responseSizeBytes = 0) {
  const argKb  = BigInt(Math.ceil(argSizeBytes  / 1024));
  const resKb  = BigInt(Math.ceil(responseSizeBytes / 1024));
  return QUERY_BASE_CYCLES + (argKb + resKb) * CYCLES_PER_KB_ARG;
}

function cyclesToUsd(cycles) {
  return Number(cycles) / Number(CYCLES_PER_TRILLION) * USD_PER_TRILLION;
}

// ─── Seeded IDs (populated by scripts/ci/seed-perf-data.sh in --live mode) ────

function seededIds() {
  return {
    propertyId:  process.env.PERF_PROPERTY_ID  || "1",
    jobId:       process.env.PERF_JOB_ID       || "job-1",
    reportToken: process.env.PERF_REPORT_TOKEN || "RPT_mock_token",
  };
}

// ─── Benchmark targets ────────────────────────────────────────────────────────
// dfxArgs is a function of `ids` so --live calls use real seeded records
// instead of placeholder literals that don't exist in any canister.

const QUERY_TARGETS = [
  // property canister
  {
    canister: "property",
    method: "getMyProperties",
    dfxArgs: () => "()",
    argSizeBytes: 4,
    responseSizeBytes: 512,   // typical: 1-5 properties
    description: "Load homeowner property list",
  },
  // job canister (a `shared` call, not `query`, but still read-only)
  {
    canister: "job",
    method: "getJobsForProperty",
    dfxArgs: (ids) => `("${ids.propertyId}")`,
    argSizeBytes: 8,
    responseSizeBytes: 4096,  // typical: 10-50 jobs
    description: "Load all jobs for one property",
  },
  // report canister (a `shared` call, not `query`, but still read-only)
  {
    canister: "report",
    method: "getReport",
    dfxArgs: (ids) => `("${ids.reportToken}")`,
    argSizeBytes: 24,
    responseSizeBytes: 8192,  // snapshot with 20 jobs
    description: "Retrieve report snapshot by token",
  },
  // maintenance canister (seasonal tasks)
  {
    canister: "maintenance",
    method: "getSeasonalTasks",
    dfxArgs: () => "(2000 : nat)",
    argSizeBytes: 8,
    responseSizeBytes: 2048,  // seasonal task list
    description: "Get seasonal maintenance tasks for property age",
  },
  // maintenance canister (predict)
  {
    canister: "maintenance",
    method: "predictMaintenance",
    dfxArgs: () => `(2000 : nat, vec { record { serviceType = "HVAC"; completedYear = 2018 : nat } })`,
    argSizeBytes: 32,
    responseSizeBytes: 4096,  // 8 system predictions
    description: "Predict maintenance needs for 8 systems",
  },
  // market canister
  {
    canister: "market",
    method: "recommendValueAddingProjects",
    dfxArgs: () =>
      `(record { yearBuilt = 2000 : nat; squareFeet = 2000 : nat; propertyType = "SingleFamily"; state = "TX"; zipCode = "78701" }, vec {}, 0 : nat)`,
    argSizeBytes: 128,
    responseSizeBytes: 2048,
    description: "Get project recommendations",
  },
  // monitoring canister
  {
    canister: "monitoring",
    method: "getMetrics",
    dfxArgs: () => "()",
    argSizeBytes: 4,
    responseSizeBytes: 64,
    description: "Read monitoring metrics",
  },
  // quote canister
  {
    canister: "quote",
    method: "getOpenRequests",
    dfxArgs: () => "()",
    argSizeBytes: 4,
    responseSizeBytes: 1024,
    description: "List all open quote requests",
  },
];

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const LIVE    = args.includes("--live");
const CSV_ONLY = args.includes("--csv");
const REPEAT  = parseInt(args[args.indexOf("--repeat") + 1] ?? "3", 10) || 3;

// ─── Percentile helper ────────────────────────────────────────────────────────

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function runDfxCall(canister, method, dfxArgs) {
  const cmd = `dfx canister call ${canister} ${method} '${dfxArgs}' --network local`;
  const t0 = performance.now();
  try {
    const out = execSync(cmd, { timeout: 15_000, stdio: "pipe" }).toString();
    return { ok: true, latencyMs: performance.now() - t0, responseSizeBytes: Buffer.byteLength(out, "utf-8") };
  } catch (e) {
    const detail = (e.stderr?.toString() || e.stdout?.toString() || e.message || "").trim();
    console.error(`  ✗ ${canister}.${method} failed: ${detail}`);
    return { ok: false, latencyMs: performance.now() - t0, responseSizeBytes: 0 };
  }
}

async function runDryCall() {
  // Simulate call overhead without a live replica
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 1 + Math.random() * 2));
  return { ok: true, latencyMs: performance.now() - t0, dry: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const results = [];
const ids = seededIds();

if (!CSV_ONLY) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  HomeGentic — Query Baseline (13.1.1)   mode=${LIVE ? "LIVE" : "DRY-RUN"}   repeat=${REPEAT}`);
  console.log(`${"═".repeat(72)}\n`);
}

for (const target of QUERY_TARGETS) {
  const latencies = [];
  const responseSizes = [];
  let anyFailed = false;

  for (let i = 0; i < REPEAT; i++) {
    if (LIVE) {
      const result = runDfxCall(target.canister, target.method, target.dfxArgs(ids));
      if (!result.ok) anyFailed = true;
      latencies.push(result.latencyMs);
      responseSizes.push(result.responseSizeBytes);
    } else {
      const result = await runDryCall();
      latencies.push(result.latencyMs);
    }
  }

  latencies.sort((a, b) => a - b);
  const p50  = percentile(latencies, 50);
  const p99  = percentile(latencies, 99);
  const mode = LIVE ? "live" : "dry-run";

  const measuredResponseBytes = LIVE && responseSizes.length > 0
    ? responseSizes.reduce((a, b) => a + b, 0) / responseSizes.length
    : target.responseSizeBytes;

  const cycles       = estimateCycles(target.argSizeBytes, measuredResponseBytes);
  const usdPer1k     = cyclesToUsd(cycles) * 1000;
  const flagAbove1B  = cycles > 1_000_000_000n ? "⚠ REVIEW" : "";

  results.push({ ...target, p50, p99, cycles: Number(cycles), usdPer1k, mode, flagAbove1B, anyFailed });

  if (!CSV_ONLY) {
    const flagStr = flagAbove1B ? `  ${flagAbove1B}` : "";
    const failStr = anyFailed ? "  ✗ CALL FAILED" : "";
    console.log(`  ${target.canister}.${target.method.padEnd(32)} p50=${p50.toFixed(1).padStart(7)}ms  p99=${p99.toFixed(1).padStart(7)}ms  ~${(Number(cycles)/1e6).toFixed(1)}M cycles${flagStr}${failStr}`);
  }
}

if (LIVE && results.some((r) => r.anyFailed)) {
  console.error("\n❌ One or more live query calls failed — cycles numbers for those targets are unreliable.");
  console.error("   Re-run scripts/ci/deploy-canisters.sh + seed-perf-data.sh and check dfx replica logs.\n");
  process.exitCode = 1;
}

// ─── Sort by cycles (desc) and show top-3 ────────────────────────────────────

const sorted = [...results].sort((a, b) => b.cycles - a.cycles);

if (!CSV_ONLY) {
  console.log(`\n── Top-3 cycles-heaviest query calls ─────────────────────────────────────\n`);
  for (const r of sorted.slice(0, 3)) {
    console.log(`  ${r.cycles > 1_000_000_000 ? "⚠" : " "} ${r.canister}.${r.method}: ${(r.cycles/1e6).toFixed(1)}M cycles  ($${r.usdPer1k.toFixed(4)}/1k calls)`);
  }
  console.log();
}

// ─── CSV output ───────────────────────────────────────────────────────────────

const CSV_HEADER = "canister,method,mode,latency_p50_ms,latency_p99_ms,cycles_estimate,usd_per_1k_calls,flag";
const csvLines = results.map((r) =>
  `${r.canister},${r.method},${r.mode},${r.p50.toFixed(2)},${r.p99.toFixed(2)},${r.cycles},${r.usdPer1k.toFixed(6)},${r.flagAbove1B}`
);

if (CSV_ONLY) {
  console.log(CSV_HEADER);
  csvLines.forEach((l) => console.log(l));
} else {
  const outPath = resolve(ROOT, "tests", "perf-baselines", "query-baseline.csv");
  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(resolve(ROOT, "tests", "perf-baselines"), { recursive: true });
    writeFileSync(outPath, [CSV_HEADER, ...csvLines].join("\n") + "\n");
    console.log(`  CSV written → ${outPath}\n`);
  } catch {
    console.log(`  (Could not write CSV — print to stdout instead)\n`);
    console.log(CSV_HEADER);
    csvLines.forEach((l) => console.log(l));
  }
}
