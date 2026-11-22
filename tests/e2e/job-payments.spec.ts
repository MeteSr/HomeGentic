/**
 * Paying a contractor in the app
 *
 * JP.1  /quotes/:id — the homeowner sees bank first (the accepted price) and
 *       card second (the higher card price), pays by bank, and is told the
 *       payment reaches the contractor once it clears
 * JP.2  /quotes/:id — a contractor without payouts set up: no pay button
 * JP.3  /settings — a contractor sets up payouts through Stripe
 * JP.4  /quotes/:id — paying by card charges the card price and says Stripe
 *       is sending it to the contractor
 * JP.5  /quotes/:id — after a failed payment the homeowner is told and can
 *       try again
 *
 * All tests use window.__e2e_* injection (window.__e2e_job_payments holds the
 * payments and payout accounts) — no canister, Worker or Stripe required.
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectQuoteRequests, injectQuotes, injectSubscription } from "./helpers/testData";

const NOW = Date.now();
const DAY = 86_400_000;
const PRO = "contractor-principal-1";

const REQUEST = {
  id: "E2E_PAY_REQ",
  propertyId: "1",
  homeowner: "test-e2e-principal",
  serviceType: "HVAC",
  urgency: "high" as const,
  description: "AC unit stopped cooling.",
  status: "accepted" as const,
  createdAt: NOW - 2 * DAY,
};
const WON = {
  id: "E2E_PAY_Q",
  requestId: REQUEST.id,
  contractor: PRO,
  amount: 120_000,
  timeline: 3,
  validUntil: NOW + 7 * DAY,
  status: "accepted" as const,
  createdAt: NOW - DAY,
};

/** The in-memory store, kept across the reload that coming back from "Stripe" causes. */
async function injectPayments(page: Page, store: Record<string, unknown>) {
  await page.addInitScript((s) => {
    const w = window as any;
    const saved = sessionStorage.getItem("__e2e_job_payments");
    w.__e2e_job_payments = saved ? JSON.parse(saved) : s;
    addEventListener("pagehide", () =>
      sessionStorage.setItem("__e2e_job_payments", JSON.stringify(w.__e2e_job_payments)),
    );
  }, store);
}

async function asContractor(page: Page) {
  await injectTestAuth(page);
  await injectSubscription(page, "Free");
  await page.addInitScript(() => {
    const w = window as any;
    w.__e2e_properties = [];
    w.__e2e_jobs = [];
    w.__e2e_profile = {
      principal: "test-e2e-principal",
      role: "Contractor",
      email: "pro@example.com",
      phone: "",
      createdAt: BigInt(0),
      updatedAt: BigInt(0),
      isActive: true,
      lastLoggedIn: null,
    };
  });
}

test.describe("JP — homeowner pays the contractor", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page);
    await injectTestProperties(page);
    await injectQuoteRequests(page, [REQUEST]);
    await injectQuotes(page, [WON]);
  });

  // JP.1
  test("pays by bank, the lower price", async ({ page }) => {
    await injectPayments(page, { payments: {}, payout: null, ready: { [PRO]: true }, bids: { [WON.id]: WON.amount } });
    await page.goto(`/quotes/${REQUEST.id}`);
    const panel = page.getByRole("region", { name: "Payment" });
    await expect(panel.getByRole("radio", { name: /bank account.*\$1,200\.00/i })).toBeChecked();
    await expect(panel.getByRole("radio", { name: /card.*\$1,236\.15/i })).not.toBeChecked();
    await expect(panel.getByText(/paying by bank saves you \$36\.15/i)).toBeVisible();
    await panel.getByRole("button", { name: /continue to stripe/i }).click();
    await expect(page).toHaveURL(/payment=done/);
    const after = page.getByRole("region", { name: "Payment" });
    await expect(after.getByText(/your bank payment of \$1,200\.00 is on its way/i)).toBeVisible();
    await expect(after.getByText(/once it clears, about 4 business days/i)).toBeVisible();
    await expect(after.getByRole("button", { name: /continue to stripe/i })).toHaveCount(0);
  });

  // JP.4
  test("pays by card at the card price", async ({ page }) => {
    await injectPayments(page, { payments: {}, payout: null, ready: { [PRO]: true }, bids: { [WON.id]: WON.amount } });
    await page.goto(`/quotes/${REQUEST.id}`);
    const panel = page.getByRole("region", { name: "Payment" });
    await panel.getByRole("radio", { name: /card.*\$1,236\.15/i }).check();
    await panel.getByRole("button", { name: /continue to stripe/i }).click();
    await expect(page).toHaveURL(/payment=done/);
    const after = page.getByRole("region", { name: "Payment" });
    await expect(after.getByText(/you paid \$1,236\.15 by card\. stripe is sending it to/i)).toBeVisible();
    await expect(after.getByRole("button", { name: /continue to stripe/i })).toHaveCount(0);
  });

  // JP.5
  test("a failed payment says so and offers another try", async ({ page }) => {
    await injectPayments(page, {
      payments: {
        [WON.id]: {
          quoteId: WON.id,
          method: "bank",
          status: "failed",
          bidCents: WON.amount,
          amountCents: WON.amount,
          updatedAt: NOW,
        },
      },
      payout: null,
      ready: { [PRO]: true },
      bids: { [WON.id]: WON.amount },
    });
    await page.goto(`/quotes/${REQUEST.id}`);
    const panel = page.getByRole("region", { name: "Payment" });
    await expect(panel.getByText("Your last payment didn't go through. You can try again.")).toBeVisible();
    await expect(panel.getByRole("button", { name: /continue to stripe/i })).toBeEnabled();
  });

  // JP.2
  test("no pay button when the contractor hasn't set up payments", async ({ page }) => {
    await injectPayments(page, { payments: {}, payout: null, ready: {} });
    await page.goto(`/quotes/${REQUEST.id}`);
    const panel = page.getByRole("region", { name: "Payment" });
    await expect(panel.getByText(/hasn't set up payments in homegentic yet/i)).toBeVisible();
    await expect(panel.getByRole("button", { name: /continue to stripe/i })).toHaveCount(0);
  });
});

test.describe("JP — contractor sets up payouts", () => {
  // JP.3
  test("opens Stripe onboarding from Settings", async ({ page }) => {
    await asContractor(page);
    await injectPayments(page, { payments: {}, payout: null, ready: {} });
    await page.goto("/settings?tab=subscription");
    const box = page.getByRole("region", { name: "Get paid in the app" });
    await box.getByRole("button", { name: /^set up payouts/i }).click();
    await expect(page).toHaveURL(/payouts=done/);
    await expect(
      page.getByRole("region", { name: "Get paid in the app" }).getByText(/homeowners can pay you in the app/i),
    ).toBeVisible();
  });
});
