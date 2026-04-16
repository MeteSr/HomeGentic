/**
 * TDD — 13.1.3: Identify top-3 cycles-heavy operations
 *
 * Validates the ICP cycles cost model used by the benchmark scripts (13.1.1 + 13.1.2),
 * verifies that the scripts exist and produce correct CSV format, and runs the
 * cost model over all known operations to:
 *   - Sort by estimated cycles (desc)
 *   - Flag any call above 1B cycles as a review candidate
 *   - Assert the top-3 heaviest are in expected positions
 *
 * Also validates that 13.1.4 infrastructure is present in monitoring canister.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

// ─── ICP cost model (mirrors benchmark scripts) ───────────────────────────────

const QUERY_BASE_CYCLES   = 590_000;
const UPDATE_BASE_CYCLES  = 590_000;
const CONSENSUS_CYCLES    = 3_000_000;
const STORAGE_PER_KB      = 127_000;
const CYCLES_PER_KB_ARG   = 1_000;
const USD_PER_TRILLION    = 1.39;
const TRILLION            = 1_000_000_000_000;
const REVIEW_THRESHOLD    = 1_000_000_000;   // 1B cycles

function queryEstimate(argSizeBytes: number, responseSizeBytes: number): number {
  return QUERY_BASE_CYCLES
    + Math.ceil(argSizeBytes / 1024) * CYCLES_PER_KB_ARG
    + Math.ceil(responseSizeBytes / 1024) * CYCLES_PER_KB_ARG;
}

function updateEstimate(writeSizeKB: number, instructionsM: number): number {
  return UPDATE_BASE_CYCLES
    + CONSENSUS_CYCLES
    + Math.ceil(writeSizeKB) * STORAGE_PER_KB
    + Math.ceil(instructionsM * 200_000);
}

function usdPer1kCalls(cycles: number): number {
  return (cycles / TRILLION) * USD_PER_TRILLION * 1000;
}

// ─── Operation catalog ────────────────────────────────────────────────────────

interface Op {
  canister:    string;
  method:      string;
  type:        "query" | "update";
  cycles:      number;
  description: string;
}

const QUERY_OPS: Op[] = [
  { canister: "property",    method: "getMyProperties",              type: "query",  cycles: queryEstimate(4, 512),    description: "List homeowner properties" },
  { canister: "job",         method: "getJobsForProperty",           type: "query",  cycles: queryEstimate(8, 4096),   description: "Load all jobs for a property" },
  { canister: "report",      method: "getReport",                    type: "query",  cycles: queryEstimate(24, 8192),  description: "Retrieve report snapshot" },
  { canister: "maintenance", method: "getSeasonalTasks",             type: "query",  cycles: queryEstimate(8, 2048),   description: "Get seasonal tasks" },
  { canister: "maintenance", method: "predictMaintenance",           type: "query",  cycles: queryEstimate(32, 4096),  description: "Predict 8-system maintenance" },
  { canister: "market",      method: "recommendValueAddingProjects",  type: "query",  cycles: queryEstimate(128, 2048), description: "Get project recommendations" },
  { canister: "monitoring",  method: "getMetrics",                   type: "query",  cycles: queryEstimate(4, 64),     description: "Read monitoring metrics" },
  { canister: "quote",       method: "getOpenRequests",              type: "query",  cycles: queryEstimate(4, 1024),   description: "List open quote requests" },
];

const UPDATE_OPS: Op[] = [
  { canister: "job",        method: "createJob",                 type: "update", cycles: updateEstimate(2, 0.5),  description: "Create a maintenance job" },
  { canister: "report",     method: "generateReport",            type: "update", cycles: updateEstimate(8, 1.0),  description: "Generate snapshot + share link" },
  { canister: "recurring",  method: "addVisitLog",               type: "update", cycles: updateEstimate(1, 0.3),  description: "Log a recurring service visit" },
  { canister: "recurring",  method: "createRecurringService",    type: "update", cycles: updateEstimate(1, 0.3),  description: "Create recurring service contract" },
  { canister: "quote",      method: "createRequest",             type: "update", cycles: updateEstimate(1, 0.3),  description: "Create quote request" },
  { canister: "monitoring", method: "recordCanisterMetrics",     type: "update", cycles: updateEstimate(0.5, 0.2), description: "Record canister metrics" },
  { canister: "photo",      method: "uploadPhoto",               type: "update", cycles: updateEstimate(4, 0.8),  description: "Upload photo (SHA-256 + dedup)" },
];

const ALL_OPS = [...QUERY_OPS, ...UPDATE_OPS];
const sortedByDesc = [...ALL_OPS].sort((a, b) => b.cycles - a.cycles);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("13.1.3: cycles cost model validation", () => {

  it("query base cost is 590_000 cycles (ICP mainnet 2024)", () => {
    expect(QUERY_BASE_CYCLES).toBe(590_000);
  });

  it("update call adds consensus overhead of 3_000_000 cycles over query", () => {
    const queryCycles  = queryEstimate(0, 0);
    const updateCycles = updateEstimate(0, 0);
    expect(updateCycles - queryCycles).toBe(CONSENSUS_CYCLES);
  });

  it("storage write cost is 127_000 cycles per KB", () => {
    const withWrite    = updateEstimate(4, 0);
    const withoutWrite = updateEstimate(0, 0);
    expect(withWrite - withoutWrite).toBe(4 * STORAGE_PER_KB);
  });

  it("usdPer1kCalls gives a positive dollar amount for each operation", () => {
    for (const op of ALL_OPS) {
      expect(usdPer1kCalls(op.cycles)).toBeGreaterThan(0);
    }
  });

  it("all query calls are estimated below 1B cycles (none trigger review flag)", () => {
    for (const op of QUERY_OPS) {
      expect(op.cycles).toBeLessThan(REVIEW_THRESHOLD);
    }
  });

  it("update calls with large writes may approach but stay below 10B cycles", () => {
    for (const op of UPDATE_OPS) {
      expect(op.cycles).toBeLessThan(10 * REVIEW_THRESHOLD);
    }
  });
});

describe("13.1.3: top-3 cycles-heavy operation identification", () => {

  it("catalog contains all expected query and update methods", () => {
    const methods = ALL_OPS.map((o) => o.method);
    expect(methods).toContain("getMyProperties");
    expect(methods).toContain("predictMaintenance");
    expect(methods).toContain("generateReport");
    expect(methods).toContain("createJob");
    expect(methods).toContain("uploadPhoto");
    expect(methods).toContain("getOpenRequests");
  });

  it("top-3 heaviest ops are all update calls (consensus overhead dominates)", () => {
    for (const op of sortedByDesc.slice(0, 3)) {
      expect(op.type).toBe("update");
    }
  });

  it("generateReport is in the top-3 heaviest (snapshot + storage + randomness)", () => {
    const top3 = sortedByDesc.slice(0, 3).map((o) => o.method);
    expect(top3).toContain("generateReport");
  });

  it("getReport query cost is lower than generateReport update cost", () => {
    const getReportOp    = ALL_OPS.find((o) => o.method === "getReport")!;
    const genReportOp    = ALL_OPS.find((o) => o.method === "generateReport")!;
    expect(getReportOp.cycles).toBeLessThan(genReportOp.cycles);
  });

  it("operations above 1B cycles threshold are flagged for review", () => {
    const reviewCandidates = ALL_OPS.filter((o) => o.cycles > REVIEW_THRESHOLD);
    // Log them for visibility
    console.info("\n[13.1.3] Operations above 1B cycles (review candidates):");
    for (const op of reviewCandidates) {
      console.info(`  ⚠ ${op.canister}.${op.method}: ${(op.cycles / 1e6).toFixed(1)}M cycles`);
    }
    // Expectation: if any exist, they must be update calls (query calls should always be cheap)
    for (const op of reviewCandidates) {
      expect(op.type).toBe("update");
    }
  });

  it("prints a full cost table for audit visibility", () => {
    console.info("\n[13.1.3] Full operation cost table (sorted by cycles desc):");
    console.info("  " + ["method".padEnd(36), "type  ", "cycles (M)".padStart(12), "$/1k calls".padStart(12)].join("  "));
    console.info("  " + "─".repeat(72));
    for (const op of sortedByDesc) {
      const flag = op.cycles > REVIEW_THRESHOLD ? " ⚠" : "  ";
      console.info(
        `${flag} ${op.method.padEnd(36)}  ${op.type.padEnd(6)}  ${(op.cycles/1e6).toFixed(2).padStart(10)}  $${usdPer1kCalls(op.cycles).toFixed(5).padStart(10)}`
      );
    }
    console.info();
    expect(sortedByDesc.length).toBe(ALL_OPS.length);
  });
});

describe("13.1.1 + 13.1.2: benchmark scripts exist and have correct structure", () => {

  it("scripts/benchmark-queries.mjs exists", () => {
    expect(existsSync(resolve(ROOT, "scripts", "benchmark-queries.mjs"))).toBe(true);
  });

  it("scripts/benchmark-updates.mjs exists", () => {
    expect(existsSync(resolve(ROOT, "scripts", "benchmark-updates.mjs"))).toBe(true);
  });

  it("benchmark-queries.mjs targets the required query methods", () => {
    const script = readFileSync(resolve(ROOT, "scripts", "benchmark-queries.mjs"), "utf-8");
    expect(script).toContain("getMyProperties");
    expect(script).toContain("getReport");
    expect(script).toContain("getSeasonalTasks");
    expect(script).toContain("predictMaintenance");
    expect(script).toContain("getJobsForProperty");
  });

  it("benchmark-updates.mjs targets the required update methods", () => {
    const script = readFileSync(resolve(ROOT, "scripts", "benchmark-updates.mjs"), "utf-8");
    expect(script).toContain("createJob");
    expect(script).toContain("generateReport");
    expect(script).toContain("addVisitLog");
    expect(script).toContain("createRecurringService");
    expect(script).toContain("createRequest");
  });

  it("both scripts output CSV with the required columns", () => {
    const qScript = readFileSync(resolve(ROOT, "scripts", "benchmark-queries.mjs"), "utf-8");
    const uScript = readFileSync(resolve(ROOT, "scripts", "benchmark-updates.mjs"), "utf-8");
    const REQUIRED_COLUMNS = ["canister", "method", "mode", "latency_p50_ms", "latency_p99_ms", "cycles_estimate", "usd_per_1k_calls"];
    for (const col of REQUIRED_COLUMNS) {
      expect(qScript).toContain(col);
      expect(uScript).toContain(col);
    }
  });

  it("both scripts support --live and --csv flags", () => {
    const qScript = readFileSync(resolve(ROOT, "scripts", "benchmark-queries.mjs"), "utf-8");
    const uScript = readFileSync(resolve(ROOT, "scripts", "benchmark-updates.mjs"), "utf-8");
    expect(qScript).toContain("--live");
    expect(qScript).toContain("--csv");
    expect(uScript).toContain("--live");
    expect(uScript).toContain("--csv");
  });

  it("both scripts flag operations above 1B cycles", () => {
    const qScript = readFileSync(resolve(ROOT, "scripts", "benchmark-queries.mjs"), "utf-8");
    const uScript = readFileSync(resolve(ROOT, "scripts", "benchmark-updates.mjs"), "utf-8");
    expect(qScript).toContain("1_000_000_000");
    expect(uScript).toContain("1_000_000_000");
  });
});

describe("13.1.4: monitoring canister cyclesPerCall infrastructure", () => {
  const canister = readFileSync(resolve(ROOT, "backend", "monitoring", "main.mo"), "utf-8");

  it("Metrics type includes cyclesPerCall field", () => {
    expect(canister).toMatch(/cyclesPerCall\s*:/);
  });

  it("recordCallCycles function exists in monitoring canister", () => {
    expect(canister).toMatch(/func recordCallCycles/);
  });

  it("cyclesPerCall Map exists for persistence", () => {
    // persistent actor persists the Map natively — no serialisation buffer needed
    expect(canister).toMatch(/cyclesPerCall\s*=\s*Map\.empty/);
  });

  it("cyclesPerCall is populated in getMetrics() return value", () => {
    // getMetrics should reference cyclesPerCall in its return record
    const getMetricsBlock = canister.slice(
      canister.indexOf("func getMetrics"),
      canister.indexOf("func getMetrics") + 500
    );
    expect(getMetricsBlock).toContain("cyclesPerCall");
  });

  it("recordCallCycles validates method name is non-empty", () => {
    expect(canister).toMatch(/Text\.size.*method.*==.*0|method.*Text\.size.*==.*0/);
  });
});
