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

  test("shows current nav links including Pricing", async ({ page }) => {
    await expect(page.locator("nav li a", { hasText: "Features" })).toBeVisible();
    await expect(page.locator("nav li a", { hasText: "Pricing" })).toBeVisible();
  });

  test("Pricing nav link scrolls to the pricing section", async ({ page }) => {
    await page.locator("nav li a", { hasText: "Pricing" }).click();
    await expect(page.locator("#hfl-pricing-section")).toBeVisible();
  });

  // ── Hero CTA ──────────────────────────────────────────────────────────────

  test("shows a 'Get Started' CTA button in the hero", async ({ page }) => {
    const cta = page.getByRole("button", { name: /get started/i }).first();
    await expect(cta).toBeVisible();
  });

  test("hero 'Get Started' CTA triggers auth flow", async ({ page }) => {
    await page.getByRole("button", { name: /get started/i }).first().click();
    await expect(page).toHaveURL(/\/(dashboard|login)/);
  });

  // ── Hero content ──────────────────────────────────────────────────────────

  test("shows hero heading text", async ({ page }) => {
    await expect(page.locator("h1").first()).toBeVisible();
  });

  // ── Pricing section ───────────────────────────────────────────────────────

  test("shows Pricing section heading", async ({ page }) => {
    await expect(page.locator("#hfl-pricing-section")).toBeVisible();
  });

  // ── Features section ─────────────────────────────────────────────────────

  test("shows Features section", async ({ page }) => {
    await expect(page.locator("#hfl-features-section")).toBeVisible();
  });

  // ── Mobile nav ────────────────────────────────────────────────────────────

  test("hamburger menu is hidden at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const hamburger = page.locator(".hfl-hamburger");
    await expect(hamburger).toBeHidden();
  });

  test("hamburger menu is visible at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const hamburger = page.locator(".hfl-hamburger");
    await expect(hamburger).toBeVisible();
  });

  // ── Nav CTA ───────────────────────────────────────────────────────────────

  test("shows Sign In link in nav", async ({ page }) => {
    await expect(page.getByRole("button", { name: /sign in|get started/i }).first()).toBeVisible();
  });
});
