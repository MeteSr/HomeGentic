/**
 * Visual regression baseline — people page (/people)
 *
 * Free-tier upgrade-gate state — PeoplePage reads properties straight from
 * usePropertyStore() rather than a __e2e_properties-style mock path, so the
 * Pro-tier populated view can't be hydrated headlessly here (see PR #517
 * description). The Free-tier gate doesn't depend on that store, renders
 * deterministically, and is what most new visitors actually see.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription } from "./helpers/testData";
import { freezeClock } from "./helpers/visual";

async function setup(page: Parameters<typeof injectTestAuth>[0]) {
  await freezeClock(page);
  await injectSubscription(page, "Free");
  await injectTestAuth(page);
}

test.describe("Visual — people page (/people)", () => {
  test("matches baseline", async ({ page }) => {
    await setup(page);
    await page.goto("/people");
    await expect(page.getByText(/shared property access/i)).toBeVisible();
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await expect(page).toHaveScreenshot("people.png", { fullPage: true });
  });
});
