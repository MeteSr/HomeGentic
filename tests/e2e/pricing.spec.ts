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

  test("shows 'Pricing' eyebrow badge", async ({ page }) => {
    await expect(page.getByText("Pricing").first()).toBeVisible();
  });

  test("shows 'Simple, transparent pricing' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /simple, transparent pricing/i })).toBeVisible();
  });

  test("shows 'Upgrade when you're ready.' subtext", async ({ page }) => {
    await expect(page.getByText(/Upgrade when you're ready/)).toBeVisible();
  });

  // ── Plan cards (homeowner view) ───────────────────────────────────────────

  test("shows Basic plan card", async ({ page }) => {
    await expect(page.getByText("Basic").first()).toBeVisible();
  });

  test("shows Pro plan card", async ({ page }) => {
    await expect(page.getByText("Pro").first()).toBeVisible();
  });

  test("shows Premium plan card", async ({ page }) => {
    await expect(page.getByText("Premium").first()).toBeVisible();
  });

  test("shows $10 price for Basic tier", async ({ page }) => {
    await expect(page.getByText(/\$10/)).toBeVisible();
  });

  test("shows $20 price for Pro tier", async ({ page }) => {
    await expect(page.getByText(/\$20/)).toBeVisible();
  });

  test("shows $40 price for Premium tier", async ({ page }) => {
    await expect(page.getByText(/\$40/)).toBeVisible();
  });

  test("shows ContractorPro plan card in contractor view", async ({ page }) => {
    await page.getByRole("button", { name: /contractor/i }).click();
    await expect(page.getByText("Contractor Pro", { exact: true })).toBeVisible();
  });

  // ── Feature comparison table ──────────────────────────────────────────────

  test("shows feature comparison table with Properties row", async ({ page }) => {
    await expect(page.getByText("Properties").first()).toBeVisible();
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

  test("'Start with Basic' CTA navigates to checkout or login", async ({ page }) => {
    // Inject auth so the click navigates directly to /checkout instead of
    // stamping the intent into the URL and waiting for Internet Identity.
    await injectTestAuth(page);
    await page.goto("/pricing");
    await page.getByRole("button", { name: /Start with Basic/i }).click();
    await expect(page).toHaveURL(/\/(checkout|dashboard|login)/);
  });
});
