import { test, expect } from "@playwright/test";

// Pricing page is public — no auth injection needed

test.describe("PricingPage — /pricing", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows HomeFax logo in nav", async ({ page }) => {
    await expect(page.getByText(/HomeFax/)).toBeVisible();
  });

  test("shows 'Get Started Free' nav button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /get started free/i })).toBeVisible();
  });

  test("shows 'Pricing' eyebrow badge", async ({ page }) => {
    await expect(page.getByText("Pricing")).toBeVisible();
  });

  test("shows 'Simple, transparent pricing' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /simple, transparent pricing/i })).toBeVisible();
  });

  test("shows 'Start free. Upgrade when you're ready.' subtext", async ({ page }) => {
    await expect(page.getByText(/Start free/)).toBeVisible();
  });

  // ── Plan cards ────────────────────────────────────────────────────────────

  test("shows Free plan card", async ({ page }) => {
    await expect(page.getByText("Free")).toBeVisible();
  });

  test("shows Pro plan card", async ({ page }) => {
    await expect(page.getByText("Pro")).toBeVisible();
  });

  test("shows Premium plan card", async ({ page }) => {
    await expect(page.getByText("Premium")).toBeVisible();
  });

  test("shows ContractorPro plan card", async ({ page }) => {
    await expect(page.getByText("ContractorPro")).toBeVisible();
  });

  test("shows $0 price for Free tier", async ({ page }) => {
    await expect(page.getByText("$0")).toBeVisible();
  });

  test("shows $9 price for Pro tier", async ({ page }) => {
    await expect(page.getByText(/\$9/)).toBeVisible();
  });

  test("shows $49 price for Premium tier", async ({ page }) => {
    await expect(page.getByText(/\$49/)).toBeVisible();
  });

  // ── Feature comparison table ──────────────────────────────────────────────

  test("shows feature comparison table with Properties row", async ({ page }) => {
    await expect(page.getByText("Properties")).toBeVisible();
  });

  test("shows Warranty Wallet feature row", async ({ page }) => {
    await expect(page.getByText("Warranty Wallet")).toBeVisible();
  });

  test("shows Recurring Services feature row", async ({ page }) => {
    await expect(page.getByText("Recurring Services")).toBeVisible();
  });

  test("shows Market Intelligence feature row", async ({ page }) => {
    await expect(page.getByText("Market Intelligence")).toBeVisible();
  });

  test("shows Insurance Defense Mode feature row", async ({ page }) => {
    await expect(page.getByText("Insurance Defense Mode")).toBeVisible();
  });

  // ── FAQs ──────────────────────────────────────────────────────────────────

  test("shows FAQ section", async ({ page }) => {
    await expect(page.getByText(/How does blockchain verification work/i)).toBeVisible();
  });

  test("shows ICP FAQ question", async ({ page }) => {
    await expect(page.getByText(/What is ICP/i)).toBeVisible();
  });

  test("shows cancel anytime FAQ", async ({ page }) => {
    await expect(page.getByText(/Can I cancel anytime/i)).toBeVisible();
  });

  // ── CTA navigation ────────────────────────────────────────────────────────

  test("'Get Started Free' CTA triggers login flow", async ({ page }) => {
    // Clicking invokes login() — in dev mode this navigates to /dashboard
    await page.getByRole("button", { name: /get started free/i }).click();
    // Accepts /dashboard (dev login) or remains on /login
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });
});
