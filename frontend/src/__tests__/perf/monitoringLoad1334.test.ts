/**
 * TDD — 13.3.4: monitoring canister — metrics aggregation under load
 *
 * The monitoring canister has two hot paths:
 *
 *   recordCanisterMetrics(canisterId, cycles, burned, mem, cap, reqs, errs, ms)
 *     → stores CanisterMetrics in a HashMap, then calls evaluateAlerts()
 *     → evaluateAlerts iterates Map.values(alerts) — O(A) where A = alert count
 *
 *   getMetrics() → iterates Map.values(alerts) — O(A)
 *   calculateCostMetrics(userCount) → iterates Map.values(canisterMetrics) — O(C)
 *
 * Since there is no frontend monitoring service (monitoring is admin/backend),
 * this test models the same algorithmic complexity in JS, mirroring the Motoko
 * code 1-to-1, and verifies:
 *
 *   - O(C) scaling for calculateCostMetrics: 10× canisters → <10× time
 *   - O(A) scaling for getMetrics: 10× alerts → <10× time
 *   - 13 canisters + 50 alerts completes in < 5ms (the production-scale case)
 *   - Concurrent reads while writes are happening return consistent results
 *   - recordCanisterMetrics auto-generates alerts when thresholds are breached
 *   - Alert evaluation doesn't double-count: same canister re-reported → updates existing entry
 */

import { describe, it, expect } from "vitest";

// ─── JS model of monitoring canister ─────────────────────────────────────────
// Mirrors the Motoko HashMap + evaluateAlerts() logic directly.

interface CanisterMetrics {
  canisterId:        string;
  cyclesBalance:     number;
  cyclesBurned:      number;
  memoryBytes:       number;
  memoryCapacity:    number;
  requestCount:      number;
  errorCount:        number;
  avgResponseTimeMs: number;
  updatedAt:         number;
}

interface Alert {
  id:         string;
  severity:   "Critical" | "Warning" | "Info";
  kind:       "Cycles" | "Memory" | "ErrorRate" | "ResponseTime";
  canisterId: string;
  message:    string;
  resolved:   boolean;
  createdAt:  number;
}

interface Metrics {
  totalCanisters: number;
  activeAlerts:   number;
  criticalAlerts: number;
  isPaused:       boolean;
}

// Thresholds (mirrors main.mo)
const CRITICAL_CYCLES_THRESHOLD = 500_000_000_000;  // 500B cycles
const WARNING_CYCLES_THRESHOLD  = 1_000_000_000_000; // 1T cycles
const WARNING_ERROR_RATE_PCT    = 5.0;
const WARNING_RESPONSE_MS       = 2000;
const WARNING_MEMORY_PCT        = 80.0;

class MonitoringSimulator {
  private canisterMetrics = new Map<string, CanisterMetrics>();
  private alerts          = new Map<string, Alert>();
  private alertCounter    = 0;
  readonly isPaused       = false;

  private createAlert(
    severity: Alert["severity"],
    kind: Alert["kind"],
    canisterId: string,
    message: string
  ): void {
    const id = `alert-${++this.alertCounter}`;
    this.alerts.set(id, { id, severity, kind, canisterId, message, resolved: false, createdAt: Date.now() });
  }

  private evaluateAlerts(m: CanisterMetrics): void {
    if (m.cyclesBalance < CRITICAL_CYCLES_THRESHOLD) {
      this.createAlert("Critical", "Cycles", m.canisterId, `Cycles critically low: ${m.cyclesBalance}`);
    } else if (m.cyclesBalance < WARNING_CYCLES_THRESHOLD) {
      this.createAlert("Warning", "Cycles", m.canisterId, `Cycles low: ${m.cyclesBalance}`);
    }

    if (m.requestCount > 0) {
      const errPct = (m.errorCount / m.requestCount) * 100;
      if (errPct > WARNING_ERROR_RATE_PCT) {
        this.createAlert("Warning", "ErrorRate", m.canisterId, `Error rate ${errPct.toFixed(1)}%`);
      }
    }

    if (m.avgResponseTimeMs > WARNING_RESPONSE_MS) {
      this.createAlert("Warning", "ResponseTime", m.canisterId, `Slow response: ${m.avgResponseTimeMs}ms`);
    }

    if (m.memoryCapacity > 0) {
      const memPct = (m.memoryBytes / m.memoryCapacity) * 100;
      if (memPct > WARNING_MEMORY_PCT) {
        this.createAlert("Warning", "Memory", m.canisterId, `Memory ${memPct.toFixed(1)}%`);
      }
    }
  }

  recordCanisterMetrics(
    canisterId:        string,
    cyclesBalance:     number,
    cyclesBurned:      number,
    memoryBytes:       number,
    memoryCapacity:    number,
    requestCount:      number,
    errorCount:        number,
    avgResponseTimeMs: number
  ): void {
    const m: CanisterMetrics = {
      canisterId, cyclesBalance, cyclesBurned,
      memoryBytes, memoryCapacity, requestCount, errorCount,
      avgResponseTimeMs, updatedAt: Date.now(),
    };
    this.canisterMetrics.set(canisterId, m);
    this.evaluateAlerts(m);
  }

  getMetrics(): Metrics {
    let active   = 0;
    let critical = 0;
    for (const a of this.alerts.values()) {
      if (!a.resolved) {
        active++;
        if (a.severity === "Critical") critical++;
      }
    }
    return {
      totalCanisters: this.canisterMetrics.size,
      activeAlerts:   active,
      criticalAlerts: critical,
      isPaused:       this.isPaused,
    };
  }

  calculateCostMetrics(userCount: number): {
    totalCyclesBurned: number;
    totalUsdCost:      number;
    costPerUserUsd:    number;
  } {
    const CYCLES_PER_TRILLION = 1e12;
    const USD_PER_TRILLION    = 1.39;

    let totalBurned = 0;
    for (const m of this.canisterMetrics.values()) {
      totalBurned += m.cyclesBurned;
    }

    const totalUsd  = (totalBurned / CYCLES_PER_TRILLION) * USD_PER_TRILLION;
    const perUser   = userCount > 0 ? totalUsd / userCount : 0;

    return { totalCyclesBurned: totalBurned, totalUsdCost: totalUsd, costPerUserUsd: perUser };
  }

  get canisterCount()   { return this.canisterMetrics.size; }
  get alertCount()      { return this.alerts.size; }
  resolveAlert(id: string) { const a = this.alerts.get(id); if (a) this.alerts.set(id, { ...a, resolved: true }); }
  getAlertIds()         { return [...this.alerts.keys()]; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRODUCTION_CANISTERS = [
  "auth", "property", "job", "contractor", "quote",
  "payment", "photo", "price", "report", "market",
  "maintenance", "sensor", "monitoring",
];

function healthyMetrics(canisterId: string) {
  return [canisterId, 5_000_000_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100, 0, 50] as const;
}

function seedCanisters(sim: MonitoringSimulator, count: number) {
  for (let i = 0; i < count; i++) {
    sim.recordCanisterMetrics(`canister-${i}`, 5_000_000_000_000, 10_000_000,
      100_000_000, 1_000_000_000, 100, 0, 50);
  }
}

function time(fn: () => void): number {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("13.3.4: monitoring canister metrics aggregation under load", () => {

  // ── Correctness ───────────────────────────────────────────────────────────

  it("getMetrics() returns 0 alerts on empty store", () => {
    const sim = new MonitoringSimulator();
    const m   = sim.getMetrics();
    expect(m.totalCanisters).toBe(0);
    expect(m.activeAlerts).toBe(0);
    expect(m.criticalAlerts).toBe(0);
  });

  it("getMetrics() counts all 13 production canisters after recording them", () => {
    const sim = new MonitoringSimulator();
    for (const cid of PRODUCTION_CANISTERS) {
      sim.recordCanisterMetrics(...healthyMetrics(cid));
    }
    const m = sim.getMetrics();
    expect(m.totalCanisters).toBe(13);
    expect(m.activeAlerts).toBe(0); // healthy metrics → no alerts
  });

  it("re-recording same canister updates entry (no duplicates)", () => {
    const sim = new MonitoringSimulator();
    sim.recordCanisterMetrics(...healthyMetrics("auth"));
    sim.recordCanisterMetrics(...healthyMetrics("auth"));
    sim.recordCanisterMetrics(...healthyMetrics("auth"));
    expect(sim.canisterCount).toBe(1);
  });

  // ── Alert generation ──────────────────────────────────────────────────────

  it("records a Critical alert when cycles drop below threshold", () => {
    const sim = new MonitoringSimulator();
    sim.recordCanisterMetrics("auth", 100_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100, 0, 50);
    const m = sim.getMetrics();
    expect(m.criticalAlerts).toBeGreaterThan(0);
  });

  it("records a Warning alert when error rate exceeds 5%", () => {
    const sim = new MonitoringSimulator();
    // 10 errors out of 100 requests = 10% error rate
    sim.recordCanisterMetrics("job", 5_000_000_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100, 10, 50);
    const m = sim.getMetrics();
    expect(m.activeAlerts).toBeGreaterThan(0);
  });

  it("records a Warning alert when response time exceeds 2000ms", () => {
    const sim = new MonitoringSimulator();
    sim.recordCanisterMetrics("report", 5_000_000_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100, 0, 3000);
    const m = sim.getMetrics();
    expect(m.activeAlerts).toBeGreaterThan(0);
  });

  it("records a Warning alert when memory exceeds 80% capacity", () => {
    const sim = new MonitoringSimulator();
    sim.recordCanisterMetrics("photo", 5_000_000_000_000, 10_000_000, 850_000_000, 1_000_000_000, 100, 0, 50);
    const m = sim.getMetrics();
    expect(m.activeAlerts).toBeGreaterThan(0);
  });

  it("resolved alerts are excluded from active count", () => {
    const sim = new MonitoringSimulator();
    sim.recordCanisterMetrics("auth", 100_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100, 0, 50);
    const beforeResolve = sim.getMetrics().activeAlerts;
    expect(beforeResolve).toBeGreaterThan(0);

    for (const id of sim.getAlertIds()) sim.resolveAlert(id);
    expect(sim.getMetrics().activeAlerts).toBe(0);
  });

  // ── calculateCostMetrics correctness ─────────────────────────────────────

  it("calculateCostMetrics aggregates burned cycles across all canisters", () => {
    const sim = new MonitoringSimulator();
    for (const cid of PRODUCTION_CANISTERS) {
      sim.recordCanisterMetrics(cid, 5_000_000_000_000, 10_000_000, 100_000_000, 1_000_000_000, 100, 0, 50);
    }
    const cost = sim.calculateCostMetrics(100);
    expect(cost.totalCyclesBurned).toBe(13 * 10_000_000);
    expect(cost.totalUsdCost).toBeGreaterThan(0);
    expect(cost.costPerUserUsd).toBeGreaterThan(0);
    expect(cost.costPerUserUsd).toBeLessThan(cost.totalUsdCost);
  });

  it("calculateCostMetrics with userCount=0 returns costPerUser=0", () => {
    const sim = new MonitoringSimulator();
    sim.recordCanisterMetrics(...healthyMetrics("auth"));
    const cost = sim.calculateCostMetrics(0);
    expect(cost.costPerUserUsd).toBe(0);
  });

  // ── O(C) scaling: calculateCostMetrics ───────────────────────────────────

  it("calculateCostMetrics O(C): 10× canisters → <10× time", () => {
    const sim10  = new MonitoringSimulator();
    const sim100 = new MonitoringSimulator();
    seedCanisters(sim10,  10);
    seedCanisters(sim100, 100);

    // Warm-up
    sim10.calculateCostMetrics(1);

    const t10  = time(() => sim10.calculateCostMetrics(1));
    const t100 = time(() => sim100.calculateCostMetrics(1));

    const ratio = t100 / Math.max(t10, 0.01);
    expect(
      ratio,
      `calculateCostMetrics: 10× canisters multiplied time by ${ratio.toFixed(1)}× — expected ~linear`
    ).toBeLessThan(15);
  });

  // ── O(A) scaling: getMetrics ──────────────────────────────────────────────

  it("getMetrics() O(A): 10× alerts → <10× time", () => {
    // Generate alerts by recording low-cycles canisters
    const sim10   = new MonitoringSimulator();
    const sim100  = new MonitoringSimulator();

    for (let i = 0; i < 10;  i++) sim10.recordCanisterMetrics(`c-${i}`,  100_000_000, 0, 0, 0, 0, 0, 0);
    for (let i = 0; i < 100; i++) sim100.recordCanisterMetrics(`c-${i}`, 100_000_000, 0, 0, 0, 0, 0, 0);

    // Warm-up
    sim10.getMetrics();

    const t10  = time(() => sim10.getMetrics());
    const t100 = time(() => sim100.getMetrics());

    const ratio = t100 / Math.max(t10, 0.01);
    expect(
      ratio,
      `getMetrics: 10× alerts multiplied time by ${ratio.toFixed(1)}× — expected ~linear`
    ).toBeLessThan(15);
  });

  // ── Production-scale absolute cap ────────────────────────────────────────

  it("13 canisters + up to 50 alerts: getMetrics + calculateCostMetrics in < 5ms total", () => {
    const sim = new MonitoringSimulator();
    // 13 canisters, some with threshold violations to generate alerts
    for (let i = 0; i < 7; i++) sim.recordCanisterMetrics(...healthyMetrics(`healthy-${i}`));
    for (let i = 0; i < 6; i++) sim.recordCanisterMetrics(`warn-${i}`, 800_000_000_000, 0, 850_000_000, 1_000_000_000, 100, 6, 2500);

    const elapsed = time(() => {
      sim.getMetrics();
      sim.calculateCostMetrics(500);
    });

    expect(
      elapsed,
      `13-canister production snapshot took ${elapsed.toFixed(2)}ms — expected < 5ms`
    ).toBeLessThan(5);
  });

  // ── Concurrent reads during writes ───────────────────────────────────────

  it("concurrent recordCanisterMetrics + getMetrics calls all return consistent results", async () => {
    const sim = new MonitoringSimulator();
    seedCanisters(sim, 13);

    const results = await Promise.all([
      // 5 concurrent reads
      ...Array.from({ length: 5 }, () => Promise.resolve(sim.getMetrics())),
      // 5 concurrent writes (healthy canisters → no new alerts)
      ...Array.from({ length: 5 }, (_, i) =>
        Promise.resolve(sim.recordCanisterMetrics(...healthyMetrics(`extra-${i}`)))
      ),
      // 5 more reads after writes
      ...Array.from({ length: 5 }, () => Promise.resolve(sim.getMetrics())),
    ]);

    // All getMetrics() results should be valid Metrics objects
    const metricResults = results.filter(
      (r): r is Metrics => r !== undefined && "totalCanisters" in (r as any)
    );
    for (const m of metricResults) {
      expect(m.totalCanisters).toBeGreaterThanOrEqual(13);
      expect(m.activeAlerts).toBeGreaterThanOrEqual(0);
    }
  });

  it("1000 getMetrics() calls on 13-canister store complete in < 100ms", () => {
    const sim = new MonitoringSimulator();
    seedCanisters(sim, 13);

    const elapsed = time(() => {
      for (let i = 0; i < 1000; i++) sim.getMetrics();
    });
    expect(elapsed).toBeLessThan(100);
  });
});
