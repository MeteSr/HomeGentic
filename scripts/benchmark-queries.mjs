#!/usr/bin/env node
/**
 * 13.1.1 — Cycles baseline: query calls
 *
 * Calls each read endpoint once (or N times with --repeat N) and records
 * wall-clock latency + estimated cycles cost.
 *
 * Usage:
 *   node scripts/benchmark-queries.mjs                  # dry-run (no replica)
 *   node scripts/benchmark-queries.mjs --live           # requires running dfx replica
 *   node scripts/benchmark-queries.mjs --repeat 5       # repeat each call 5× for avg
 *   node scripts/benchmark-queries.mjs --csv            # output CSV only (no headers)
 *
 * Output columns:
 *   canister, method, mode, latency_p50_ms, latency_p99_ms, cycles_estimate, usd_per_1k_calls
 *
 * Cycles estimation model (ICP mainnet, 2024):
 *   Query call base cost: 590_000 cycles
 *   Each KB of argument/response: ~1_000 cycles
 *   USD per trillion cycles: $1.39
 */

import { execSync } from "node:child_process";
import { writeFileSync, appendFileSync, existsSync } from "node:fs";
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

// ─── Benchmark targets ────────────────────────────────────────────────────────

// Each entry: { canister, method, dfxArgs, argSizeBytes, responseSizeBytes }
const QUERY_TARGETS = [
  // property canister
  {
    canister: "property",
    method: "getMyProperties",
    dfxArgs: "()",
    argSizeBytes: 4,
    responseSizeBytes: 512,   // typical: 1-5 properties
    description: "Load homeowner property list",
  },
  // job canister
  {
    canister: "job",
    method: "getJobsForProperty",
    dfxArgs: '("1")',
    argSizeBytes: 8,
    responseSizeBytes: 4096,  // typical: 10-50 jobs
    description: "Load all jobs for one property",
  },
  // report canister
  {
    canister: "report",
    method: "getReport",
    dfxArgs: '("RPT_mock_token")',
    argSizeBytes: 24,
    responseSizeBytes: 8192,  // snapshot with 20 jobs
    description: "Retrieve report snapshot by token",
  },
  // maintenance canister (seasonal tasks)
  {
    canister: "maintenance",
    method: "getSeasonalTasks",
    dfxArgs: "(2000 : nat)",
    argSizeBytes: 8,
    responseSizeBytes: 2048,  // seasonal task list
    description: "Get seasonal maintenance tasks for property age",
  },
  // maintenance canister (predict)
  {
    canister: "maintenance",
    method: "predictMaintenance",
    dfxArgs: "(2000 : nat, vec {}, null)",
    argSizeBytes: 32,
    responseSizeBytes: 4096,  // 8 system predictions
    description: "Predict maintenance needs for 8 systems",
  },
  // market canister
  {
    canister: "market",
    method: "recommendValueAddingProjects",
    dfxArgs: '(record { yearBuilt = 2000 : nat; squareFeet = 2000 : nat; propertyType = "SingleFamily"; state = "TX"; zipCode = "78701" }, vec {}, 0 : nat)',
    argSizeBytes: 128,
    responseSizeBytes: 2048,
    description: "Get project recommendations",
  },
  // monitoring canister
  {
    canister: "monitoring",
    method: "getMetrics",
    dfxArgs: "()",
    argSizeBytes: 4,
    responseSizeBytes: 64,
    description: "Read monitoring metrics",
  },
  // quote canister
  {
    canister: "quote",
    method: "getOpenRequests",
    dfxArgs: "()",
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
  const cmd = `dfx canister call ${canister} ${method} '${dfxArgs}' --network local 2>/dev/null`;
  const t0 = performance.now();
  try {
    execSync(cmd, { timeout: 15_000, stdio: "pipe" });
    return { ok: true, latencyMs: performance.now() - t0 };
  } catch {
    return { ok: false, latencyMs: performance.now() - t0 };
  }
}

async function runDryCall(target) {
  // Simulate call overhead without a live replica
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 1 + Math.random() * 2));
  return { ok: true, latencyMs: performance.now() - t0, dry: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const results = [];

if (!CSV_ONLY) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  HomeGentic — Query Baseline (13.1.1)   mode=${LIVE ? "LIVE" : "DRY-RUN"}   repeat=${REPEAT}`);
  console.log(`${"═".repeat(72)}\n`);
}

for (const target of QUERY_TARGETS) {
  const latencies = [];

  for (let i = 0; i < REPEAT; i++) {
    const result = LIVE
      ? runDfxCall(target.canister, target.method, target.dfxArgs)
      : await runDryCall(target);
    latencies.push(result.latencyMs);
  }

  latencies.sort((a, b) => a - b);
  const p50  = percentile(latencies, 50);
  const p99  = percentile(latencies, 99);
  const mode = LIVE ? "live" : "dry-run";

  const cycles       = estimateCycles(target.argSizeBytes, target.responseSizeBytes);
  const usdPer1k     = cyclesToUsd(cycles) * 1000;
  const flagAbove1B  = cycles > 1_000_000_000n ? "⚠ REVIEW" : "";

  results.push({ ...target, p50, p99, cycles: Number(cycles), usdPer1k, mode, flagAbove1B });

  if (!CSV_ONLY) {
    const flagStr = flagAbove1B ? `  ${flagAbove1B}` : "";
    console.log(`  ${target.canister}.${target.method.padEnd(32)} p50=${p50.toFixed(1).padStart(7)}ms  p99=${p99.toFixed(1).padStart(7)}ms  ~${(Number(cycles)/1e6).toFixed(1)}M cycles${flagStr}`);
  }
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
