/**
 * Visual regression baseline — pricing page (#432)
 *
 * Public page, no auth/mock injection needed.
 */

import { test, expect } from "@playwright/test";
import { freezeClock } from "./helpers/visual";

test.describe("Visual — pricing page (/pricing)", () => {
  test("matches baseline", async ({ page }) => {
    await freezeClock(page);
    await page.goto("/pricing");
    await expect(page.getByText(/simple, transparent pricing/i)).toBeVisible();
    await expect(page).toHaveScreenshot("pricing.png", { fullPage: true });
  });
});
