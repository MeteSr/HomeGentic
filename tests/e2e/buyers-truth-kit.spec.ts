import { test, expect } from "@playwright/test";

const MOCK_KIT_RESPONSE = {
  property: {
    address: "123 Main St",
    yearBuilt: 1985,
    geocoded: true,
    city: "Nashville",
    state: "TN",
  },
  permits: {
    searched: true,
    found: false,
    count: 0,
    records: [],
    portalUrl: "",
    portalName: "Metro Nashville",
    instructions: "",
    note: "",
  },
  kit: {
    overallRisk: "medium" as const,
    overallSummary: "The home has moderate risk due to aging systems.",
    systems: [
      {
        name: "Roof",
        claimed: "Replaced 2018",
        credibilityScore: 80,
        credibilityLabel: "Plausible" as const,
        finding: "Consistent with claim.",
        estimatedAge: "7 years",
        remainingLifespan: "13-18 years",
        replacementCost: "$8,000–$15,000",
        financialRisk: "low" as const,
        questions: ["Do you have the contractor warranty?"],
        documents: ["Permit for roof replacement"],
        inspectorChecks: ["Check for soft spots"],
        permitNote: "No permit found",
      },
    ],
    redFlags: [
      {
        severity: "major" as const,
        title: "Aging HVAC",
        description: "HVAC is 22 years old.",
        action: "Budget for replacement.",
      },
    ],
    eraRisks: [],
    generalQuestions: ["Has the home had any flooding?"],
    generalDocuments: ["Previous inspection reports"],
  },
};

test.describe("Buyer's Truth Kit — /buyers-truth-kit", () => {
  // Route the API before each test
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/buyers-truth-kit", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_KIT_RESPONSE),
      });
    });
  });

  // BTK.1 — page loads (no auth required)
  test("BTK.1 page loads at /buyers-truth-kit", async ({ page }) => {
    await page.goto("/buyers-truth-kit");
    await expect(page.getByRole("heading", { name: /know what you're/i })).toBeVisible();
  });

  // BTK.2 — address form renders and accepts input
  test("BTK.2 address form renders and accepts input", async ({ page }) => {
    await page.goto("/buyers-truth-kit");

    // Click through the landing CTA
    await page.getByRole("button", { name: /build my truth kit/i }).click();

    // Step 0 should be visible
    await expect(page.getByText(/step 1 of 2/i)).toBeVisible();

    // Address field
    const addressInput = page.getByPlaceholder(/123 main st/i);
    await expect(addressInput).toBeVisible();
    await addressInput.fill("456 Oak Lane, Nashville, TN 37201");

    // Year built field
    const yearInput = page.getByPlaceholder(/e\.g\. 1987/i);
    await expect(yearInput).toBeVisible();
    await yearInput.fill("1985");
  });

  // BTK.3 — wizard steps advance with Next buttons
  test("BTK.3 Next buttons advance through wizard steps", async ({ page }) => {
    await page.goto("/buyers-truth-kit");

    // Landing → Step 0
    await page.getByRole("button", { name: /build my truth kit/i }).click();
    await expect(page.getByText(/step 1 of 2/i)).toBeVisible();

    // Fill required fields on step 0
    await page.getByPlaceholder(/123 main st/i).fill("123 Main St, Nashville, TN 37201");
    await page.getByPlaceholder(/e\.g\. 1987/i).fill("1985");

    // Advance to step 1
    await page.getByRole("button", { name: /next: seller claims/i }).click();
    await expect(page.getByText(/step 2 of 2/i)).toBeVisible();
    await expect(page.getByText(/what has the seller claimed/i)).toBeVisible();
  });

  // BTK.4 — mocked API response renders results
  test("BTK.4 mocked API response renders overall risk, system cards, and red flags", async ({ page }) => {
    await page.goto("/buyers-truth-kit");

    // Navigate through the wizard
    await page.getByRole("button", { name: /build my truth kit/i }).click();
    await page.getByPlaceholder(/123 main st/i).fill("123 Main St, Nashville, TN 37201");
    await page.getByPlaceholder(/e\.g\. 1987/i).fill("1985");
    await page.getByRole("button", { name: /next: seller claims/i }).click();

    // Generate the kit — this triggers the mocked API
    await page.getByRole("button", { name: /generate my truth kit/i }).click();

    // Should display results (loading then results)
    await expect(page.getByText(/your buyer's truth kit/i)).toBeVisible({ timeout: 10000 });

    // Overall risk label (medium)
    await expect(page.getByText(/overall risk: medium/i)).toBeVisible();

    // System card for Roof
    await expect(page.getByText("Roof")).toBeVisible();

    // Red flags section
    await expect(page.getByText(/red flags/i).first()).toBeVisible();
    await expect(page.getByText("Aging HVAC")).toBeVisible();
  });

  // BTK.5 — Print and Share buttons visible on results
  test("BTK.5 Print and Share buttons visible on results page", async ({ page }) => {
    await page.goto("/buyers-truth-kit");

    // Navigate through the wizard
    await page.getByRole("button", { name: /build my truth kit/i }).click();
    await page.getByPlaceholder(/123 main st/i).fill("123 Main St, Nashville, TN 37201");
    await page.getByPlaceholder(/e\.g\. 1987/i).fill("1985");
    await page.getByRole("button", { name: /next: seller claims/i }).click();
    await page.getByRole("button", { name: /generate my truth kit/i }).click();

    // Wait for results
    await expect(page.getByText(/your buyer's truth kit/i)).toBeVisible({ timeout: 10000 });

    // Print and Share buttons
    await expect(page.getByRole("button", { name: /print kit/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /copy share link/i })).toBeVisible();
  });
});
