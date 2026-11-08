/**
 * Permits and lien waivers (#716): record each job's permit status and see
 * which larger contractor jobs have no final lien waiver on file.
 * Mock mode: jobs from __e2e_jobs, close-outs from __e2e_job_closeouts.
 *
 * Seed (helpers/testData.ts): HVAC $2,400, Roofing $8,500, Plumbing $650,
 * Painting $280 (DIY), all on a Texas home. Only the $8,500 roof is over the
 * $2,500 line for a lien waiver.
 */
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

test.describe("Permits and lien waivers", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(() => {
      (window as any).__e2e_job_closeouts = [{ jobId: "1", permitStatus: "open", papers: [] }];
      (window as any).__e2e_baseline_photos = { docs_1: [] };
    });
  });

  test("is reachable from the property's Jobs tab", async ({ page }) => {
    await page.goto("/properties/1");
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
    await page.getByRole("button", { name: /^Jobs/ }).click();
    await page.getByRole("link", { name: /permits and lien waivers/i }).click();
    await expect(page).toHaveURL(/\/properties\/1\/closeout$/);
    await expect(page.getByRole("heading", { name: "Permits and lien waivers" })).toBeVisible();
  });

  test("records a permit status and flags the larger job with no waiver", async ({ page }) => {
    await page.goto("/properties/1/closeout");
    await expect(page.getByRole("heading", { name: "Permits and lien waivers" })).toBeVisible();
    await expect(page.getByText(/title search/i).first()).toBeVisible();
    await expect(page.getByTestId("open-permits")).toHaveText("1");
    await expect(page.getByTestId("missing-waivers")).toHaveText("1");

    const roof = page.getByRole("row").filter({ hasText: "Full roof replacement after storm damage." });
    await expect(roof.getByText(/no final lien waiver on file/i)).toBeVisible();

    await page.getByLabel("Permit status for Full HVAC system replacement.").selectOption("closed");
    await expect(page.getByTestId("open-permits")).toHaveText("0");
    const saved = await page.evaluate(() => (window as any).__e2e_job_closeouts);
    expect(saved).toEqual([{ jobId: "1", permitStatus: "closed", papers: [] }]);
  });

  test("Resale Ready lists the open permit and the job with no waiver", async ({ page }) => {
    await page.goto("/resale-ready");
    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: /permits and lien waivers/i }) });
    await expect(section.getByText(/1 open permit/i)).toBeVisible();
    await expect(section.getByText(/1 contractor job over \$2,500 with no final lien waiver on file/i)).toBeVisible();
    await section.getByRole("link", { name: /review permits and lien waivers/i }).click();
    await expect(page).toHaveURL(/\/properties\/1\/closeout$/);
  });
});
