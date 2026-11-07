/**
 * Move-in plan (#712): a new owner's first-weeks checklist, plus tasks picked
 * from their purchase inspection report.
 * Mock mode: plans from __e2e_move_in_plans, the report reading from
 * __e2e_inspection_findings, policy from __e2e_insurance_policies, rooms from
 * __e2e_rooms, the recall check from __e2e_recalls, uploads into
 * __e2e_baseline_photos.
 *
 * Seed (helpers/testData.ts): property 1 is 123 Maple Street, Austin, TX.
 */
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

test.describe("Move-in plan", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(() => {
      (window as any).__e2e_move_in_plans = {};
      (window as any).__e2e_insurance_policies = {};
      (window as any).__e2e_house_guides = {};
      (window as any).__e2e_rooms = [];
      (window as any).__e2e_recalls = [];
      (window as any).__e2e_baseline_photos = { docs_1: [] };
      (window as any).__e2e_inspection_findings = {
        isInspectionReport: true,
        findings: [
          {
            title: "GFCI by kitchen sink doesn't trip",
            detail: "Replace the outlet.",
            area: "Electrical",
            urgency: "safety",
          },
          { title: "Clean the dryer vent", detail: "", area: "Appliances", urgency: "repair" },
          { title: "Watch the stain on the garage ceiling", detail: "", area: "Roof", urgency: "monitor" },
        ],
      };
    });
  });

  test("is reachable from the property page and can be started", async ({ page }) => {
    await page.goto("/properties/1");
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Move-in plan" }).click();
    await expect(page).toHaveURL(/\/properties\/1\/move-in$/);
    await expect(page.getByRole("heading", { name: "Move-in plan" })).toBeVisible();

    await page.getByRole("button", { name: "Start a move-in plan" }).click();
    await expect(page.getByTestId("move-in-progress")).toHaveText("0 of 10 done");
    await expect(page.getByText(/suggestions, not an inspection/i)).toBeVisible();
    // Texas: no Florida deadline.
    await expect(page.getByText("Ask about a homestead exemption")).toBeVisible();
  });

  test("ticks steps and turns the inspection into tasks", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_move_in_plans = {
        "1": { startedAt: Date.now(), doneSteps: [], tasks: [], updatedAt: Date.now() },
      };
    });
    await page.goto("/properties/1/move-in");
    await page.getByRole("checkbox", { name: "Change or rekey the locks" }).check();
    await expect(page.getByTestId("move-in-progress")).toHaveText("1 of 10 done");

    await page.getByLabel("Inspection report file").setInputFiles({
      name: "inspection.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });
    const review = page.getByTestId("inspection-review");
    await expect(review.getByText(/read by AI/i)).toBeVisible();
    await review.getByRole("checkbox", { name: "Clean the dryer vent" }).uncheck();
    // Filing the PDF needs the photo canister, which mock mode doesn't have.
    await review.getByRole("checkbox", { name: "Also save the report to this home's documents" }).uncheck();
    await review.getByRole("button", { name: "Add 2 tasks" }).click();

    await expect(page.getByRole("heading", { name: "From your inspection" })).toBeVisible();
    await expect(page.getByText("GFCI by kitchen sink doesn't trip")).toBeVisible();
    await expect(page.getByText("Clean the dryer vent")).toHaveCount(0);
    await expect(page.getByTestId("move-in-progress")).toHaveText("1 of 12 done");

    await page.getByRole("button", { name: "Get quotes for GFCI by kitchen sink doesn't trip" }).click();
    await expect(page).toHaveURL(/\/quotes\/new$/);
  });

  test("shows the plan's progress in the dashboard brief", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_move_in_plans = {
        "1": { startedAt: Date.now(), doneSteps: ["locks"], tasks: [], updatedAt: Date.now() },
      };
    });
    await page.goto("/dashboard");
    await page.getByText("Your move-in plan: 1 of 10 steps done.").click();
    await expect(page).toHaveURL(/\/properties\/1\/move-in$/);
  });
});
