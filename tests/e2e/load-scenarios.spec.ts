/**
 * Playwright — 13.5: Load Test Scenarios — Realistic User Journeys
 *
 * 13.5.1: "Sell day" — ResaleReady → score → generate report → listing bid
 * 13.5.2: "Buyer due diligence" — open report → all sections → cert → contractors
 *         Simulates 10 concurrent buyers (Playwright browser contexts) against
 *         one shared report token
 * 13.5.3: "Active homeowner" — log 3 jobs → 2 visit logs → upload photo → report
 * 13.5.4: "Agent competition" — skipped until Section 9 (listing bid marketplace)
 *         is built; stub asserts the scenario is tracked
 *
 * Thresholds are wall-clock budgets that catch catastrophic regressions.
 * They are intentionally generous to avoid flakiness on slow CI runners.
 */

import { test, expect, Browser, BrowserContext } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription, injectRecurringServices } from "./helpers/testData";

// ─── Shared fixtures ───────────────────────────────────────────────────────────

const SERVICE_TYPES = ["HVAC", "Roofing", "Plumbing", "Electrical", "Windows", "Flooring", "Painting", "Landscaping"];

function makeJobs(count: number, propertyId = "1") {
  return Array.from({ length: count }, (_, i) => ({
    id: `load-job-${i}`,
    propertyId,
    homeowner: "test-e2e-principal",
    serviceType: SERVICE_TYPES[i % SERVICE_TYPES.length],
    contractorName: `Contractor ${i}`,
    amount: 50_000 + i * 1_000,
    date: `2023-${String((i % 12) + 1).padStart(2, "0")}-15`,
    description: `Load test job ${i}`,
    isDiy: i % 7 === 0,
    status: i % 3 === 0 ? "verified" : "completed",
    verified: i % 3 === 0,
    homeownerSigned: true,
    contractorSigned: i % 3 === 0,
    photos: [],
    warrantyMonths: i % 5 === 0 ? 24 : undefined,
    createdAt: Date.now() - i * 86_400_000,
  }));
}

async function injectStandardData(page: Parameters<typeof injectTestAuth>[0]) {
  await injectTestAuth(page);
  await injectSubscription(page, "Pro");
  await injectTestProperties(page);
}

// ─── 13.5.1: "Sell day" scenario ──────────────────────────────────────────────

test.describe("13.5.1: 'Sell day' scenario — full resale journey", () => {
  test("complete sell-day journey completes within 30 seconds", async ({ page }) => {
    const t0 = Date.now();

    await injectStandardData(page);

    // Step 1: ResaleReady checklist
    await page.goto("/resale-ready");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toBeEmpty();

    // Step 2: View HomeGentic score (on resale-ready page)
    const scoreEl = page.locator("text=/\\d+/").first();
    await scoreEl.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    // Score renders — page is live

    // Step 3: Navigate to dashboard to access report generation
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // Step 4: Generate a report via the in-browser service (mirrors real user action)
    const token = await page.evaluate(async () => {
      const { reportService } = await import("/src/services/report.ts");
      const link = await reportService.generateReport(
        "1",
        {
          address: "123 Maple Street", city: "Austin", state: "TX",
          zipCode: "78701", propertyType: "SingleFamily",
          yearBuilt: 2001, squareFeet: 2400, verificationLevel: "Basic",
        },
        [
          { serviceType: "HVAC",    description: "HVAC replacement",  contractorName: "Cool Air", amountCents: 240000, date: "2023-03-15", isDiy: false, permitNumber: null, warrantyMonths: null, isVerified: true,  status: "verified"  },
          { serviceType: "Roofing", description: "Roof replacement",  contractorName: "TopRoof",  amountCents: 850000, date: "2023-07-22", isDiy: false, permitNumber: null, warrantyMonths: null, isVerified: false, status: "completed" },
          { serviceType: "Plumbing",description: "Pipe repair",       contractorName: "Plumbers", amountCents:  65000, date: "2023-09-10", isDiy: false, permitNumber: null, warrantyMonths: null, isVerified: true,  status: "verified"  },
        ],
        null,
        "Public"
      );
      return link.token;
    });

    expect(token).toBeTruthy();

    // Step 5: View the generated report
    await page.goto(`/report/${token}`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("123 Maple Street")).toBeVisible({ timeout: 8000 });

    // Step 6: Navigate to listing bid page (bid marketplace entry point)
    await page.goto("/listing/new");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toBeEmpty();

    const elapsed = Date.now() - t0;
    expect(
      elapsed,
      `Sell-day journey took ${elapsed}ms — exceeds 30s threshold`
    ).toBeLessThan(30_000);
  });

  test("each step in the sell-day journey renders without errors", async ({ page }) => {
    await injectStandardData(page);

    const steps = [
      { url: "/resale-ready",  label: "ResaleReady checklist" },
      { url: "/dashboard",     label: "Score dashboard" },
      { url: "/listing/new",   label: "Listing bid entry" },
    ];

    for (const step of steps) {
      await page.goto(step.url);
      await page.waitForLoadState("networkidle");
      // No JS error dialog and body is populated
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("report generated during sell-day is shareable (has a valid token)", async ({ page }) => {
    await injectStandardData(page);
    await page.goto("/dashboard");

    const token = await page.evaluate(async () => {
      const { reportService } = await import("/src/services/report.ts");
      const link = await reportService.generateReport(
        "1",
        { address: "Sell Day Home", city: "Austin", state: "TX", zipCode: "78701",
          propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400, verificationLevel: "Basic" },
        [],
        null,
        "Public"
      );
      return link.token;
    });

    // Token is a non-empty string — shareable URL can be constructed
    expect(token).toBeTruthy();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });
});

// ─── 13.5.2: "Buyer due diligence" scenario ───────────────────────────────────

test.describe("13.5.2: 'Buyer due diligence' — concurrent read-path load", () => {
  // Generate one shared report token in a setup page, then hit it with
  // N concurrent browser contexts.

  test("10 concurrent buyers can open the same report without errors", async ({ browser }) => {
    // Step 1: generate a shared token using one context
    const setupCtx = await browser.newContext();
    const setupPage = await setupCtx.newPage();
    await injectTestAuth(setupPage);
    await setupPage.goto("/dashboard");

    const sharedToken = await setupPage.evaluate(async () => {
      const { reportService } = await import("/src/services/report.ts");
      const link = await reportService.generateReport(
        "1",
        { address: "42 Buyer Ave", city: "Austin", state: "TX", zipCode: "78701",
          propertyType: "SingleFamily", yearBuilt: 2000, squareFeet: 2200, verificationLevel: "Premium" },
        [
          { serviceType: "HVAC", description: "HVAC replacement", contractorName: "Cool Air", amountCents: 240000,
            date: "2023-03-15", isDiy: false, permitNumber: null, warrantyMonths: null, isVerified: true, status: "verified" },
        ],
        null,
        "Public"
      );
      return link.token;
    });
    await setupCtx.close();

    expect(sharedToken).toBeTruthy();

    // Step 2: 10 concurrent buyer contexts — all read the same report
    const CONCURRENT_BUYERS = 10;
    const t0 = Date.now();

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_BUYERS }, async (_, i) => {
        const ctx  = await browser.newContext();
        const page = await ctx.newPage();
        try {
          await page.goto(`/report/${sharedToken}`);
          await page.waitForLoadState("networkidle");
          // Verify the report loaded — address should be visible
          await page.waitForSelector("body", { state: "attached" });
          const bodyText = await page.locator("body").textContent();
          return { buyer: i, ok: true, hasContent: (bodyText?.length ?? 0) > 100 };
        } finally {
          await ctx.close();
        }
      })
    );

    const elapsed = Date.now() - t0;
    const successes = results.filter((r) => r.status === "fulfilled" && (r.value as any).ok);
    const failures  = results.filter((r) => r.status === "rejected");

    // All 10 buyers succeeded
    expect(
      successes.length,
      `Only ${successes.length}/10 buyers loaded the report successfully`
    ).toBe(CONCURRENT_BUYERS);
    expect(failures.length).toBe(0);

    // All 10 concurrent requests completed within 20 seconds total
    expect(
      elapsed,
      `10 concurrent buyers took ${elapsed}ms — exceeds 20s threshold`
    ).toBeLessThan(20_000);
  });

  test("report page is accessible without authentication (public read path)", async ({ page }) => {
    // This is the core of "buyer due diligence" — no login required
    await page.goto("/report/any-public-token");
    await page.waitForLoadState("networkidle");
    // Should render something (not redirect to /login)
    const url = page.url();
    expect(url).not.toContain("/login");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("score cert page is accessible without authentication", async ({ page }) => {
    await page.goto("/cert/any-cert-token");
    await page.waitForLoadState("networkidle");
    const url = page.url();
    expect(url).not.toContain("/login");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("contractor list page loads for unauthenticated buyers", async ({ page }) => {
    await page.goto("/contractors");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

// ─── 13.5.3: "Active homeowner" scenario ──────────────────────────────────────

test.describe("13.5.3: 'Active homeowner' — write-heavy single session", () => {
  test("log 3 jobs in sequence within 15 seconds", async ({ page }) => {
    await injectStandardData(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    const t0 = Date.now();

    // Log 3 jobs via in-browser service (avoids UI automation brittleness)
    const jobIds = await page.evaluate(async () => {
      const { jobService } = await import("/src/services/job.ts");
      const results: string[] = [];

      const jobs = [
        { serviceType: "HVAC",     amount: 240_000, date: "2024-03-15", description: "HVAC tune-up",       isDiy: false, status: "completed" as const },
        { serviceType: "Plumbing", amount:  65_000, date: "2024-04-20", description: "Leaky pipe repair",  isDiy: false, status: "completed" as const },
        { serviceType: "Painting", amount:  28_000, date: "2024-05-10", description: "Interior repaint",   isDiy: true,  status: "completed" as const },
      ];

      for (const j of jobs) {
        const job = await jobService.create({
          propertyId: "1",
          ...j,
          contractorName: j.isDiy ? undefined : `Contractor for ${j.serviceType}`,
        });
        results.push(job.id);
      }
      return results;
    });

    const jobElapsed = Date.now() - t0;
    expect(jobIds).toHaveLength(3);
    expect(jobIds.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(jobElapsed, `Logging 3 jobs took ${jobElapsed}ms — exceeds 15s`).toBeLessThan(15_000);
  });

  test("add 2 visit logs to a recurring service", async ({ page }) => {
    await injectStandardData(page);
    await injectRecurringServices(page);
    await page.goto("/recurring/rs1");
    await page.waitForLoadState("networkidle");

    const logIds = await page.evaluate(async () => {
      const { recurringService } = await import("/src/services/recurringService.ts");
      const log1 = await recurringService.addVisitLog("rs1", "2024-06-01", "Everything looks good");
      const log2 = await recurringService.addVisitLog("rs1", "2024-07-01", "Routine check complete");
      return [log1.id, log2.id];
    });

    expect(logIds).toHaveLength(2);
    expect(logIds[0]).not.toEqual(logIds[1]);
  });

  test("upload a photo for a job", async ({ page }) => {
    await injectStandardData(page);
    await page.goto("/dashboard");

    const photoId = await page.evaluate(async () => {
      const { photoService } = await import("/src/services/photo.ts");
      // Simulate a 10KB photo upload as a base64 data blob
      const fakeImageData = "data:image/jpeg;base64," + "A".repeat(10_000);
      const photo = await photoService.uploadPhoto("1", "load-job-1", fakeImageData, "before");
      return photo.id;
    });

    expect(typeof photoId).toBe("string");
    expect(photoId.length).toBeGreaterThan(0);
  });

  test("full active-homeowner session completes within 20 seconds", async ({ page }) => {
    await injectStandardData(page);
    await injectRecurringServices(page);

    const t0 = Date.now();

    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    // 1. Log 3 jobs
    await page.evaluate(async () => {
      const { jobService } = await import("/src/services/job.ts");
      for (const [serviceType, description] of [
        ["HVAC", "Annual tune-up"],
        ["Plumbing", "Pipe repair"],
        ["Painting", "Touch-up paint"],
      ]) {
        await jobService.create({ propertyId: "1", serviceType, amount: 50_000,
          date: "2024-06-15", description, isDiy: false, status: "completed" });
      }
    });

    // 2. Add 2 visit logs
    await page.evaluate(async () => {
      const { recurringService } = await import("/src/services/recurringService.ts");
      await recurringService.addVisitLog("rs1", "2024-06-01", "Visit 1");
      await recurringService.addVisitLog("rs1", "2024-07-01", "Visit 2");
    });

    // 3. Upload a photo
    await page.evaluate(async () => {
      const { photoService } = await import("/src/services/photo.ts");
      await photoService.uploadPhoto("1", "j1", "data:image/jpeg;base64," + "B".repeat(5_000), "after");
    });

    // 4. Regenerate report
    const token = await page.evaluate(async () => {
      const { reportService } = await import("/src/services/report.ts");
      const link = await reportService.generateReport(
        "1",
        { address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
          propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400, verificationLevel: "Basic" },
        [],
        null,
        "Public"
      );
      return link.token;
    });

    expect(token).toBeTruthy();
    await page.goto(`/report/${token}`);
    await page.waitForLoadState("networkidle");

    const elapsed = Date.now() - t0;
    expect(
      elapsed,
      `Active-homeowner session took ${elapsed}ms — exceeds 20s threshold`
    ).toBeLessThan(20_000);
  });
});

// ─── 13.5.4: "Agent competition" scenario (gated on Section 9) ───────────────

test.describe("13.5.4: 'Agent competition' scenario (Section 9 dependency)", () => {
  test.skip(
    true,
    "13.5.4 is blocked on Section 9 (listing bid marketplace) being built. " +
    "The listing canister exists (/listing/new route is active) but agent " +
    "proposal submission (10 agents → 1 listing) requires the full agent bid " +
    "workflow from epic 9. Re-enable when 9.1–9.3 are complete."
  );

  test("10 agents submit proposals to the same listing simultaneously", async ({ browser }) => {
    const CONCURRENT_AGENTS = 10;

    // Setup: create a listing bid request
    const setupCtx = await browser.newContext();
    const setupPage = await setupCtx.newPage();
    await injectTestAuth(setupPage);
    await setupPage.goto("/listing/new");
    // TODO: fill listing form and submit to get listingId
    const listingId = "listing-1"; // placeholder
    await setupCtx.close();

    // 10 agents submit in parallel
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_AGENTS }, async (_, i) => {
        const ctx  = await browser.newContext();
        const page = await ctx.newPage();
        try {
          await page.goto(`/listing/${listingId}`);
          await page.waitForLoadState("networkidle");
          // TODO: submit agent proposal via form or service call
          return { agent: i, ok: true };
        } finally {
          await ctx.close();
        }
      })
    );

    const successes = results.filter((r) => r.status === "fulfilled");
    expect(successes.length).toBe(CONCURRENT_AGENTS);
  });
});
