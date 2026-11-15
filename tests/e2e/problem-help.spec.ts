/**
 * "Show me the problem": from the emergency card, the owner describes what's
 * wrong and gets AI suggestions (labelled as AI), then one tap opens a quote
 * request prefilled with the trade, urgency and their own words.
 * Mock mode: the answer comes from __e2e_problem_help.
 *
 * Seed (helpers/testData.ts): property 1 is 123 Maple Street, Austin, TX.
 */
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

test.describe("Show me the problem", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(() => {
      (window as any).__e2e_baseline_photos = { baseline_1: [] };
      (window as any).__e2e_problem_help = {
        summary: "Water pooling under the water heater.",
        likelyCauses: ["A leaking drain valve", "A failing tank"],
        safeToTry: ["Hand-tighten the drain valve"],
        shutOff: ["The cold-water valve on top of the tank"],
        danger: false,
        dangerAdvice: "",
        serviceType: "Plumbing",
        urgency: "high",
      };
    });
  });

  test("gives AI suggestions and opens a prefilled quote", async ({ page }) => {
    await page.goto("/properties/1/emergency");
    await page.getByRole("button", { name: "Show me the problem" }).click();
    await expect(page).toHaveURL(/\/properties\/1\/problem$/);
    await expect(page.getByText(/AI suggestions, not a diagnosis/)).toBeVisible();

    const ask = page.getByRole("button", { name: /Get AI suggestions/ });
    await expect(ask).toBeDisabled();
    await page.getByLabel("What's wrong?").fill("Water under the water heater");
    await ask.click();

    await expect(page.getByText("A leaking drain valve")).toBeVisible();
    await expect(page.getByText("The cold-water valve on top of the tank")).toBeVisible();
    await page.getByRole("button", { name: "Request a quote from a Plumbing pro" }).click();
    await expect(page).toHaveURL(/\/quotes\/new$/);
    await expect(page.getByLabel(/Describe the work needed/)).toHaveValue("Water under the water heater");
  });
});
