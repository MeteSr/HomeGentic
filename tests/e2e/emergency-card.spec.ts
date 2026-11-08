/**
 * Storm and emergency card (#715): shutoffs, alarm, insurer and contacts from
 * the house guide and policy, a storm checklist for hurricane states, and an
 * emergency quote shortcut.
 * Mock mode: guide from __e2e_house_guides, policy from
 * __e2e_insurance_policies, setup photos from __e2e_baseline_photos.
 *
 * Seed (helpers/testData.ts): property 1 is 123 Maple Street, Austin, TX.
 */
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

test.describe("Emergency card", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(() => {
      (window as any).__e2e_baseline_photos = { baseline_1: [] };
      (window as any).__e2e_insurance_policies = {
        "1": {
          carrier: "Lone Star Mutual",
          policyNumber: "TX-555",
          renewalDate: "2027-05-01",
          coverageA: null,
          hurricaneDeductible: null,
        },
      };
      (window as any).__e2e_house_guides = {
        "1": {
          wifiName: "",
          wifiPassword: "",
          alarm: "",
          trashDay: "",
          recyclingDay: "",
          waterShutoff: "Front yard, under the round lid",
          gasShutoff: "",
          electricPanel: "Garage, left wall",
          contacts: [
            { name: "Lone Star claims", role: "Insurance claims", phone: "800-555-0100" },
            { name: "Ace Plumbing", role: "Plumber", phone: "512-555-0142" },
          ],
          notes: "",
          photoIds: [],
        },
      };
    });
  });

  test("opens from the property page with the home's shutoffs and contacts", async ({ page }) => {
    await page.goto("/properties/1");
    await page.getByRole("button", { name: /emergency card/i }).click();
    await expect(page).toHaveURL(/\/properties\/1\/emergency$/);
    await expect(page.getByRole("heading", { name: "Emergency card" })).toBeVisible();
    await expect(page.getByText("Front yard, under the round lid")).toBeVisible();
    await expect(page.getByText("Lone Star Mutual")).toBeVisible();
    await expect(page.getByRole("link", { name: /Call the claim line/ })).toHaveAttribute("href", "tel:8005550100");
    await expect(page.getByRole("link", { name: /Call Ace Plumbing/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Not on this card yet" })).toContainText("Where the gas shut-off is");
  });

  test("keeps storm checklist ticks after a reload", async ({ page }) => {
    await page.goto("/properties/1/emergency");
    const before = page.getByRole("region", { name: "Before a storm" });
    const box = before.getByRole("checkbox", { name: /Clear gutters/ });
    await box.check();
    await page.reload();
    await expect(
      page.getByRole("region", { name: "Before a storm" }).getByRole("checkbox", { name: /Clear gutters/ }),
    ).toBeChecked();
    await expect(
      page.getByRole("region", { name: "After a storm" }).getByRole("link", { name: "Open the claim kit" }),
    ).toBeVisible();
  });

  test("starts an emergency quote request for the home", async ({ page }) => {
    await page.goto("/properties/1/emergency");
    await page.getByRole("button", { name: "Get emergency help" }).click();
    await expect(page).toHaveURL(/\/quotes\/new$/);
    await expect(page.getByRole("button", { name: /Emergency/ })).toHaveAttribute("aria-pressed", "true");
  });
});
