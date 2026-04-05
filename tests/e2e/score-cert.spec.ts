import { test, expect } from "@playwright/test";

// Score certificate page is public — no auth needed
// Token is base64-encoded JSON matching CertPayload

const VALID_TOKEN = Buffer.from(
  JSON.stringify({
    address:     "123 Maple St",
    score:       91,
    grade:       "A+",
    certified:   true,
    generatedAt: 1711670400000,
  })
)
  .toString("base64")
  .replace(/=/g, "");

const INVALID_TOKEN = "not-valid-base64-cert";

test.describe("ScoreCertPage — /cert/:token", () => {
  // ── Valid token ───────────────────────────────────────────────────────────

  test.describe("valid token", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/cert/${VALID_TOKEN}`);
    });

    test("shows HomeGentic Lender Certificate heading", async ({ page }) => {
      await expect(page.getByText(/Certificate/i)).toBeVisible();
    });

    test("shows the address from the token", async ({ page }) => {
      await expect(page.getByText("123 Maple St")).toBeVisible();
    });

    test("shows the score value of 91", async ({ page }) => {
      await expect(page.getByText("91")).toBeVisible();
    });

    test("shows the grade A+", async ({ page }) => {
      await expect(page.getByText("A+")).toBeVisible();
    });

    test("shows 'Powered by HomeGentic' footer", async ({ page }) => {
      await expect(page.getByText(/Powered by/i)).toBeVisible();
      await expect(page.getByText(/HomeGentic/)).toBeVisible();
    });

    test("shows the generated date", async ({ page }) => {
      // 1711670400000 → March 28, 2024
      await expect(page.getByText(/2024/)).toBeVisible();
    });
  });

  // ── Invalid token ─────────────────────────────────────────────────────────

  test.describe("invalid token", () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`/cert/${INVALID_TOKEN}`);
    });

    test("shows 'Invalid certificate' heading", async ({ page }) => {
      await expect(page.getByRole("heading", { name: /invalid certificate/i })).toBeVisible();
    });

    test("shows guidance to ask homeowner for a new one", async ({ page }) => {
      await expect(page.getByText(/generate a new one/i)).toBeVisible();
    });

    test("shows 'Powered by HomeGentic' footer even on error state", async ({ page }) => {
      await expect(page.getByText(/Powered by/i)).toBeVisible();
    });
  });
});
