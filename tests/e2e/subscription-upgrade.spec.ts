import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";

// Navigate to Settings → Subscription tab
async function goToSubscriptionTab(page: Parameters<typeof injectTestAuth>[0]) {
  await page.goto("/settings");
  await page.getByRole("button", { name: /subscription/i }).click();
}

test.describe("SettingsPage — Subscription tab tier-gated UI", () => {
  // ── Paid tier (Basic, grandfathered) ─────────────────────────────────────────

  test.describe("Basic tier (paid, grandfathered)", () => {
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

  // ── Pro tier — the only purchasable plan, so nothing to switch to ────────────

  test.describe("Pro tier (current plan, only purchasable plan)", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await injectSubscription(page, "Pro");
      await goToSubscriptionTab(page);
    });

    test("shows no 'Switch Plan' section (Pro is the only homeowner plan)", async ({ page }) => {
      await expect(page.getByText("Switch Plan")).toHaveCount(0);
    });

    test("shows no 'Switch' buttons in the subscription tab", async ({ page }) => {
      await expect(page.getByRole("button", { name: /^switch$/i })).toHaveCount(0);
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

    test("shows the ContractorBillingPanel's 'Upgrade to Pro' CTA for Contractor role", async ({ page }) => {
      // Settings > Subscription now renders ContractorBillingPanel for Contractor
      // role instead of the generic tier-upgrade button.
      await expect(page.getByText("Contractor Free")).toBeVisible();
      await expect(page.getByRole("button", { name: /upgrade to pro/i })).toBeVisible();
    });
  });
});
