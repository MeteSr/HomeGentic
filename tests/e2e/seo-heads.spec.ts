import { test, expect } from "@playwright/test";

// Public pages set their own title, description and canonical from
// src/seo/publicRoutes.ts (the build also writes them into each page's HTML).
// /pricing, /home-systems and /prices used to keep the homepage's.

const PAGES: [path: string, title: RegExp][] = [
  ["/pricing", /^Pricing — HomeGentic$/],
  ["/home-systems", /^Home System Age Estimator \| HomeGentic$/],
  ["/prices", /^Home repair cost lookup \| HomeGentic$/],
  ["/faq", /^FAQ — HomeGentic$/],
];

for (const [path, title] of PAGES) {
  test(`${path} has its own title, description and canonical`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://homegentic.app${path}`);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", `https://homegentic.app${path}`);
    const description = await page.locator('meta[name="description"]').getAttribute("content");
    expect(description?.length ?? 0).toBeGreaterThan(50);
  });
}

test("a page outside the public list still gets a canonical on homegentic.app", async ({ page }) => {
  await page.goto("/gift/redeem?code=x");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://homegentic.app/gift/redeem");
});

test("the head links the favicon, touch icon and manifest", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/apple-touch-icon.png");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/site.webmanifest");
});
