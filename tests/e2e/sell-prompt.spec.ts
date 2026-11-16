/**
 * "Thinking of selling?"
 *
 * SP.1  /sell — a visitor checks their city, sees how many verified agents
 *       serve it, and is sent to sign in on the way to a new listing
 * SP.2  /sell — a city with too few agents isn't offered Bid to List yet
 * SP.3  /dashboard — in the home's yearly weeks, with enough agents in its
 *       city, the card shows; "Not now" hides it
 * SP.4  /dashboard — outside those weeks, the card shows when the state's
 *       house price index rose enough, with the index estimate; "Not now"
 *       keeps it hidden after a reload
 *
 * window.__e2e_agent_counts = { [lowercased city]: n } stands in for the
 * agent canister's count.
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";
import { sellPromptWeek } from "../../packages/shared/src/sellPrompt";

async function injectAgentCounts(page: Page, counts: Record<string, number>) {
  await page.addInitScript((c) => {
    (window as any).__e2e_agent_counts = c;
  }, counts);
}

test.describe("SP — public seller page", () => {
  // SP.1
  test("checks a city and starts sign-in toward a new listing", async ({ page }) => {
    await injectAgentCounts(page, { orlando: 4 });
    await page.goto("/sell");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/agents compete/i);
    await page.getByLabel("Your city").fill("Orlando");
    await page.getByRole("button", { name: "Check my city" }).click();
    await expect(page.getByText("4 verified agents serve Orlando.")).toBeVisible();
    await page.getByRole("button", { name: "Get started", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?redirect=%2Flisting%2Fnew/);
  });

  // SP.2
  test("a city with too few agents isn't open yet", async ({ page }) => {
    await injectAgentCounts(page, { tampa: 1 });
    await page.goto("/sell");
    await page.getByLabel("Your city").fill("Tampa");
    await page.getByRole("button", { name: "Check my city" }).click();
    await expect(page.getByText(/Bid to List isn't open in Tampa yet/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Get started", exact: true })).toHaveCount(0);
  });
});

test.describe("SP — dashboard card", () => {
  // SP.3
  test("shows in the home's weeks and hides on Not now", async ({ page }) => {
    // Noon UTC on the Wednesday of the test home's prompt week in 2027.
    const inWindow = Date.UTC(2027, 0, 6, 12) + (sellPromptWeek("1") - 1) * 7 * 86_400_000;
    await page.clock.setFixedTime(new Date(inWindow));
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await injectTestProperties(page);
    await injectAgentCounts(page, { austin: 5 });
    await page.goto("/dashboard");
    const card = page.getByRole("region", { name: "Thinking of selling?" });
    await expect(card.getByText("5 verified agents serve Austin.", { exact: false })).toBeVisible();
    await card.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("region", { name: "Thinking of selling?" })).toHaveCount(0);
  });

  // SP.4
  test("shows outside the yearly weeks when the index estimate rose enough", async ({ page }) => {
    const outOfWindow = Date.UTC(2027, 0, 6, 12) + ((sellPromptWeek("1") + 9) % 52) * 7 * 86_400_000;
    await page.clock.setFixedTime(new Date(outOfWindow));
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await injectTestProperties(page);
    await injectAgentCounts(page, { austin: 5 });
    await page.addInitScript(() => {
      (window as any).__e2e_mortgage_loans = {
        "1": {
          lender: "Test Bank",
          originalAmount: 240_000,
          annualRatePct: 6.5,
          termMonths: 360,
          firstPaymentDate: "2024-02-01",
          originalValue: 300_000,
          currentValue: null,
          monthlyPmi: null,
          monthlyEscrow: null,
          statementBalance: null,
          statementDate: "",
        },
      };
      (window as any).__e2e_hpi = { TX: [[2024, 1, 90], [2025, 3, 100], [2026, 3, 106]] };
    });
    await page.goto("/dashboard");
    const card = page.getByRole("region", { name: "Thinking of selling?" });
    await expect(card.getByText(/Home prices in TX rose 6% from Q3 2025 to Q3 2026/)).toBeVisible();
    await expect(card.getByText(/index estimate on your mortgage card at \$353,000/)).toBeVisible();
    await card.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("region", { name: "Thinking of selling?" })).toHaveCount(0);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("region", { name: "Thinking of selling?" })).toHaveCount(0);
  });
});
