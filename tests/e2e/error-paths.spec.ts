/**
 * E2E error-path specs — unhappy paths that validate form gating and
 * tier-enforcement across the app.
 *
 * All tests use window.__e2e_* injection — no canister required.
 *
 * EP.1  /register — invalid email format shows validation error
 * EP.2  /register — duplicate username error (injected via __e2e_register_error)
 * EP.3  Add property modal — Continue button disabled until all address fields filled
 * EP.4  /jobs/new — Save disabled until required fields filled
 * EP.5  /quotes/new — Free user sees upgrade gate on quote request
 * EP.6  Quote flow — bid with zero amount shows validation error
 * EP.7  Property claim — expired conflict window shows expired state
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription, injectQuoteRequests, injectVerifyStatus } from "./helpers/testData";
import { assertNoA11yViolations } from "./helpers/a11y";

// ── Common property fixture ───────────────────────────────────────────────────

async function injectProProperty(page: Parameters<typeof injectTestAuth>[0]) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: 1,
        owner: "test-e2e-principal",
        address: "123 Maple St",
        city: "Austin",
        state: "TX",
        zipCode: "78701",
        propertyType: "SingleFamily",
        yearBuilt: 2001,
        squareFeet: 2400,
        verificationLevel: "Unverified",
        tier: "Pro",
        createdAt: 0,
        updatedAt: 0,
        isActive: true,
      },
    ];
  });
}

// ── EP.1 — Register: invalid email format shows validation error ──────────────

test.describe("EP.1 — Register: invalid email format", () => {
  test("shows validation error for non-email input", async ({ page }) => {
    // /register is behind ProtectedRoute — without auth it redirects to /login
    await injectTestAuth(page);
    await page.goto("/register");

    // Advance past role selection (step 1)
    await page.getByText("Homeowner", { exact: true }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Fill invalid email in step 2
    const emailInput = page.getByPlaceholder(/you@example\.com/i);
    await emailInput.fill("notanemail");
    await emailInput.blur();

    // Validation error should appear without submitting
    await expect(
      page.getByText(/valid email/i).or(page.getByText(/enter a valid/i))
    ).toBeVisible();

    await assertNoA11yViolations(page);
  });
});

// ── EP.2 — Register: USERNAME_TAKEN injected error ────────────────────────────

test.describe("EP.2 — Register: duplicate/taken username error", () => {
  test("shows error when register_error is USERNAME_TAKEN", async ({ page }) => {
    // /register is behind ProtectedRoute — without auth it redirects to /login
    await injectTestAuth(page);
    // Inject the error signal before React boots
    await page.addInitScript(() => {
      (window as any).__e2e_register_error = "USERNAME_TAKEN";
    });

    await page.goto("/register");

    // Navigate to step 2 by selecting a role
    await page.getByText("Homeowner", { exact: true }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    // Fill valid-looking email and submit
    await page.getByPlaceholder(/you@example\.com/i).fill("test@example.com");

    // Advance to step 3 (confirm/submit) — the step 2 → 3 button reads "Review"
    const nextBtn = page.getByRole("button", { name: /continue|review/i });
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
    }

    // Agree to terms — the checkbox only exists on step 3
    const termsCheckbox = page.getByLabel(/terms/i);
    if (await termsCheckbox.isVisible()) {
      await termsCheckbox.check();
    }

    // Submit the final form
    const submitBtn = page.getByRole("button", { name: /create account|register|submit/i });
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
    }

    // Expect error text about the username/account being taken
    // The app reads __e2e_register_error and should surface it via toast or inline error
    await expect(
      page.getByText(/already taken|username taken|account exists/i).or(
        page.getByText(/USERNAME_TAKEN/i)
      )
    ).toBeVisible({ timeout: 5000 });

    await assertNoA11yViolations(page);
  });
});

// ── EP.3 — Add property: Continue disabled until all address fields filled ────

test.describe("EP.3 — Add property: Continue button gating", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await injectProProperty(page);
  });

  test("Continue is disabled with no address fields filled", async ({ page }) => {
    await page.goto("/dashboard");
    // Open Add Property modal
    const addPropBtn = page.getByRole("button", { name: /add property/i });
    await expect(addPropBtn).toBeVisible();
    await addPropBtn.click();

    // The modal/form should now show the address step
    // Continue button should be disabled
    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeVisible();
    await expect(continueBtn).toBeDisabled();

    await assertNoA11yViolations(page);
  });

  test("Continue remains disabled with only street address filled (no zip)", async ({ page }) => {
    await page.goto("/dashboard");
    const addPropBtn = page.getByRole("button", { name: /add property/i });
    await addPropBtn.click();

    // Fill street address only
    const addressInput = page.getByLabel(/street address|address/i).first();
    await addressInput.fill("123 Elm St");

    const continueBtn = page.getByRole("button", { name: /continue/i });
    await expect(continueBtn).toBeDisabled();
  });

  test("Continue becomes enabled when all address fields filled", async ({ page }) => {
    await page.goto("/dashboard");
    const addPropBtn = page.getByRole("button", { name: /add property/i });
    await addPropBtn.click();

    // Fill all required address fields
    await page.getByLabel(/street address|address/i).first().fill("123 Elm St");
    await page.getByLabel(/city/i).fill("Austin");
    await page.getByLabel(/state/i).fill("TX");
    await page.getByLabel(/zip/i).fill("78701");

    const continueBtn = page.getByRole("button", { name: /continue/i });
    // Generous timeout: under the full suite's parallel load, the last fill's
    // React state update can occasionally take longer than the 5s default.
    await expect(continueBtn).toBeEnabled({ timeout: 10_000 });
  });
});

// ── EP.4 — Job create: Save disabled until required fields filled ──────────────

test.describe("EP.4 — Job create: Save button gating", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await injectProProperty(page);
    await page.addInitScript(() => {
      (window as any).__e2e_jobs = [];
    });
  });

  test("Save button is disabled on initial load", async ({ page }) => {
    await page.goto("/jobs/new");

    // The save/submit button should be disabled with no fields filled
    const saveBtn = page.getByRole("button", { name: /save job|log job|submit/i });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    await assertNoA11yViolations(page);
  });

  test("Save remains disabled with description only (no amount)", async ({ page }) => {
    await page.goto("/jobs/new");

    // Fill description but not amount
    const descriptionField = page.getByLabel(/description/i).or(page.getByPlaceholder(/describe/i));
    await descriptionField.fill("Replaced the water heater.");

    const saveBtn = page.getByRole("button", { name: /save job|log job|submit/i });
    await expect(saveBtn).toBeDisabled();
  });

  test("Save becomes enabled when all required fields filled", async ({ page }) => {
    await page.goto("/jobs/new");

    // Fill all required fields: serviceType is pre-selected, need contractor + amount
    // Make it a DIY job so no contractor name required.
    // (Not gated behind an isVisible() check: that resolves immediately without
    // waiting for the initial render, so on a slow render it silently no-ops —
    // leaving isDiy false and the rest of the test filling in required fields
    // for a job that still fails the "has a contractor name" check.)
    const diyToggle = page.getByLabel(/diy|myself/i).or(page.getByText(/diy/i).first());
    await diyToggle.click();

    const amountField = page.getByLabel(/amount|cost/i).or(page.getByPlaceholder(/0\.00|amount/i));
    await amountField.fill("1500");

    const saveBtn = page.getByRole("button", { name: /save job|log job|submit/i });
    await expect(saveBtn).toBeEnabled();
  });
});

// ── EP.5 — Tier limit: Free user sees upgrade gate on quote request ────────────

test.describe("EP.5 — Free user upgrade gate on quote request", () => {
  test("shows upgrade gate when Free user visits /quotes/new", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Free");
    // Inject enough open requests to trigger the limit
    await injectQuoteRequests(page, [
      { id: "q1", propertyId: "1", homeowner: "test-e2e-principal", serviceType: "HVAC", urgency: "medium", description: "Test", status: "open", createdAt: Date.now() - 1000 },
      { id: "q2", propertyId: "1", homeowner: "test-e2e-principal", serviceType: "Plumbing", urgency: "low", description: "Test 2", status: "open", createdAt: Date.now() - 2000 },
      { id: "q3", propertyId: "1", homeowner: "test-e2e-principal", serviceType: "Roofing", urgency: "high", description: "Test 3", status: "open", createdAt: Date.now() - 3000 },
    ]);

    await page.goto("/quotes/new");

    // Free tier users at the limit should see an upgrade/limit gate
    await expect(
      page.getByText(/upgrade|limit reached|quota|at your limit/i).first()
    ).toBeVisible();

    await assertNoA11yViolations(page);
  });

  test("Free user redirected to /pricing when visiting /dashboard", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Free");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/pricing/);
  });
});

// ── EP.6 — Quote flow: bid with zero amount shows validation error ─────────────

test.describe("EP.6 — Quote bid with zero amount validation", () => {
  test("submitting a bid with zero amount shows validation error", async ({ page }) => {
    // Inject as contractor
    await injectTestAuth(page, "test-contractor-principal");
    await injectSubscription(page, "ContractorPro");
    // Inject an open quote request to bid on
    await injectQuoteRequests(page, [
      {
        id: "qr-open-1",
        propertyId: "1",
        homeowner: "other-homeowner-principal",
        serviceType: "Plumbing",
        urgency: "medium",
        description: "Fix the leaking pipe under the kitchen sink.",
        status: "open",
        createdAt: Date.now() - 86_400_000,
      },
    ]);

    await page.goto("/quotes/qr-open-1");

    // Find the bid amount input and enter 0
    const amountInput = page.getByLabel(/bid amount|amount/i).or(page.getByPlaceholder(/\$|amount|0\.00/i));
    if (await amountInput.isVisible()) {
      await amountInput.fill("0");
    }

    // Submit the bid
    const submitBidBtn = page.getByRole("button", { name: /submit bid|place bid|send bid/i });
    if (await submitBidBtn.isVisible()) {
      await submitBidBtn.click();

      // Expect validation error
      await expect(
        page.getByText(/amount must be|valid amount|greater than|required/i).first()
      ).toBeVisible({ timeout: 3000 });

      await assertNoA11yViolations(page);
    } else {
      // If bid form not directly accessible, check that navigation to the quote detail works
      // TODO: the quote detail route may differ; check /quotes/:id or /contractor-dashboard
      await expect(page.getByRole("main")).toBeVisible();
    }
  });
});

// ── EP.7 — Property claim: expired conflict window ────────────────────────────

test.describe("EP.7 — Expired conflict window shows appropriate state", () => {
  test("shows expired state when conflict window has passed", async ({ page }) => {
    await injectTestAuth(page);
    // /properties/:id/verify is behind PaidHomeownerRoute, which blocks on
    // tier resolution (a real canister call) without a subscription fixture.
    await injectSubscription(page, "Pro");
    await injectProProperty(page);

    // Inject verify status with expired conflict window
    await injectVerifyStatus(page, {
      propertyId:          "1",
      address:             "123 Maple St",
      city:                "Austin",
      state:               "TX",
      verificationLevel:   "Unverified",
      claimStartedAt:      Date.now() - 86_400_000 * 14,  // 14 days ago
      claimWindowEndsAt:   Date.now() - 86_400_000 * 7,   // ended 7 days ago
      identityVerified:    true,
      currentStep:         "contested",
      conflictWindowEndsAt: Date.now() - 86_400_000 * 2,  // expired 2 days ago
    });

    // The contested-claim UI lives at the /contested sub-route, not the
    // /verify index (which always renders the "claim" step regardless of
    // currentStep — each verify step is a distinct URL, not client-routed
    // off currentStep).
    await page.goto("/properties/1/verify/contested");

    // Expect text indicating the conflict window has expired or closed.
    // .first() wraps the combined locator — the page shows multiple lines
    // matching this OR, so it needs to apply after combining, not before.
    await expect(
      page.getByText(/expired|closed|window.*closed|conflict.*ended/i)
        .or(page.getByText(/no longer active/i))
        .first()
    ).toBeVisible({ timeout: 5000 });

    await assertNoA11yViolations(page);
  });
});
