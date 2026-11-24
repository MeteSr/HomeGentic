import { test, expect } from "@playwright/test";
import { assertNoA11yViolations } from "./helpers/a11y";

// Landing page is fully public

test.describe("LandingPage — /", () => {
  test.afterEach(async ({ page }) => {
    await assertNoA11yViolations(page);
  });
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // ── Nav ───────────────────────────────────────────────────────────────────

  test("shows HomeGentic logo in nav", async ({ page }) => {
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
  });

  test("shows nav links including Pricing and The record", async ({ page }) => {
    // Real links (crawlers follow only hrefs); in-page ones point at sections.
    await expect(page.getByRole("link", { name: "The record" }).first()).toHaveAttribute("href", "#hg-how");
    await expect(page.getByRole("link", { name: "Pricing" }).first()).toHaveAttribute("href", "#hg-pricing");
    await expect(page.getByRole("link", { name: "Contractors" }).first()).toHaveAttribute("href", "/for-pros");
  });

  test("Pricing nav link scrolls to the pricing section", async ({ page }) => {
    // Section ID is now hg-pricing (was hfl-pricing-section)
    await page.getByText("Pricing").first().click();
    await expect(page.locator("#hg-pricing")).toBeVisible();
  });

  // ── Hero CTA ──────────────────────────────────────────────────────────────

  test("shows a primary CTA button in the hero", async ({ page }) => {
    // Hero CTA is now 'Start your record' (was 'Get Started')
    const cta = page.getByRole("link", { name: /start your record|start free/i }).first();
    await expect(cta).toBeVisible();
  });

  test("hero primary CTA triggers auth flow", async ({ page }) => {
    await page.getByRole("link", { name: /start your record/i }).first().click();
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });

  // ── Hero content ──────────────────────────────────────────────────────────

  test("shows hero heading text", async ({ page }) => {
    await expect(page.locator("h1").first()).toBeVisible();
  });

  // ── Pricing section ───────────────────────────────────────────────────────

  test("shows Pricing section", async ({ page }) => {
    // Section ID is now hg-pricing (was hfl-pricing-section)
    await expect(page.locator("#hg-pricing")).toBeVisible();
  });

  // ── How it works section ──────────────────────────────────────────────────

  test("shows 'The record' section", async ({ page }) => {
    // Section ID is now hg-how (was hfl-features-section)
    await expect(page.locator("#hg-how")).toBeVisible();
  });

  // ── Nav CTA ───────────────────────────────────────────────────────────────

  test("shows Log in / Start free action in nav", async ({ page }) => {
    // Nav CTA labels changed: 'Log in' + 'Start free' (was 'Sign In' / 'Get Started')
    await expect(page.getByRole("link", { name: /log in|start free/i }).first()).toBeVisible();
  });
});
