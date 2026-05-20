import { test, expect } from "@playwright/test";
import { assertNoA11yViolations } from "./helpers/a11y";

// Login page is public — no auth injection needed

test.describe("LoginPage — /login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test.afterEach(async ({ page }) => {
    await assertNoA11yViolations(page);
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows HomeGentic logo", async ({ page }) => {
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
  });

  test("shows 'Log in to your account' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /log in to your account/i })).toBeVisible();
  });

  test("shows 'Welcome back!' heading on the left panel", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("shows Google and Apple sign-in buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with apple/i })).toBeVisible();
  });

  test("shows Internet Computer sign-in button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /continue with internet computer/i })).toBeVisible();
  });

  test("shows 'Secured by Internet Identity' footer note", async ({ page }) => {
    await expect(page.getByText(/Secured by Internet Identity/i)).toBeVisible();
  });

  // ── Dev login (only rendered when import.meta.env.DEV is true) ────────────

  test("shows Dev Login button in dev mode", async ({ page }) => {
    await expect(page.getByRole("button", { name: /dev login/i })).toBeVisible();
  });

  test("shows 'Local dev only' label above Dev Login", async ({ page }) => {
    await expect(page.getByText(/local dev only/i)).toBeVisible();
  });

  // ── Dev login redirect ────────────────────────────────────────────────────

  test("dev login button click navigates to /dashboard for a new user", async ({ page }) => {
    await page.getByRole("button", { name: /dev login/i }).click();
    await expect(page).toHaveURL("/dashboard");
  });

  // ── Protected route redirect ──────────────────────────────────────────────

  test("unauthenticated access to /dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated access to /settings redirects to /login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL("/login");
  });

  // ── Sign-up link ──────────────────────────────────────────────────────────

  test("shows 'Don't have an account?' with Get Started link", async ({ page }) => {
    await expect(page.getByText(/don't have an account/i)).toBeVisible();
    await expect(page.getByText(/get started/i).first()).toBeVisible();
  });
});
