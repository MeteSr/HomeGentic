/**
 * TDD — 13.6: Infrastructure & Tooling
 *
 * Validates that all four 13.6 deliverables exist and have the correct structure:
 *
 *   13.6.1  scripts/benchmark.sh         — full harness (runs 13.1.1 + 13.1.2)
 *   13.6.2  tests/k6/voice-agent-load.js — k6 load test (ramp/spike/soak)
 *   13.6.3  AdminDashboardPage cycles tab — cycles/runway/burn rate UI
 *   13.6.4  .github/workflows/perf-regression.yml — CI gate (25% threshold)
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "../../../../");

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

// ─── 13.6.1: benchmark.sh harness ────────────────────────────────────────────

describe("13.6.1: scripts/benchmark.sh — full harness", () => {
  const script = read("scripts/benchmark.sh");

  it("benchmark.sh exists", () => {
    expect(existsSync(resolve(ROOT, "scripts", "benchmark.sh"))).toBe(true);
  });

  it("runs benchmark-queries.mjs with --csv flag", () => {
    expect(script).toContain("benchmark-queries.mjs");
    expect(script).toContain("--csv");
  });

  it("runs benchmark-updates.mjs with --csv flag", () => {
    expect(script).toContain("benchmark-updates.mjs");
    expect(script).toContain("--csv");
  });

  it("outputs a Markdown report file", () => {
    expect(script).toContain("benchmark-report.md");
  });

  it("writes query-baseline.csv and update-baseline.csv", () => {
    expect(script).toContain("query-baseline.csv");
    expect(script).toContain("update-baseline.csv");
  });

  it("supports --live flag for real replica runs", () => {
    expect(script).toContain("--live");
    expect(script).toContain("LIVE_FLAG");
  });

  it("handles case where dfx replica is not running (dry-run mode)", () => {
    expect(script).toContain("REPLICA_RUNNING");
    expect(script).toContain("dry-run");
  });

  it("prints top-3 heaviest operations", () => {
    expect(script).toContain("Top-3");
  });

  it("generates Markdown table with required columns", () => {
    expect(script).toContain("Canister");
    expect(script).toContain("Method");
    expect(script).toContain("Cycles est");
  });
});

// ─── 13.6.2: k6 voice agent load test ────────────────────────────────────────

describe("13.6.2: tests/k6/voice-agent-load.js — k6 load test suite", () => {
  const k6 = read("tests/k6/voice-agent-load.js");

  it("k6 test file exists", () => {
    expect(existsSync(resolve(ROOT, "tests", "k6", "voice-agent-load.js"))).toBe(true);
  });

  it("has a ramp scenario (1 → 50 VU)", () => {
    expect(k6).toContain("ramp");
    expect(k6).toContain("ramping-vus");
    expect(k6).toMatch(/target.*50/);
  });

  it("has a spike scenario (up to 200 VU)", () => {
    expect(k6).toContain("spike");
    expect(k6).toMatch(/target.*200/);
  });

  it("has a soak scenario (sustained VUs)", () => {
    expect(k6).toContain("soak");
    expect(k6).toContain("constant-vus");
  });

  it("tests POST /api/chat endpoint", () => {
    expect(k6).toContain("/api/chat");
  });

  it("tests POST /api/agent endpoint", () => {
    expect(k6).toContain("/api/agent");
  });

  it("tests GET /health liveness probe", () => {
    expect(k6).toContain("/health");
  });

  it("has p95 threshold for chat endpoint", () => {
    expect(k6).toContain("chat_duration_ms");
    expect(k6).toMatch(/p\(95\)<\d+/);
  });

  it("has p95 threshold for agent endpoint", () => {
    expect(k6).toContain("agent_duration_ms");
  });

  it("has error rate threshold (< 5%)", () => {
    expect(k6).toContain("http_req_failed");
    expect(k6).toMatch(/rate<0\.0[5-9]/);
  });

  it("has rate-limit hit counter", () => {
    expect(k6).toContain("429");
    expect(k6).toContain("rate_limit_429");
  });

  it("exports options, default function, setup, and teardown", () => {
    expect(k6).toContain("export const options");
    expect(k6).toContain("export default function");
    expect(k6).toContain("export function setup");
    expect(k6).toContain("export function teardown");
  });
});

// ─── 13.6.3: Cycles dashboard in AdminDashboardPage ──────────────────────────

describe("13.6.3: AdminDashboardPage cycles tab", () => {
  const page = read("frontend/src/pages/AdminDashboardPage.tsx");
  const svc  = read("frontend/src/services/monitoringService.ts");

  it("monitoringService.ts exists", () => {
    expect(existsSync(resolve(ROOT, "frontend/src/services/monitoringService.ts"))).toBe(true);
  });

  it("monitoringService exports getAllCanisterMetrics()", () => {
    expect(svc).toContain("getAllCanisterMetrics");
  });

  it("monitoringService exports getMetrics()", () => {
    expect(svc).toContain("getMetrics");
  });

  it("monitoringService exports runwayDays() helper", () => {
    expect(svc).toContain("runwayDays");
  });

  it("monitoringService exports cyclesToUsd() helper", () => {
    expect(svc).toContain("cyclesToUsd");
  });

  it("monitoringService has mock fallback when canister ID not set", () => {
    expect(svc).toMatch(/MONITORING_CANISTER_ID.*==.*""|!MONITORING_CANISTER_ID/);
  });

  it("AdminDashboardPage imports monitoringService", () => {
    expect(page).toContain("monitoringService");
  });

  it("AdminDashboardPage has cycles tab", () => {
    expect(page).toContain('"cycles"');
  });

  it("CyclesDashboard component renders balance, burn, and runway", () => {
    expect(page).toContain("CyclesDashboard");
    expect(page).toContain("Balance");
    expect(page).toContain("Burn");
    expect(page).toContain("Runway");
  });

  it("runway alert threshold is defined (warn at 30 days)", () => {
    expect(page).toContain("RUNWAY_WARN_DAYS");
    expect(page).toMatch(/RUNWAY_WARN_DAYS.*=.*30/);
  });

  it("runway is color-coded (green/orange/red)", () => {
    expect(page).toContain("runwayColor");
    expect(page).toContain("RUNWAY_CRIT_DAYS");
  });

  it("per-canister table shows memory % and error rate", () => {
    expect(page).toContain("Error Rate");
    expect(page).toContain("Memory");
  });
});

// ─── 13.6.4: CI performance regression gate ──────────────────────────────────

describe("13.6.4: .github/workflows/perf-regression.yml — CI gate", () => {
  const workflow = read(".github/workflows/perf-regression.yml");

  it("perf-regression.yml exists", () => {
    expect(existsSync(resolve(ROOT, ".github/workflows/perf-regression.yml"))).toBe(true);
  });

  it("triggers on pull_request to main", () => {
    expect(workflow).toContain("pull_request");
    expect(workflow).toContain("main");
  });

  it("runs benchmark-queries.mjs in dry-run mode", () => {
    expect(workflow).toContain("benchmark-queries.mjs");
    expect(workflow).toContain("--csv");
  });

  it("runs benchmark-updates.mjs in dry-run mode", () => {
    expect(workflow).toContain("benchmark-updates.mjs");
  });

  it("compares against committed baseline CSVs", () => {
    expect(workflow).toContain("query-baseline.csv");
    expect(workflow).toContain("update-baseline.csv");
  });

  it("regression threshold is 25%", () => {
    expect(workflow).toMatch(/0\.25|25%/);
    expect(workflow).toContain("REGRESSION_THRESHOLD");
  });

  it("exits with non-zero code on regression", () => {
    expect(workflow).toContain("process.exit(1)");
  });

  it("posts a PR comment with the regression report", () => {
    expect(workflow).toContain("createComment");
    expect(workflow).toContain("GITHUB_STEP_SUMMARY");
  });

  it("only runs when relevant files change (path filter)", () => {
    expect(workflow).toContain("paths");
    expect(workflow).toContain("backend/**");
    expect(workflow).toContain("frontend/src/services/**");
  });
});
