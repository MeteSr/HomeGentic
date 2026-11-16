import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

// /register is a ProtectedRoute — auth injection required

test.describe("RegisterPage — /register", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/register");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows HomeGentic logo", async ({ page }) => {
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
  });

  test("shows 2-step indicator: Role, Details", async ({ page }) => {
    await expect(page.getByText("Role", { exact: true })).toBeVisible();
    await expect(page.getByText("Details", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirm", { exact: true })).toHaveCount(0);
  });

  // ── Step 1 — Role ─────────────────────────────────────────────────────────

  test("shows Step 1 of 2 badge on load", async ({ page }) => {
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
  });

  test("shows 'I am a…' heading on step 1", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /I am a/i })).toBeVisible();
  });

  test("shows Homeowner, Contractor, and Realtor role options", async ({ page }) => {
    await expect(page.getByText("Homeowner")).toBeVisible();
    await expect(page.getByText("Contractor")).toBeVisible();
    await expect(page.getByText("Realtor")).toBeVisible();
  });

  test("Continue button is disabled when no role selected", async ({ page }) => {
    await expect(page.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  test("selecting a role enables the Continue button", async ({ page }) => {
    await page.getByRole("radio", { name: /Homeowner/ }).check();
    await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  test("selecting Contractor role enables Continue", async ({ page }) => {
    await page.getByRole("radio", { name: /Contractor/ }).check();
    await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  // ── Step 2 — Details ──────────────────────────────────────────────────────

  test("clicking Continue advances to step 2", async ({ page }) => {
    await page.getByRole("radio", { name: /Homeowner/ }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText("Step 2 of 2")).toBeVisible();
  });

  test("step 2 shows email and phone fields", async ({ page }) => {
    await page.getByRole("radio", { name: /Homeowner/ }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible();
    await expect(page.getByPlaceholder(/\+1 \(555\)/i)).toBeVisible();
  });

  test("step 2 shows 'Your details' heading", async ({ page }) => {
    await page.getByRole("radio", { name: /Homeowner/ }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByRole("heading", { name: /your details/i })).toBeVisible();
  });

  test("step 2 Back button returns to step 1", async ({ page }) => {
    await page.getByRole("radio", { name: /Homeowner/ }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
  });

  test("step 2 Create Account needs a valid email and the terms", async ({ page }) => {
    await page.getByRole("radio", { name: /Homeowner/ }).check();
    await page.getByRole("button", { name: /continue/i }).click();
    const create = page.getByRole("button", { name: /create account/i });
    await expect(create).toBeDisabled();
    await page.getByPlaceholder(/you@example.com/i).fill("test@example.com");
    await expect(create).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(create).toBeEnabled();
  });

  test("roles can be chosen from the keyboard", async ({ page }) => {
    await page.getByRole("radio", { name: /Homeowner/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /Contractor/ })).toBeChecked();
  });
});
