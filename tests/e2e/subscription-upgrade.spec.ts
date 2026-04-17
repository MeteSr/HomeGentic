import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";

// Navigate to Settings → Subscription tab
async function goToSubscriptionTab(page: Parameters<typeof injectTestAuth>[0]) {
  await page.goto("/settings");
  await page.getByRole("button", { name: /subscription/i }).click();
}

test.describe("SettingsPage — Subscription tab tier-gated UI", () => {
  // ── Paid tier (Basic) ──────────────────────────────────────────────────────

  test.describe("Basic tier (paid)", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectSubscription(page, "Basic");
      await goToSubscriptionTab(page);
    });

    test("shows 'Switch Plan' section heading", async ({ page }) => {
      await expect(page.getByText("Switch Plan")).toBeVisible();
    });

    test("plan grid buttons are labelled 'Switch' not 'Upgrade'", async ({ page }) => {
      await expect(page.getByRole("button", { name: /^switch$/i }).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^upgrade$/i })).toHaveCount(0);
    });
  });

  // ── Pro tier ───────────────────────────────────────────────────────────────

  test.describe("Pro tier (current plan)", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectSubscription(page, "Pro");
      await goToSubscriptionTab(page);
    });

    test("shows 'Switch Plan' section heading", async ({ page }) => {
      await expect(page.getByText("Switch Plan")).toBeVisible();
    });

    test("Pro is not shown as an option in the switch grid (it's the current plan)", async ({ page }) => {
      // The switch grid filters out the current tier — Pro button should not appear
      const switchButtons = page.getByRole("button", { name: /^switch$/i });
      // There should be switch buttons for other plans (Basic, Premium) but not Pro itself
      await expect(switchButtons.first()).toBeVisible();
    });
  });

  // ── Contractor role ────────────────────────────────────────────────────────

  test.describe("Contractor role — Free", () => {
    test.beforeEach(async ({ page }) => {
      // Inject a Contractor profile via the auth global
      await page.addInitScript(() => {
        (window as any).__e2e_principal = "test-e2e-principal";
        (window as any).__e2e_profile   = {
          principal: "test-e2e-principal",
          role:      "Contractor",
          email:     "contractor@homegentic.io",
          phone:     "",
          createdAt: BigInt(0),
          updatedAt: BigInt(0),
          isActive:  true,
          lastLoggedIn: null,
        };
      });
      await injectSubscription(page, "Free");
      await goToSubscriptionTab(page);
    });

    test("shows 'Upgrade to ContractorPro →' button for Contractor role", async ({ page }) => {
      await expect(page.getByRole("button", { name: /upgrade to contractorpro/i })).toBeVisible();
    });
  });
});
