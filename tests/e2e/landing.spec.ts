import { test, expect } from "@playwright/test";

// Landing page is fully public

test.describe("LandingPage — /", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  // ── Nav ───────────────────────────────────────────────────────────────────

  test("shows HomeGentic logo in nav", async ({ page }) => {
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
  });

  test("shows nav links: Features, How It Works, Pricing", async ({ page }) => {
    await expect(page.getByText("Features")).toBeVisible();
    await expect(page.getByText(/How It Works/i)).toBeVisible();
    await expect(page.getByText("Pricing")).toBeVisible();
  });

  test("Pricing nav link navigates to /pricing", async ({ page }) => {
    await page.getByText("Pricing").click();
    await expect(page).toHaveURL("/pricing");
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
    // The hero h1 contains some variant of HomeGentic value proposition
    await expect(page.locator("h1").first()).toBeVisible();
  });

  // ── How it Works section ──────────────────────────────────────────────────

  test("shows How It Works section heading", async ({ page }) => {
    await expect(page.getByText(/How It Works/i)).toBeVisible();
  });

  // ── Features section ─────────────────────────────────────────────────────

  test("shows Features section", async ({ page }) => {
    await expect(page.getByText("Features")).toBeVisible();
  });

  // ── Mobile nav ────────────────────────────────────────────────────────────

  test("hamburger menu is hidden at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const hamburger = page.locator(".hfl-hamburger");
    // Should not be visible at desktop (CSS display: none)
    await expect(hamburger).toBeHidden();
  });

  test("hamburger menu is visible at mobile width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const hamburger = page.locator(".hfl-hamburger");
    await expect(hamburger).toBeVisible();
  });

  // ── Footer / Sign-in links ────────────────────────────────────────────────

  test("shows Sign In link in nav", async ({ page }) => {
    await expect(page.getByRole("button", { name: /sign in|get started/i }).first()).toBeVisible();
  });
});
