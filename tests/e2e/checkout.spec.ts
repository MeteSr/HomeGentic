import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

// Stub the Stripe intent endpoint so no live key is needed.
// Returns a minimal clientSecret; Stripe.js itself is not loaded in jsdom
// so the PaymentElement skeleton renders but never calls out to Stripe.
async function mockStripeIntent(page: Parameters<typeof injectTestAuth>[0]) {
  await page.route("**/api/stripe/create-subscription-intent", (route) =>
    route.fulfill({
      status:      200,
      contentType: "application/json",
      body:        JSON.stringify({
        clientSecret:   "pi_test_abc123_secret_xyz",
        subscriptionId: "sub_test_abc123",
      }),
    })
  );
}

test.describe("CheckoutPage — /checkout", () => {
  // ── Unauthenticated view ───────────────────────────────────────────────────

  test.describe("unauthenticated", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto("/checkout?tier=Pro&billing=Monthly");
    });

    test("shows HomeGentic logo in header", async ({ page }) => {
      await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
    });

    test("shows plan label in summary card", async ({ page }) => {
      await expect(page.getByText("Pro").first()).toBeVisible();
    });

    test("shows monthly price in summary card", async ({ page }) => {
      await expect(page.getByText("$20/mo")).toBeVisible();
    });

    test("shows 'Change plan' back link to /pricing", async ({ page }) => {
      await page.getByText(/← Change plan/i).click();
      await expect(page).toHaveURL("/pricing");
    });

    test("shows login step with 'Sign in to continue' button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /sign in to continue/i })).toBeVisible();
    });

    test("shows 'Verify your identity first' heading", async ({ page }) => {
      await expect(page.getByText(/Verify your identity first/i)).toBeVisible();
    });
  });

  // ── Unknown tier ───────────────────────────────────────────────────────────

  test("unknown tier shows error message with back link", async ({ page }) => {
    await page.goto("/checkout?tier=SuperDeluxe&billing=Monthly");
    await expect(page.getByText(/Unknown plan/i)).toBeVisible();
    await expect(page.getByText(/Back to pricing/i)).toBeVisible();
  });

  // ── Authenticated view ─────────────────────────────────────────────────────

  test.describe("authenticated", () => {
    test.beforeEach(async ({ page }) => {
      await injectTestAuth(page);
      await mockStripeIntent(page);
      await page.goto("/checkout?tier=Pro&billing=Monthly");
    });

    test("shows 'Identity verified' badge", async ({ page }) => {
      await expect(page.getByText(/Identity verified/i)).toBeVisible();
    });

    test("shows Card payment toggle button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /card/i })).toBeVisible();
    });

    test("shows ICP payment toggle button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /icp/i })).toBeVisible();
    });

    test("Card tab is active by default", async ({ page }) => {
      // Card button should appear with active styling (plum background)
      await expect(page.getByRole("button", { name: /card/i })).toBeVisible();
      // ICP tab should also be visible to toggle
      await expect(page.getByRole("button", { name: /icp/i })).toBeVisible();
    });

    test("switching to ICP tab shows 'Pay with ICP' button", async ({ page }) => {
      await page.getByRole("button", { name: /icp/i }).click();
      await expect(page.getByRole("button", { name: /pay with icp/i })).toBeVisible();
    });

    test("switching to ICP tab shows 'No processing fees' note", async ({ page }) => {
      await page.getByRole("button", { name: /icp/i }).click();
      await expect(page.getByText(/No processing fees/i)).toBeVisible();
    });

    test("switching back to Card tab hides ICP button", async ({ page }) => {
      await page.getByRole("button", { name: /icp/i }).click();
      await expect(page.getByRole("button", { name: /pay with icp/i })).toBeVisible();
      await page.getByRole("button", { name: /card/i }).click();
      await expect(page.getByRole("button", { name: /pay with icp/i })).not.toBeVisible();
    });

    test("shows plan features in summary card", async ({ page }) => {
      await expect(page.getByText(/5 properties/i)).toBeVisible();
      await expect(page.getByText(/verified badge/i)).toBeVisible();
    });

    test("shows 'Cancel anytime' trust signal", async ({ page }) => {
      await expect(page.getByText(/Cancel anytime/i)).toBeVisible();
    });

    test("shows 'Secured by Stripe' trust signal on card tab", async ({ page }) => {
      await expect(page.getByText(/Secured by Stripe/i)).toBeVisible();
    });
  });

  // ── Yearly billing ─────────────────────────────────────────────────────────

  test("yearly billing shows /yr price and '2 months free' note", async ({ page }) => {
    await injectTestAuth(page);
    await mockStripeIntent(page);
    await page.goto("/checkout?tier=Pro&billing=Yearly");
    await expect(page.getByText("$200/yr")).toBeVisible();
    await expect(page.getByText(/2 months free/i)).toBeVisible();
  });

  // ── Plan metadata ──────────────────────────────────────────────────────────

  test("Basic plan shows $10/mo", async ({ page }) => {
    await page.goto("/checkout?tier=Basic&billing=Monthly");
    await expect(page.getByText("$10/mo")).toBeVisible();
  });

  test("Premium plan shows $35/mo", async ({ page }) => {
    await page.goto("/checkout?tier=Premium&billing=Monthly");
    await expect(page.getByText("$35/mo")).toBeVisible();
  });

  test("ContractorPro plan shows $30/mo", async ({ page }) => {
    await page.goto("/checkout?tier=ContractorPro&billing=Monthly");
    await expect(page.getByText("$30/mo")).toBeVisible();
  });
});
