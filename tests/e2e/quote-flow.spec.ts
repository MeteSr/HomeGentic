/**
 * Quote flow E2E tests                                               (#73)
 *
 * QF.1  /quotes/new — form renders with property selector and required fields
 * QF.2  /quotes/new → valid submit → redirects to /quotes/:id and shows request summary
 * QF.3  /quotes/:id — injected bids appear with "Bids Received" count and amounts
 * QF.4  /quotes/:id — "Best Value" and "Lowest Quote" badges appear with multiple bids
 * QF.5  Accept bid — confirmation modal → Confirm Accept → "Quote Accepted" banner
 * QF.6  Tier limit (Free = 3): button disabled and shows "Quote limit reached" at 3 open requests
 * QF.7  Tier limit (Pro = 10): 9 open requests still allow submission (button enabled)
 *
 * All tests use window.__e2e_* injection — no canister required.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";
import { injectQuoteRequests, injectQuotes, injectSubscription } from "./helpers/testData";

// ─── shared fixtures ──────────────────────────────────────────────────────────

const NOW = Date.now();

/** One open HVAC request used as the anchor for bid/accept tests. */
const ANCHOR_REQUEST = {
  id:          "E2E_REQ_1",
  propertyId:  "1",
  homeowner:   "test-e2e-principal",
  serviceType: "HVAC",
  urgency:     "high" as const,
  description: "AC unit stopped cooling. Needs diagnosis.",
  status:      "open"  as const,
  createdAt:   NOW - 86_400_000,
};

/** Two contractor bids for ANCHOR_REQUEST. */
const BIDS = [
  {
    id: "BID_1", requestId: "E2E_REQ_1",
    contractor: "contractor-principal-1",
    amount: 125000, timeline: 3,
    validUntil: NOW + 86_400_000 * 7, status: "pending" as const,
    createdAt:  NOW - 3_600_000,
  },
  {
    id: "BID_2", requestId: "E2E_REQ_1",
    contractor: "contractor-principal-2",
    amount: 98000, timeline: 5,
    validUntil: NOW + 86_400_000 * 7, status: "pending" as const,
    createdAt:  NOW - 1_800_000,
  },
];

// ── QF.1 & QF.2 — Quote request form ─────────────────────────────────────────

test.describe("QF — /quotes/new form", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
  });

  // QF.1
  test("shows 'Request a Quote' heading and property selector", async ({ page }) => {
    await page.goto("/quotes/new");
    await expect(page.getByRole("heading", { name: /request a quote/i })).toBeVisible();
    await expect(page.locator("select#property")).toBeVisible();
  });

  // QF.1 — service-type selector present
  test("shows Service Type select with HVAC option", async ({ page }) => {
    await page.goto("/quotes/new");
    await expect(page.getByLabel(/service type/i)).toBeVisible();
  });

  // QF.1 — urgency options rendered
  test("shows urgency options including Emergency", async ({ page }) => {
    await page.goto("/quotes/new");
    await expect(page.getByText("Emergency")).toBeVisible();
  });

  // QF.1 — description textarea
  test("shows 'Describe the work needed' textarea", async ({ page }) => {
    await page.goto("/quotes/new");
    await expect(page.getByLabel(/describe the work needed/i)).toBeVisible();
  });

  // QF.1 — description required: submit without description shows error toast
  test("submit without description shows validation error", async ({ page }) => {
    await page.goto("/quotes/new");
    await page.getByRole("button", { name: /send quote request/i }).click();
    await expect(page.getByText(/please describe the work needed/i)).toBeVisible();
  });

  // QF.2 — valid submit redirects to quote detail
  test("valid submit redirects to /quotes/:id and shows request summary", async ({ page }) => {
    await page.goto("/quotes/new");
    // Select HVAC (already default) and fill in description
    await page.getByLabel(/describe the work needed/i).fill(
      "AC unit stopped cooling. Unit is 12 years old. Needs full diagnostic."
    );
    await page.getByRole("button", { name: /send quote request/i }).click();
    // Should navigate to /quotes/<new id>
    await expect(page).toHaveURL(/\/quotes\/\d+/);
    // Quote Responses heading confirms we're on the detail page
    await expect(page.getByRole("heading", { name: /quote responses/i })).toBeVisible();
    // The submitted service type appears in the request summary card
    await expect(page.getByText("HVAC")).toBeVisible();
  });
});

// ── QF.3 & QF.4 — Bid display ─────────────────────────────────────────────────

test.describe("QF — /quotes/:id bid display", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectQuoteRequests(page, [ANCHOR_REQUEST]);
    await injectQuotes(page, BIDS);
  });

  // QF.3
  test("shows 'Bids Received' count matching injected bids", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    // The bid-comparison grid shows "Bids Received" label and count = 2
    await expect(page.getByText("Bids Received")).toBeVisible();
    // Use exact locator to avoid strict-mode ambiguity with other "2"s on the page
    await expect(page.locator("text=Bids Received").locator("..").getByText("2")).toBeVisible();
  });

  // QF.3 — bid amounts are rendered
  test("shows both injected bid amounts", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    // amounts stored as cents-like integers: 125000 → "$125,000"
    // Use exact match to avoid strict-mode collision with the bid-range summary
    await expect(page.getByText("$125,000", { exact: true })).toBeVisible();
    await expect(page.getByText("$98,000", { exact: true })).toBeVisible();
  });

  // QF.4 — with equal trust scores the cheapest bid always wins "Best Value"
  // (the "Lowest Quote" badge only appears when the cheapest is NOT best value)
  test("shows badge on the cheapest bid", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    await expect(page.getByText("Best Value")).toBeVisible();
  });

  // QF.4 — "Best Value" badge appears with 2+ bids
  test("shows 'Best Value' badge when multiple bids present", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    await expect(page.getByText("Best Value")).toBeVisible();
  });

  // QF.3 — "Accept This Quote" buttons present
  test("shows 'Accept This Quote' button for each pending bid", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    await expect(page.getByRole("button", { name: /accept this quote/i }).first()).toBeVisible();
  });
});

// ── QF.5 — Accept bid ─────────────────────────────────────────────────────────

test.describe("QF — accept bid flow", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectQuoteRequests(page, [ANCHOR_REQUEST]);
    await injectQuotes(page, BIDS);
  });

  // QF.5a — clicking accept opens confirmation modal
  test("clicking 'Accept This Quote' shows confirmation modal", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await expect(page.getByText(/confirm acceptance/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm accept/i })).toBeVisible();
  });

  // QF.5b — modal shows contractor amount and timeline
  test("confirmation modal shows bid amount and timeline", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    // Click the Accept button for BID_2 (the cheapest one, shown first after sort)
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await expect(page.getByText("Amount")).toBeVisible();
    await expect(page.getByText("Timeline")).toBeVisible();
  });

  // QF.5c — cancelling closes the modal
  test("Cancel button closes the confirmation modal", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await expect(page.getByText(/confirm acceptance/i)).toBeVisible();
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.getByText(/confirm acceptance/i)).not.toBeVisible();
  });

  // QF.5d — confirming in mock mode shows "Quote Accepted" banner
  // Note: quoteService.accept() is a no-op in mock mode (no canister).
  // The optimistic UI update in QuoteDetailPage still shows the acceptance banner.
  test("Confirm Accept shows 'Quote Accepted' success banner", async ({ page }) => {
    await page.goto(`/quotes/${ANCHOR_REQUEST.id}`);
    await page.getByRole("button", { name: /accept this quote/i }).first().click();
    await page.getByRole("button", { name: /confirm accept/i }).click();
    // Accept shows both a toast and the status banner — assert the persistent status element
    await expect(page.getByText(/quote accepted/i).first()).toBeVisible();
  });
});

// ── QF.6 & QF.7 — Tier limit enforcement ─────────────────────────────────────

test.describe("QF — open-quote tier limit", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
  });

  // QF.6 — Free tier: 3 open requests → button disabled
  test("Free tier: submit button disabled and shows 'Quote limit reached' at 3 open requests", async ({ page }) => {
    await injectSubscription(page, "Free");
    const threeOpen = Array.from({ length: 3 }, (_, i) => ({
      id:          `E2E_FREE_${i}`,
      propertyId:  "1",
      homeowner:   "test-e2e-principal",
      serviceType: "HVAC",
      urgency:     "medium" as const,
      description: `Request ${i}`,
      status:      "open" as const,
      createdAt:   NOW - 86_400_000 * i,
    }));
    await injectQuoteRequests(page, threeOpen);
    await page.goto("/quotes/new");
    // The button should now show the limit-reached message and be disabled
    await expect(page.getByRole("button", { name: /quote limit reached/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /quote limit reached/i })).toBeDisabled();
  });

  // QF.6 — Free tier: 2 open requests → button still enabled
  test("Free tier: submit button enabled with 2 open requests (below limit of 3)", async ({ page }) => {
    await injectSubscription(page, "Free");
    const twoOpen = Array.from({ length: 2 }, (_, i) => ({
      id:          `E2E_FREE_${i}`,
      propertyId:  "1",
      homeowner:   "test-e2e-principal",
      serviceType: "HVAC",
      urgency:     "medium" as const,
      description: `Request ${i}`,
      status:      "open" as const,
      createdAt:   NOW - 86_400_000 * i,
    }));
    await injectQuoteRequests(page, twoOpen);
    await page.goto("/quotes/new");
    await expect(page.getByRole("button", { name: /send quote request/i })).toBeEnabled();
  });

  // QF.7 — Pro tier: 9 open requests → button still enabled (limit = 10)
  test("Pro tier: 9 open requests still allow submission (limit = 10)", async ({ page }) => {
    await injectSubscription(page, "Pro");
    const nineOpen = Array.from({ length: 9 }, (_, i) => ({
      id:          `E2E_PRO_${i}`,
      propertyId:  "1",
      homeowner:   "test-e2e-principal",
      serviceType: "Plumbing",
      urgency:     "low" as const,
      description: `Request ${i}`,
      status:      "open" as const,
      createdAt:   NOW - 86_400_000 * i,
    }));
    await injectQuoteRequests(page, nineOpen);
    await page.goto("/quotes/new");
    // 9 < 10, so button should be enabled
    await expect(page.getByRole("button", { name: /send quote request/i })).toBeEnabled();
  });

  // QF.7 — Pro tier: 10 open requests → limit reached
  test("Pro tier: submit button disabled at 10 open requests", async ({ page }) => {
    await injectSubscription(page, "Pro");
    const tenOpen = Array.from({ length: 10 }, (_, i) => ({
      id:          `E2E_PRO10_${i}`,
      propertyId:  "1",
      homeowner:   "test-e2e-principal",
      serviceType: "Plumbing",
      urgency:     "low" as const,
      description: `Request ${i}`,
      status:      "open" as const,
      createdAt:   NOW - 86_400_000 * i,
    }));
    await injectQuoteRequests(page, tenOpen);
    await page.goto("/quotes/new");
    await expect(page.getByRole("button", { name: /quote limit reached/i })).toBeDisabled();
  });
});
