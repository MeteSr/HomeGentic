import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

// In DEV mode, PaymentSuccessPage checks window.__e2e_verifySession /
// window.__e2e_verifySubscription before calling the Express voice server.
// We inject those globals via addInitScript so no live server is needed.

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
    // Use heading role to avoid strict-mode violation (both h1 and p contain matching text).
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toBeVisible();
  });

  test("failed verify-session shows 'Something went wrong'", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_verifySession = { error: "Stripe session not found" };
    });
    await page.goto("/payment-success?session_id=cs_test_error");
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toBeVisible();
    await expect(page.getByText(/Stripe session not found/i)).toBeVisible();
  });

  test("successful verify-session shows 'Welcome to Pro' heading", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_verifySession = { type: "subscription", tier: "Pro" };
    });
    await page.goto("/payment-success?session_id=cs_test_pro");
    await expect(page.getByRole("heading", { name: /welcome to pro/i })).toBeVisible();
  });

  test("successful verify-session shows 'Go to Dashboard' CTA", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_verifySession = { type: "subscription", tier: "Pro" };
    });
    await page.goto("/payment-success?session_id=cs_test_pro");
    await expect(page.getByRole("link", { name: /go to dashboard/i })).toBeVisible();
  });

  test("gift verify-session shows 'Gift is on its way' heading", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_verifySession = { type: "gift", giftToken: "GIFT-TEST-TOKEN-ABC" };
    });
    await page.goto("/payment-success?session_id=cs_test_gift");
    await expect(page.getByRole("heading", { name: /gift is on its way/i })).toBeVisible();
  });

  test("gift state shows the gift token", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_verifySession = { type: "gift", giftToken: "GIFT-TEST-TOKEN-ABC" };
    });
    await page.goto("/payment-success?session_id=cs_test_gift");
    await expect(page.getByText("GIFT-TEST-TOKEN-ABC")).toBeVisible();
  });

  test("error state shows 'Back to Pricing' link", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_verifySession = { error: "Stripe session not found" };
    });
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
    await page.addInitScript(() => {
      (window as any).__e2e_verifySubscription = { tier: "Pro" };
    });
    await page.goto(
      "/payment-success?subscription_id=sub_test_123&tier=Pro&billing=Monthly&redirect_status=succeeded"
    );
    await expect(page.getByRole("heading", { name: /welcome to pro/i })).toBeVisible();
  });

  test("authenticated subscription_id verify failure shows 'Something went wrong'", async ({ page }) => {
    await injectTestAuth(page);
    await page.addInitScript(() => {
      (window as any).__e2e_verifySubscription = { error: "Subscription not found" };
    });
    await page.goto(
      "/payment-success?subscription_id=sub_fail_999&tier=Pro&billing=Monthly"
    );
    await expect(page.getByRole("heading", { name: /something went wrong/i })).toBeVisible();
  });

  test("success state shows 'Redirecting automatically' note", async ({ page }) => {
    await injectTestAuth(page);
    await page.addInitScript(() => {
      (window as any).__e2e_verifySubscription = { tier: "Pro" };
    });
    await page.goto(
      "/payment-success?subscription_id=sub_test_pro&tier=Pro&billing=Yearly"
    );
    await expect(page.getByText(/redirecting automatically/i)).toBeVisible();
  });
});
