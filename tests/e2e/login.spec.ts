import { test, expect } from "@playwright/test";

// Login page is public — no auth injection needed

test.describe("LoginPage — /login", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows HomeFax logo", async ({ page }) => {
    await expect(page.getByText(/HomeFax/)).toBeVisible();
  });

  test("shows 'Sign In' eyebrow label", async ({ page }) => {
    await expect(page.getByText("Sign In")).toBeVisible();
  });

  test("shows 'Welcome back.' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
  });

  test("shows Internet Identity description text", async ({ page }) => {
    await expect(page.getByText(/Internet Identity/)).toBeVisible();
  });

  test("shows 'What is Internet Identity?' label", async ({ page }) => {
    await expect(page.getByText(/What is Internet Identity/i)).toBeVisible();
  });

  test("shows Sign in with Internet Identity button", async ({ page }) => {
    await expect(page.getByRole("button", { name: /sign in with internet identity/i })).toBeVisible();
  });

  // ── Dev login (only rendered when import.meta.env.DEV is true) ────────────

  test("shows Dev Login button in dev mode", async ({ page }) => {
    // Vite dev server sets DEV=true — this button should be present
    await expect(page.getByRole("button", { name: /dev login/i })).toBeVisible();
  });

  test("shows 'Local dev only' label above Dev Login", async ({ page }) => {
    await expect(page.getByText(/local dev only/i)).toBeVisible();
  });

  // ── Dev login redirect ────────────────────────────────────────────────────

  test("dev login button click navigates to /dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /dev login/i }).click();
    await expect(page).toHaveURL("/dashboard");
  });

  // ── Protected route redirect ──────────────────────────────────────────────

  test("unauthenticated access to /dashboard redirects to /login", async ({ page }) => {
    // Without auth injection, PrivateRoute should redirect to /login
    await page.goto("/dashboard");
    await expect(page).toHaveURL("/login");
  });

  test("unauthenticated access to /settings redirects to /login", async ({ page }) => {
    await page.goto("/settings");
    await expect(page).toHaveURL("/login");
  });

  // ── Back link ─────────────────────────────────────────────────────────────

  test("shows '← Back to HomeFax' link", async ({ page }) => {
    await expect(page.getByText(/← Back to HomeFax/)).toBeVisible();
  });

  test("back link navigates to /", async ({ page }) => {
    await page.getByText(/← Back to HomeFax/).click();
    await expect(page).toHaveURL("/");
  });

  // ── No account link ───────────────────────────────────────────────────────

  test("shows 'No account?' text with Create one link", async ({ page }) => {
    await expect(page.getByText(/No account/)).toBeVisible();
    await expect(page.getByText(/Create one free/)).toBeVisible();
  });
});
