import { test, expect } from "@playwright/test";

// /mobile-auth is the Internet Identity sign-in bridge the mobile app opens.
// A valid Ed25519 DER public key (hex) is 88 characters with this prefix.
const PUBKEY = "302a300506032b6570032100" + "ab".repeat(32);

test.describe("MobileAuthPage — /mobile-auth", () => {
  test("explains a broken link instead of offering sign-in", async ({ page }) => {
    await page.goto("/mobile-auth");
    await expect(page.getByRole("heading", { name: /this link doesn't work/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /internet identity/i })).toHaveCount(0);
  });

  test("offers Internet Identity sign-in for a valid app key", async ({ page }) => {
    await page.goto(`/mobile-auth?pubkey=${PUBKEY}&maxTimeToLive=28800000000000`);
    await expect(page.getByRole("heading", { name: /sign in to the homegentic app/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with internet identity/i })).toBeEnabled();
  });
});
