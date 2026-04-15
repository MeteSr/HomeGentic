import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

// In DEV mode, PaymentSuccessPage calls the Express voice server for
// verification — mock those routes so no live server is required.

test.describe("PaymentFailurePage — /payment-failure", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/payment-failure");
  });

  test("shows 'Payment cancelled' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /payment cancelled/i })).toBeVisible();
  });

  test("shows explanatory copy — no charge was made", async ({ page }) => {
    await expect(page.getByText(/No charge was made/i)).toBeVisible();
  });

  test("'Back to Pricing' link navigates to /pricing", async ({ page }) => {
    await page.getByRole("link", { name: /back to pricing/i }).click();
    await expect(page).toHaveURL("/pricing");
  });

  test("'Return to Dashboard' link navigates to /dashboard or /login", async ({ page }) => {
    await page.getByRole("link", { name: /return to dashboard/i }).click();
    // Unauthenticated users are redirected to /login
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });
});

// ── PaymentSuccessPage — /payment-success ─────────────────────────────────────

test.describe("PaymentSuccessPage — legacy session flow", () => {
  test("no session_id shows error state", async ({ page }) => {
    await page.goto("/payment-success");
    await expect(page.getByText(/something went wrong|no session id/i)).toBeVisible();
  });

  test("failed verify-session shows 'Something went wrong'", async ({ page }) => {
    await page.route("**/api/stripe/verify-session", (route) =>
      route.fulfill({
        status:      500,
        contentType: "application/json",
        body:        JSON.stringify({ error: "Stripe session not found" }),
      })
    );
    await page.goto("/payment-success?session_id=cs_test_error");
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toBeVisible();
    await expect(page.getByText(/Stripe session not found/i)).toBeVisible();
  });

  test("successful verify-session shows 'Welcome to Pro' heading", async ({ page }) => {
    await page.route("**/api/stripe/verify-session", (route) =>
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ type: "subscription", tier: "Pro" }),
      })
    );
    await page.goto("/payment-success?session_id=cs_test_pro");
    await expect(page.getByRole("heading", { name: /welcome to pro/i })).toBeVisible();
  });

  test("successful verify-session shows 'Go to Dashboard' CTA", async ({ page }) => {
    await page.route("**/api/stripe/verify-session", (route) =>
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ type: "subscription", tier: "Pro" }),
      })
    );
    await page.goto("/payment-success?session_id=cs_test_pro");
    await expect(page.getByRole("link", { name: /go to dashboard/i })).toBeVisible();
  });

  test("gift verify-session shows 'Gift is on its way' heading", async ({ page }) => {
    await page.route("**/api/stripe/verify-session", (route) =>
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ type: "gift", giftToken: "GIFT-TEST-TOKEN-ABC" }),
      })
    );
    await page.goto("/payment-success?session_id=cs_test_gift");
    await expect(page.getByRole("heading", { name: /gift is on its way/i })).toBeVisible();
  });

  test("gift state shows the gift token", async ({ page }) => {
    await page.route("**/api/stripe/verify-session", (route) =>
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ type: "gift", giftToken: "GIFT-TEST-TOKEN-ABC" }),
      })
    );
    await page.goto("/payment-success?session_id=cs_test_gift");
    await expect(page.getByText("GIFT-TEST-TOKEN-ABC")).toBeVisible();
  });

  test("error state shows 'Back to Pricing' link", async ({ page }) => {
    await page.route("**/api/stripe/verify-session", (route) =>
      route.fulfill({
        status:      500,
        contentType: "application/json",
        body:        JSON.stringify({ error: "Stripe session not found" }),
      })
    );
    await page.goto("/payment-success?session_id=cs_test_error");
    await expect(page.getByRole("link", { name: /back to pricing/i })).toBeVisible();
  });
});

test.describe("PaymentSuccessPage — new PaymentElement flow", () => {
  test("unauthenticated with subscription_id shows 'Payment confirmed' and login CTA", async ({ page }) => {
    // No injectTestAuth — user is not authenticated
    await page.goto("/payment-success?subscription_id=sub_test_123&tier=Pro&billing=Monthly");
    await expect(page.getByRole("heading", { name: /payment confirmed/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /set up my account/i })).toBeVisible();
  });

  test("authenticated subscription_id shows 'Welcome to Pro' on success", async ({ page }) => {
    await injectTestAuth(page);
    await page.route("**/api/stripe/verify-subscription", (route) =>
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ tier: "Pro" }),
      })
    );
    await page.goto(
      "/payment-success?subscription_id=sub_test_123&tier=Pro&billing=Monthly&redirect_status=succeeded"
    );
    await expect(page.getByRole("heading", { name: /welcome to pro/i })).toBeVisible();
  });

  test("authenticated subscription_id verify failure shows 'Something went wrong'", async ({ page }) => {
    await injectTestAuth(page);
    await page.route("**/api/stripe/verify-subscription", (route) =>
      route.fulfill({
        status:      500,
        contentType: "application/json",
        body:        JSON.stringify({ error: "Subscription not found" }),
      })
    );
    await page.goto(
      "/payment-success?subscription_id=sub_fail_999&tier=Pro&billing=Monthly"
    );
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toBeVisible();
  });

  test("success state shows 'Redirecting automatically' note", async ({ page }) => {
    await injectTestAuth(page);
    await page.route("**/api/stripe/verify-subscription", (route) =>
      route.fulfill({
        status:      200,
        contentType: "application/json",
        body:        JSON.stringify({ tier: "Premium" }),
      })
    );
    await page.goto(
      "/payment-success?subscription_id=sub_test_prem&tier=Premium&billing=Monthly"
    );
    await expect(page.getByText(/redirecting automatically/i)).toBeVisible();
  });
});
