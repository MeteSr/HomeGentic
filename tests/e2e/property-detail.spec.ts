import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

test.describe("PropertyDetailPage — /properties/1", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/properties/1");
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
  });

  test("header '+ Add room' button opens the Add Room modal, not Log Job", async ({ page }) => {
    await page.getByRole("button", { name: /\+ add room/i }).click();
    await expect(page.getByRole("heading", { name: /^add room$/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /what was done/i })).toHaveCount(0);
  });
});
