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

  test("shows 'Log in' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Log in", exact: true })).toBeVisible();
  });

  test("shows 'Welcome back!' heading on the left panel", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("shows single 'Sign in with Internet Identity' button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /sign in with internet identity/i })).toBeVisible();
  });

  test("shows 'Try the demo' link next to the sign-up prompt", async ({ page }) => {
    await expect(page.getByText(/try the demo/i)).toBeVisible();
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

  test("shows 'New here?' with Get started link", async ({ page }) => {
    await expect(page.getByText(/new here/i)).toBeVisible();
    await expect(page.getByText(/get started/i).first()).toBeVisible();
  });
});
