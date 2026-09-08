import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

// Pricing page is public — no auth injection needed for most tests

test.describe("PricingPage — /pricing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows HomeGentic logo in nav", async ({ page }) => {
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
  });

  test("shows 'Simple, transparent pricing' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /simple, transparent pricing/i })).toBeVisible();
  });

  test("shows 'Upgrade when you're ready.' subtext", async ({ page }) => {
    await expect(page.getByText(/Upgrade when you're ready/)).toBeVisible();
  });

  // ── Plan card (homeowner view — single Pro plan) ──────────────────────────

  test("shows Pro plan card", async ({ page }) => {
    await expect(page.getByText("Pro").first()).toBeVisible();
  });

  test("shows $59/year price for Pro", async ({ page }) => {
    await expect(page.getByText(/\$59/)).toBeVisible();
  });

  test("shows 'See plans for pros' link pointing to /for-pros", async ({ page }) => {
    const link = page.getByRole("link", { name: /see plans for pros/i });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/for-pros");
  });

  // ── Plan features (rendered in plan cards) ───────────────────────────────

  test("shows property count feature in plan card", async ({ page }) => {
    // Feature comparison table removed; features now listed in the plan card
    await expect(page.getByText(/20 properties/i).first()).toBeVisible();
  });

  test("shows Warranty Wallet feature row", async ({ page }) => {
    await expect(page.getByText("Warranty Wallet").first()).toBeVisible();
  });

  test("shows Recurring Services feature row", async ({ page }) => {
    await expect(page.getByText("Recurring Services").first()).toBeVisible();
  });

  test("shows Market Intelligence feature row", async ({ page }) => {
    await expect(page.getByText("Market Intelligence").first()).toBeVisible();
  });

  test("shows Insurance Defense Mode feature row", async ({ page }) => {
    await expect(page.getByText("Insurance Defense Mode").first()).toBeVisible();
  });

  // ── Page copy ─────────────────────────────────────────────────────────────

  test("shows pricing tagline", async ({ page }) => {
    await expect(page.getByText(/Simple, transparent pricing/i)).toBeVisible();
  });

  test("shows gift callout for realtors", async ({ page }) => {
    await expect(page.getByText(/Gifting for a client/i)).toBeVisible();
  });

  test("shows cancel anytime copy", async ({ page }) => {
    await expect(page.getByText(/Cancel anytime/i)).toBeVisible();
  });

  // ── CTA navigation ────────────────────────────────────────────────────────

  test("'Get Pro' CTA navigates to checkout or login", async ({ page }) => {
    // Inject auth so the click navigates directly to /checkout instead of
    // stamping the intent into the URL and waiting for Internet Identity.
    await injectTestAuth(page);
    await page.goto("/pricing");
    await page.getByRole("button", { name: /Get Pro/i }).click();
    await expect(page).toHaveURL(/\/(checkout|dashboard|login)/);
  });
});
