#!/usr/bin/env node
/**
 * 13.1.2 — Cycles baseline: update calls
 *
 * Calls each write endpoint once (or N times with --repeat N) and records
 * wall-clock latency + estimated cycles cost.
 *
 * Update calls go through consensus — expect 1-3 seconds per call on mainnet.
 * On a local replica the latency is ~200-500ms.
 *
 * Usage:
 *   node scripts/benchmark-updates.mjs                  # dry-run (no replica)
 *   node scripts/benchmark-updates.mjs --live           # requires running dfx replica
 *   node scripts/benchmark-updates.mjs --repeat 3       # repeat each call 3×
 *   node scripts/benchmark-updates.mjs --csv            # CSV only
 *
 * Output columns:
 *   canister, method, mode, latency_p50_ms, latency_p99_ms, cycles_estimate, usd_per_1k_calls
 *
 * Cycles estimation model (ICP mainnet, 2024):
 *   Update call base cost:    590_000 cycles (same as query — ingress fee)
 *   Consensus overhead:     3_000_000 cycles (per-round consensus cost)
 *   Instruction cost:       ~200_000 cycles per 1M instructions executed
 *   Storage write:            127_000 cycles per KB written to stable memory
 *   USD per trillion cycles:       $1.39
 */

import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ─── ICP pricing constants ────────────────────────────────────────────────────

const UPDATE_BASE_CYCLES       = 590_000n;         // ingress fee
const CONSENSUS_CYCLES         = 3_000_000n;       // per-round consensus
const STORAGE_WRITE_PER_KB     = 127_000n;         // stable memory write
const USD_PER_TRILLION         = 1.39;
const CYCLES_PER_TRILLION      = 1_000_000_000_000n;

function estimateCycles(writeSizeKB = 0, instructionsM = 0) {
  const storageWrite = BigInt(Math.ceil(writeSizeKB)) * STORAGE_WRITE_PER_KB;
  const instructions = BigInt(Math.ceil(instructionsM * 200_000));
  return UPDATE_BASE_CYCLES + CONSENSUS_CYCLES + storageWrite + instructions;
}

function cyclesToUsd(cycles) {
  return Number(cycles) / Number(CYCLES_PER_TRILLION) * USD_PER_TRILLION;
}

// ─── Benchmark targets ────────────────────────────────────────────────────────

const UPDATE_TARGETS = [
  // job canister — createJob
  {
    canister: "job",
    method: "createJob",
    dfxArgs: '("1", "HVAC check", variant { HVAC }, "Annual service", null, 25000 : nat, 1672531200000000000 : int, null, null, false)',
    writeSizeKB: 2,        // one Job record ≈ 1-2KB
    instructionsM: 0.5,    // simple HashMap.add
    description: "Create a maintenance job record",
  },
  // report canister — generateReport (snapshot + share link)
  {
    canister: "report",
    method: "generateReport",
    dfxArgs: '("1", record { address = "123 Main St"; city = "Austin"; state = "TX"; zipCode = "78701"; propertyType = "SingleFamily"; yearBuilt = 2000 : nat; squareFeet = 2000 : nat; verificationLevel = "Basic" }, vec {}, vec {}, null, variant { Public }, null, null, null, null, null)',
    writeSizeKB: 8,        // snapshot ≈ 4KB + share link ≈ 512B + randomness call
    instructionsM: 1.0,    // snapshot serialization + random ID generation
    description: "Generate report snapshot and share link",
  },
  // recurring service canister — addVisitLog
  {
    canister: "recurring",
    method: "addVisitLog",
    dfxArgs: '("svc-1", "2024-01-15", "Completed spring HVAC service")',
    writeSizeKB: 1,
    instructionsM: 0.3,
    description: "Log a recurring service visit",
  },
  // recurring service canister — createRecurringService
  {
    canister: "recurring",
    method: "createRecurringService",
    dfxArgs: '("1", "Pest Control", "PestAway Inc", variant { Monthly }, "2024-01-01")',
    writeSizeKB: 1,
    instructionsM: 0.3,
    description: "Create a recurring service contract",
  },
  // quote canister — createRequest
  {
    canister: "quote",
    method: "createRequest",
    dfxArgs: '("1", variant { HVAC }, "HVAC replacement needed", 500000 : nat, null)',
    writeSizeKB: 1,
    instructionsM: 0.3,
    description: "Create a new quote request",
  },
  // monitoring canister — recordCanisterMetrics
  {
    canister: "monitoring",
    method: "recordCanisterMetrics",
    dfxArgs: '(principal "aaaaa-aa", 5000000000000 : nat, 10000000 : nat, 100000000 : nat, 1000000000 : nat, 100 : nat, 0 : nat, 50 : nat)',
    writeSizeKB: 0.5,
    instructionsM: 0.2,
    description: "Record canister metrics snapshot",
  },
  // photo canister — uploadPhoto (with SHA-256 dedup overhead)
  {
    canister: "photo",
    method: "uploadPhoto",
    dfxArgs: '("1", "job-1", blob "\\00\\01\\02\\03", "image/jpeg")',
    writeSizeKB: 4,        // small test photo; real photos larger
    instructionsM: 0.8,    // SHA-256 + dedup check + tier quota check
    description: "Upload a photo (with SHA-256 dedup + tier check)",
  },
];

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const LIVE     = args.includes("--live");
const CSV_ONLY = args.includes("--csv");
const REPEAT   = parseInt(args[args.indexOf("--repeat") + 1] ?? "3", 10) || 3;

// ─── Percentile ───────────────────────────────────────────────────────────────

function percentile(sorted, p) {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

// ─── Runner ───────────────────────────────────────────────────────────────────

function runDfxCall(canister, method, dfxArgs) {
  const cmd = `dfx canister call ${canister} ${method} '${dfxArgs}' --network local 2>/dev/null`;
  const t0 = performance.now();
  try {
    execSync(cmd, { timeout: 30_000, stdio: "pipe" });
    return { ok: true, latencyMs: performance.now() - t0 };
  } catch {
    return { ok: false, latencyMs: performance.now() - t0 };
  }
}

async function runDryCall() {
  // Simulate consensus latency (local replica: 200-500ms; mainnet: 1000-3000ms)
  const t0 = performance.now();
  await new Promise((r) => setTimeout(r, 200 + Math.random() * 100));
  return { ok: true, latencyMs: performance.now() - t0, dry: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const results = [];

if (!CSV_ONLY) {
  console.log(`\n${"═".repeat(72)}`);
  console.log(`  HomeGentic — Update Baseline (13.1.2)   mode=${LIVE ? "LIVE" : "DRY-RUN"}   repeat=${REPEAT}`);
  console.log(`${"═".repeat(72)}\n`);
  if (!LIVE) {
    console.log("  Note: dry-run latency simulates local-replica consensus (~200ms).");
    console.log("  Run with --live against a deployed replica for real measurements.\n");
  }
}

for (const target of UPDATE_TARGETS) {
  const latencies = [];

  for (let i = 0; i < REPEAT; i++) {
    const result = LIVE
      ? runDfxCall(target.canister, target.method, target.dfxArgs)
      : await runDryCall();
    latencies.push(result.latencyMs);
  }

  latencies.sort((a, b) => a - b);
  const p50  = percentile(latencies, 50);
  const p99  = percentile(latencies, 99);
  const mode = LIVE ? "live" : "dry-run";

  const cycles      = estimateCycles(target.writeSizeKB, target.instructionsM);
  const usdPer1k    = cyclesToUsd(cycles) * 1000;
  const flagAbove1B = cycles > 1_000_000_000n ? "⚠ REVIEW" : "";

  results.push({ ...target, p50, p99, cycles: Number(cycles), usdPer1k, mode, flagAbove1B });

  if (!CSV_ONLY) {
    const flagStr = flagAbove1B ? `  ${flagAbove1B}` : "";
    console.log(`  ${target.canister}.${target.method.padEnd(28)} p50=${p50.toFixed(0).padStart(6)}ms  ~${(Number(cycles)/1e6).toFixed(1)}M cycles${flagStr}`);
  }
}

// ─── Top-3 by cycles ──────────────────────────────────────────────────────────

const sorted = [...results].sort((a, b) => b.cycles - a.cycles);

if (!CSV_ONLY) {
  console.log(`\n── Top-3 cycles-heaviest update calls ────────────────────────────────────\n`);
  for (const r of sorted.slice(0, 3)) {
    console.log(`  ${r.cycles > 1_000_000_000 ? "⚠" : " "} ${r.canister}.${r.method}: ${(r.cycles/1e6).toFixed(1)}M cycles  ($${r.usdPer1k.toFixed(4)}/1k calls)`);
  }
  console.log();
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

const CSV_HEADER = "canister,method,mode,latency_p50_ms,latency_p99_ms,cycles_estimate,usd_per_1k_calls,flag";
const csvLines = results.map((r) =>
  `${r.canister},${r.method},${r.mode},${r.p50.toFixed(2)},${r.p99.toFixed(2)},${r.cycles},${r.usdPer1k.toFixed(6)},${r.flagAbove1B}`
);

if (CSV_ONLY) {
  console.log(CSV_HEADER);
  csvLines.forEach((l) => console.log(l));
} else {
  const outPath = resolve(ROOT, "tests", "perf-baselines", "update-baseline.csv");
  try {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(resolve(ROOT, "tests", "perf-baselines"), { recursive: true });
    writeFileSync(outPath, [CSV_HEADER, ...csvLines].join("\n") + "\n");
    console.log(`  CSV written → ${outPath}\n`);
  } catch {
    console.log("  (Could not write CSV — printed to stdout)\n");
    console.log(CSV_HEADER);
    csvLines.forEach((l) => console.log(l));
  }
}
