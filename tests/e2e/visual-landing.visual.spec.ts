/**
 * Visual regression baseline — landing page (#432)
 *
 * Public page, no auth/mock injection needed. Captured at both the
 * desktop (1280×800) and mobile (375×812) projects defined in
 * playwright.visual.config.ts.
 */

import { test, expect } from "@playwright/test";
import { freezeClock } from "./helpers/visual";

test.describe("Visual — landing page (/)", () => {
  test("matches baseline", async ({ page }) => {
    await freezeClock(page);
    await page.goto("/");
    await expect(page.getByText(/HomeGentic/).first()).toBeVisible();
    await expect(page).toHaveScreenshot("landing.png", { fullPage: true });
  });
});
