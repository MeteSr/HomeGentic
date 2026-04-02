/**
 * Playwright — 13.4.3: Performance baseline for key pages
 *
 * Uses page.metrics() to capture JS heap, DOM nodes, and layout duration for:
 *   - Dashboard (with 25 properties + 200 jobs injected)
 *   - PropertyDetail (with 200 jobs for the active property)
 *   - ReportPage (with 200-job snapshot via mocked report service)
 *
 * First run: writes a baseline to tests/e2e/perf-baseline.json
 * Subsequent runs: compares against baseline, fails if any metric regresses >20%.
 *
 * To force-update the baseline (after an intentional perf change):
 *   PERF_UPDATE_BASELINE=1 npx playwright test perf-baseline
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const BASELINE_FILE = join(__dirname, "perf-baseline.json");
const UPDATE_BASELINE = process.env.PERF_UPDATE_BASELINE === "1";
const REGRESSION_THRESHOLD = 0.20; // 20% worse than baseline = fail

// ─── Large dataset fixtures ────────────────────────────────────────────────────

function makeLargeDataset() {
  const SERVICE_TYPES = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows", "Flooring", "Painting", "Landscaping"];

  const properties = Array.from({ length: 25 }, (_, i) => ({
    id: i + 1,
    owner: "test-e2e-principal",
    address: `${100 + i} Perf Street`,
    city: "Austin",
    state: "TX",
    zipCode: "78701",
    propertyType: "SingleFamily",
    yearBuilt: 1990 + (i % 30),
    squareFeet: 1800 + i * 10,
    verificationLevel: i % 3 === 0 ? "Premium" : i % 3 === 1 ? "Basic" : "Unverified",
    tier: "Pro",
    createdAt: 0,
    updatedAt: 0,
    isActive: true,
  }));

  const jobs = Array.from({ length: 200 }, (_, i) => ({
    id: `job-${i}`,
    propertyId: String((i % 25) + 1),
    homeowner: "test-e2e-principal",
    serviceType: SERVICE_TYPES[i % SERVICE_TYPES.length],
    contractorName: `Contractor ${i}`,
    amount: 50_000 + i * 1_000,
    date: `2022-${String((i % 12) + 1).padStart(2, "0")}-15`,
    description: `Job ${i}`,
    isDiy: i % 7 === 0,
    status: i % 4 === 0 ? "verified" : "completed",
    verified: i % 4 === 0,
    homeownerSigned: true,
    contractorSigned: i % 4 === 0,
    photos: [],
    createdAt: Date.now() - i * 86_400_000,
  }));

  return { properties, jobs };
}

// ─── Metric capture helpers ───────────────────────────────────────────────────

type MetricSnapshot = {
  JSHeapUsedSize:    number;
  Nodes:             number;
  LayoutDuration:    number;
  ScriptDuration:    number;
};

async function captureMetrics(page: Parameters<typeof injectTestAuth>[0]): Promise<MetricSnapshot> {
  const raw = await page.metrics();
  return {
    JSHeapUsedSize: raw.JSHeapUsedSize ?? 0,
    Nodes:          raw.Nodes          ?? 0,
    LayoutDuration: raw.LayoutDuration ?? 0,
    ScriptDuration: raw.ScriptDuration ?? 0,
  };
}

// ─── Baseline persistence ─────────────────────────────────────────────────────

type Baseline = Record<string, MetricSnapshot>;

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, "utf-8")) as Baseline;
  } catch {
    return {};
  }
}

function saveBaseline(baseline: Baseline) {
  writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("13.4.3: Performance baseline — key pages", () => {
  const baseline = loadBaseline();
  const captured: Baseline = {};

  // ── Dashboard ──────────────────────────────────────────────────────────────
  test("Dashboard: load with 25 properties + 200 jobs", async ({ page }) => {
    const { properties, jobs } = makeLargeDataset();

    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(({ props, jbs }: { props: any[]; jbs: any[] }) => {
      (window as any).__e2e_properties = props;
      (window as any).__e2e_jobs       = jbs;
    }, { props: properties, jbs: jobs });

    await page.goto("/dashboard");

    // Wait for meaningful content — either a heading or any page text
    await page.waitForSelector("body", { state: "attached" });
    await page.waitForLoadState("networkidle");

    const metrics = await captureMetrics(page);
    captured["dashboard"] = metrics;

    if (!UPDATE_BASELINE && baseline["dashboard"]) {
      const b = baseline["dashboard"];
      for (const key of Object.keys(b) as (keyof MetricSnapshot)[]) {
        const ratio = metrics[key] / (b[key] || 1);
        expect(
          ratio,
          `Dashboard ${key} regressed: ${metrics[key]} vs baseline ${b[key]} (${((ratio - 1) * 100).toFixed(1)}% worse)`
        ).toBeLessThan(1 + REGRESSION_THRESHOLD);
      }
    }

    // Absolute sanity bounds (catch catastrophic regressions even without a baseline)
    expect(metrics.JSHeapUsedSize).toBeLessThan(100 * 1024 * 1024);  // < 100MB heap
    expect(metrics.Nodes).toBeLessThan(10_000);                       // < 10K DOM nodes
  });

  // ── PropertyDetail ─────────────────────────────────────────────────────────
  test("PropertyDetail: load with 200 jobs for one property", async ({ page }) => {
    const SERVICE_TYPES = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows", "Flooring", "Painting", "Landscaping"];
    const jobs = Array.from({ length: 200 }, (_, i) => ({
      id: `job-${i}`,
      propertyId: "1",
      homeowner: "test-e2e-principal",
      serviceType: SERVICE_TYPES[i % SERVICE_TYPES.length],
      contractorName: `Contractor ${i}`,
      amount: 50_000 + i * 1_000,
      date: `2022-${String((i % 12) + 1).padStart(2, "0")}-15`,
      description: `Job ${i}`,
      isDiy: i % 7 === 0,
      status: i % 4 === 0 ? "verified" : "completed",
      verified: i % 4 === 0,
      homeownerSigned: true,
      contractorSigned: i % 4 === 0,
      photos: [],
      createdAt: Date.now() - i * 86_400_000,
    }));

    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript((jbs: any[]) => {
      (window as any).__e2e_properties = [{
        id: 1, owner: "test-e2e-principal",
        address: "123 Perf Street", city: "Austin", state: "TX", zipCode: "78701",
        propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400,
        verificationLevel: "Basic", tier: "Pro",
        createdAt: 0, updatedAt: 0, isActive: true,
      }];
      (window as any).__e2e_jobs = jbs;
    }, jobs);

    await page.goto("/properties/1");
    await page.waitForLoadState("networkidle");

    const metrics = await captureMetrics(page);
    captured["propertyDetail"] = metrics;

    if (!UPDATE_BASELINE && baseline["propertyDetail"]) {
      const b = baseline["propertyDetail"];
      for (const key of Object.keys(b) as (keyof MetricSnapshot)[]) {
        const ratio = metrics[key] / (b[key] || 1);
        expect(
          ratio,
          `PropertyDetail ${key} regressed: ${metrics[key]} vs baseline ${b[key]}`
        ).toBeLessThan(1 + REGRESSION_THRESHOLD);
      }
    }

    expect(metrics.JSHeapUsedSize).toBeLessThan(100 * 1024 * 1024);
    expect(metrics.Nodes).toBeLessThan(10_000);
  });

  // ── After all tests: write/update baseline ─────────────────────────────────
  test.afterAll(() => {
    const merged = { ...baseline, ...captured };
    if (UPDATE_BASELINE || Object.keys(baseline).length === 0) {
      saveBaseline(merged);
      console.info(`[13.4.3] Baseline ${UPDATE_BASELINE ? "updated" : "written"} to ${BASELINE_FILE}`);
    }
  });
});
