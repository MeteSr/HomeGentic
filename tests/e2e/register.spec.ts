import { test, expect } from "@playwright/test";

// Register page is public — no auth injection needed

test.describe("RegisterPage — /register", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/register");
  });

  // ── Page structure ────────────────────────────────────────────────────────

  test("shows HomeFax logo", async ({ page }) => {
    await expect(page.getByText(/HomeFax/)).toBeVisible();
  });

  test("shows 3-step indicator: Role, Details, Confirm", async ({ page }) => {
    await expect(page.getByText("Role")).toBeVisible();
    await expect(page.getByText("Details")).toBeVisible();
    await expect(page.getByText("Confirm")).toBeVisible();
  });

  // ── Step 1 — Role ─────────────────────────────────────────────────────────

  test("shows Step 1 of 3 badge on load", async ({ page }) => {
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
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
    await page.getByText("Homeowner").click();
    await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  test("selecting Contractor role enables Continue", async ({ page }) => {
    await page.getByText("Contractor").click();
    await expect(page.getByRole("button", { name: /continue/i })).toBeEnabled();
  });

  // ── Step 2 — Details ──────────────────────────────────────────────────────

  test("clicking Continue advances to step 2", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByText("Step 2 of 3")).toBeVisible();
  });

  test("step 2 shows email and phone fields", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByPlaceholder(/you@example.com/i)).toBeVisible();
    await expect(page.getByPlaceholder(/\+1 \(555\)/i)).toBeVisible();
  });

  test("step 2 shows 'Your details' heading", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await expect(page.getByRole("heading", { name: /your details/i })).toBeVisible();
  });

  test("step 2 Back button returns to step 1", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /back/i }).click();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
  });

  test("step 2 Review button advances to step 3", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /review/i }).click();
    await expect(page.getByText("Step 3 of 3")).toBeVisible();
  });

  // ── Step 3 — Confirm ──────────────────────────────────────────────────────

  test("step 3 shows Confirm heading", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /review/i }).click();
    await expect(page.getByRole("heading", { name: /confirm/i })).toBeVisible();
  });

  test("step 3 shows role value in review table", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /review/i }).click();
    // "Homeowner" appears in the review table as the role value
    const rows = page.getByText("Homeowner");
    await expect(rows.first()).toBeVisible();
  });

  test("step 3 shows 'Not provided' when email/phone blank", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /review/i }).click();
    const notProvided = page.getByText("Not provided");
    await expect(notProvided.first()).toBeVisible();
  });

  test("step 3 shows Create Account button", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByRole("button", { name: /review/i }).click();
    await expect(page.getByRole("button", { name: /create account/i })).toBeVisible();
  });

  test("step 3 email is shown in review table when entered", async ({ page }) => {
    await page.getByText("Homeowner").click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByPlaceholder(/you@example.com/i).fill("test@example.com");
    await page.getByRole("button", { name: /review/i }).click();
    await expect(page.getByText("test@example.com")).toBeVisible();
  });
});
