/**
 * Visual regression baseline — property detail page (#432)
 *
 * Reuses the standard single-property + 4-job fixture from
 * helpers/testData.ts (injectTestProperties), same one used by
 * property-verify.spec.ts and insurance-risk-profile.spec.ts.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";
import { freezeClock } from "./helpers/visual";

test.describe("Visual — property detail (/properties/1)", () => {
  test("matches baseline", async ({ page }) => {
    await freezeClock(page);
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Basic");
    await page.goto("/properties/1");
    // Text search rather than a role query: the mobile layout (MobilePropertyPage)
    // renders the address in a different element than the desktop heading.
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
    await expect(page).toHaveScreenshot("property-detail.png", { fullPage: true });
  });
});
