/**
 * Page structure accessibility — landmarks, skip link, 404, reduced motion and
 * tap targets (audits/accessibility-ux.md §1.7, §1.8, §2.3, §3).
 *
 * AS.1  Public and signed-in pages each have exactly one main landmark and
 *       no content outside landmarks (axe: landmark-one-main, region, …)
 * AS.2  The first Tab reaches "Skip to main content", which moves focus to the h1
 * AS.3  An unknown URL shows a 404 page instead of redirecting to the landing page
 * AS.4  Under prefers-reduced-motion, infinite decorative animations stop
 * AS.5  Small controls called out by the audit are at least 24×24 (axe: target-size)
 */

import { test, expect, type Page } from "@playwright/test";
import { checkA11y, injectAxe } from "axe-playwright";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

async function assertRules(page: Page, rules: string[]) {
  await injectAxe(page);
  await checkA11y(page, undefined, {
    detailedReport: true,
    axeOptions: { runOnly: { type: "rule", values: rules } },
  });
}

const LANDMARK_RULES = [
  "landmark-one-main",
  "landmark-no-duplicate-main",
  "landmark-main-is-top-level",
  "region",
  "bypass",
];

const PUBLIC_ROUTES = ["/", "/pricing", "/faq", "/support", "/check", "/prices", "/home-systems", "/sample-report", "/login"];

for (const route of PUBLIC_ROUTES) {
  test(`AS.1 — ${route} has one main landmark`, async ({ page }) => {
    await page.goto(route);
    await expect(page.locator("h1").first()).toBeAttached({ timeout: 10_000 });
    await expect(page.locator("main, [role='main']")).toHaveCount(1);
    await assertRules(page, LANDMARK_RULES);
  });
}

test("AS.1 — signed-in /jobs has one main landmark (Layout's)", async ({ page }) => {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  await page.goto("/jobs");
  await expect(page.locator("h1").first()).toBeAttached({ timeout: 10_000 });
  await expect(page.locator("main, [role='main']")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  await assertRules(page, LANDMARK_RULES);
});

test("AS.2 — first Tab reaches the skip link, which focuses the page h1", async ({ page }) => {
  await page.goto("/pricing");
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to main content" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(page.locator("h1").first()).toBeFocused();
});

test("AS.3 — unknown URL shows a 404 page with a way back", async ({ page }) => {
  await page.goto("/property/1");
  await expect(page).toHaveURL(/\/property\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  await expect(page).toHaveTitle(/Page not found/);
});

test("AS.3 — signed-in 404 links back to the dashboard", async ({ page }) => {
  await injectTestAuth(page);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your dashboard" })).toHaveAttribute("href", "/dashboard");
});

test("AS.4 — reduced motion stops infinite animations but keeps spinners turning", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("h1").first()).toBeVisible({ timeout: 10_000 }); // dev server injects CSS from JS
  const counts = await page.evaluate(() => {
    const probe = (attrs: Record<string, string>, style: string) => {
      const el = document.createElement("div");
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      el.setAttribute("style", style);
      document.body.appendChild(el);
      const n = getComputedStyle(el).animationIterationCount;
      el.remove();
      return n;
    };
    return {
      decorative: probe({}, "animation: spin 1s linear infinite"),
      spinner:    probe({ "data-motion": "essential" }, "animation: spin 1s linear infinite"),
    };
  });
  expect(counts.decorative).toBe("1");
  expect(counts.spinner).toBe("infinite");
});

test("AS.5 — public footer links and phone menu toggle are big enough to tap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/check");
  const toggle = page.getByRole("button", { name: "Toggle menu" });
  await expect(toggle).toBeVisible({ timeout: 10_000 });
  const t = await toggle.boundingBox();
  expect(t!.width).toBeGreaterThanOrEqual(44);
  expect(t!.height).toBeGreaterThanOrEqual(44);
  for (const label of ["Privacy", "Terms of Service", "Contact Us"]) {
    const box = await page.locator("footer").getByRole("link", { name: label }).boundingBox();
    expect(box!.height, label).toBeGreaterThanOrEqual(44);
  }
  await assertRules(page, ["target-size"]);
});

test("AS.5 — in-app Back button is 44px tall", async ({ page }) => {
  await injectTestAuth(page);
  await injectTestProperties(page);
  await injectSubscription(page, "Pro");
  await page.goto("/warranties");
  const back = page.getByRole("button", { name: "Back" });
  await expect(back).toBeVisible({ timeout: 10_000 });
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
