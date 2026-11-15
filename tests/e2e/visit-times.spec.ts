/**
 * Visit times on an accepted quote
 *
 * VT.1  /quotes/:id — the homeowner sees the contractor's offered times on the
 *       accepted quote, books one, and is told about the day-before reminder
 * VT.2  /quotes/:id — "None of these work" asks the contractor for other times
 * VT.3  /contractor-dashboard — a won bid offers times to the homeowner
 *
 * All tests use window.__e2e_* injection (window.__e2e_visits holds the
 * bookings) — no canister required.
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectQuoteRequests, injectQuotes, injectSubscription } from "./helpers/testData";

const NOW = Date.now();
const DAY = 86_400_000;
const at = (daysAhead: number, hour: number) => {
  const d = new Date(NOW + daysAhead * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
};

const REQUEST = {
  id: "E2E_VISIT_REQ",
  propertyId: "1",
  homeowner: "test-e2e-principal",
  serviceType: "HVAC",
  urgency: "high" as const,
  description: "AC unit stopped cooling.",
  status: "accepted" as const,
  createdAt: NOW - 2 * DAY,
};
const WON = {
  id: "E2E_VISIT_Q",
  requestId: REQUEST.id,
  contractor: "contractor-principal-1",
  amount: 98000,
  timeline: 3,
  validUntil: NOW + 7 * DAY,
  status: "accepted" as const,
  createdAt: NOW - DAY,
};
const OFFER = {
  quoteId: WON.id,
  requestId: REQUEST.id,
  status: "timesOffered",
  offered: [
    { startsAt: at(3, 9), endsAt: at(3, 11) },
    { startsAt: at(4, 13), endsAt: at(4, 15) },
  ],
  booked: null,
  note: "I'll call 30 minutes ahead",
  updatedAt: NOW,
};

async function injectVisits(page: Page, visits: Record<string, unknown>) {
  await page.addInitScript((v) => {
    (window as any).__e2e_visits = v;
  }, visits);
}

test.describe("VT — homeowner books a visit", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page);
    await injectTestProperties(page);
    await injectQuoteRequests(page, [REQUEST]);
    await injectQuotes(page, [WON]);
    await injectVisits(page, { [WON.id]: OFFER });
  });

  // VT.1
  test("books one of the offered times", async ({ page }) => {
    await page.goto(`/quotes/${REQUEST.id}`);
    const panel = page.getByRole("region", { name: "Visit time" });
    await expect(panel.getByText("I'll call 30 minutes ahead")).toBeVisible();
    const book = panel.getByRole("button", { name: /^book /i });
    await expect(book).toHaveCount(2);
    await book.nth(1).click();
    await expect(panel.getByText(/visit booked/i)).toBeVisible();
    await expect(panel.getByText(/reminder the day before/i)).toBeVisible();
    await expect(panel.getByRole("button", { name: /cancel visit/i })).toBeVisible();
  });

  // VT.2
  test("asks for other times", async ({ page }) => {
    await page.goto(`/quotes/${REQUEST.id}`);
    const panel = page.getByRole("region", { name: "Visit time" });
    await panel.getByRole("button", { name: /none of these work/i }).click();
    await expect(panel.getByText(/for other times/i)).toBeVisible();
  });
});

test.describe("VT — contractor offers times", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectQuotes(page, [{ ...WON, contractor: "test-e2e-principal" }]);
    await injectVisits(page, {});
  });

  // VT.3
  test("offers a time on a won bid", async ({ page }) => {
    await page.goto("/contractor-dashboard");
    await expect(page.getByRole("heading", { name: /schedule visits \(1\)/i })).toBeVisible();
    const panel = page.getByRole("region", { name: "Visit time" });
    const d = new Date(at(5, 10));
    const pad = (n: number) => String(n).padStart(2, "0");
    await panel
      .getByLabel("Time 1 starts")
      .fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`);
    await panel.getByLabel("Time 1 length").selectOption("3");
    await panel.getByLabel("Note for the homeowner").fill("Gate code please");
    await panel.getByRole("button", { name: /send times/i }).click();
    await expect(panel.getByText(/waiting for the homeowner to pick/i)).toBeVisible();
  });
});
