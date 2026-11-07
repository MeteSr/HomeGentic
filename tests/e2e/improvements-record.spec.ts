/**
 * Improvements record (#713): mark each job as an improvement or a repair,
 * see the running total, and export the list for a tax preparer.
 * Mock mode: jobs from __e2e_jobs, marks from __e2e_job_cost_categories.
 *
 * Seed (helpers/testData.ts): HVAC $2,400, Roofing $8,500, Plumbing $650,
 * Painting $280 (DIY). Suggestions: Roofing is an improvement (over $5,000),
 * the rest are repairs.
 */
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

test.describe("Improvements record", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(() => {
      (window as any).__e2e_job_cost_categories = {};
      (window as any).__e2e_baseline_photos = {
        docs_1: [
          {
            id: "R1",
            jobId: "docs_1",
            propertyId: "1",
            phase: "PostConstruction",
            description: "[Receipt] roof-invoice.pdf",
            hash: "d".repeat(64),
            url: "",
            size: 1024,
            verified: false,
            createdAt: 1,
          },
        ],
        receipts_1: [],
      };
    });
  });

  test("is reachable from the property's Jobs tab", async ({ page }) => {
    await page.goto("/properties/1");
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
    await page.getByRole("button", { name: /^Jobs/ }).click();
    await page.getByRole("link", { name: /improvements record/i }).click();
    await expect(page).toHaveURL(/\/properties\/1\/improvements$/);
    await expect(page.getByRole("heading", { name: "Improvements record" })).toBeVisible();
  });

  test("suggests marks, totals improvements and saves a change", async ({ page }) => {
    await page.goto("/properties/1/improvements");
    await expect(page.getByRole("heading", { name: "Improvements record" })).toBeVisible();
    await expect(page.getByText(/not tax advice/i).first()).toBeVisible();

    const total = page.getByTestId("improvement-total");
    await expect(total).toContainText("$8,500");
    await expect(total).toContainText("1 job");

    const hvac = page.getByLabel("Category for Full HVAC system replacement.");
    await expect(hvac).toHaveValue("repair");
    await hvac.selectOption("improvement");
    await expect(total).toContainText("$10,900");
    await expect(total).toContainText("2 jobs");
    expect(await page.evaluate(() => (window as any).__e2e_job_cost_categories)).toEqual({ "1": "improvement" });
  });

  test("filters by date and lists saved receipts", async ({ page }) => {
    await page.goto("/properties/1/improvements");
    await expect(page.getByText("roof-invoice.pdf")).toBeVisible();
    await page.getByLabel(/include work from/i).fill("2023-08-01");
    await expect(page.getByText("Full roof replacement after storm damage.")).toHaveCount(0);
    await expect(page.getByTestId("improvement-total")).toContainText("$0");
  });

  test("downloads the record as CSV", async ({ page }) => {
    await page.goto("/properties/1/improvements");
    await expect(page.getByTestId("improvement-total")).toContainText("$8,500");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /download csv/i }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^homegentic-improvements-.*\.csv$/);
    const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
    expect(text.split("\r\n")[0]).toBe(
      "Date,Work,Service type,Done by,Amount (USD),Category,Category set by,Record status,Permit number",
    );
    expect(text).toContain(
      "2023-07-22,Full roof replacement after storm damage.,Roofing,Top Roof Co,8500.00,Improvement,Suggested,Not yet signed,",
    );
  });
});
