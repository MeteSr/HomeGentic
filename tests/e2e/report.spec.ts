import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

// ─── Public report page — no auth needed ──────────────────────────────────────

test.describe("Report page — /report/:token (public)", () => {
  test("shows 'not found' for an invalid token", async ({ page }) => {
    await page.goto("/report/RPT_does_not_exist");
    await expect(page.getByText("Report not found")).toBeVisible();
  });

  test("shows a descriptive message explaining the invalid link", async ({ page }) => {
    await page.goto("/report/RPT_bad_token_xyz");
    await expect(page.getByText(/invalid or the report has been removed/i)).toBeVisible();
  });

  test("shows HomeGentic branding in the error state", async ({ page }) => {
    await page.goto("/report/RPT_bad_token");
    await expect(page.getByText(/HomeGentic/i)).toBeVisible();
  });
});

// ─── Generate and view a report ───────────────────────────────────────────────

test.describe("Generate report flow", () => {
  test("authenticated user sees 'Share HomeGentic Report' button on property detail", async ({
    page,
  }) => {
    await injectTestAuth(page);
    await page.goto("/properties/1");
    await expect(
      page.getByRole("button", { name: /share homegentic report/i })
    ).toBeVisible();
  });

  test("clicking Share button opens the report modal", async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/properties/1");
    await page.getByRole("button", { name: /share homegentic report/i }).click();
    await expect(page.getByText("HomeGentic Report")).toBeVisible();
    await expect(page.getByRole("button", { name: /generate report link/i })).toBeVisible();
  });

  test("modal shows expiry option buttons", async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/properties/1");
    await page.getByRole("button", { name: /share homegentic report/i }).click();

    for (const label of ["7 days", "30 days", "90 days", "Never"]) {
      await expect(page.getByRole("button", { name: label })).toBeVisible();
    }
  });

  test("generated report renders all key sections", async ({ page }) => {
    // Generate a report token via page.evaluate against the mock service,
    // then navigate to the report URL and check the rendered output.
    await injectTestAuth(page);
    await page.goto("/dashboard");

    // Inject the report service in the browser context and generate a token
    const token = await page.evaluate(async () => {
      const { reportService } = await import("/src/services/report.ts");
      const link = await reportService.generateReport(
        "1",
        {
          address: "456 Oak Ave", city: "Austin", state: "TX",
          zipCode: "78701", propertyType: "SingleFamily",
          yearBuilt: 2000, squareFeet: 2200, verificationLevel: "Basic",
        },
        [
          {
            serviceType: "HVAC", description: "HVAC replacement",
            contractorName: "Cool Air LLC", amountCents: 240000,
            date: "2024-06-15", isDiy: false,
            permitNumber: "HVAC-2024-001", warrantyMonths: 120,
            isVerified: true, status: "verified",
          },
          {
            serviceType: "Painting", description: "Painted living room",
            contractorName: undefined, amountCents: 28000,
            date: "2024-08-05", isDiy: true,
            permitNumber: undefined, warrantyMonths: undefined,
            isVerified: true, status: "verified",
          },
        ],
        null,
        "Public"
      );
      return link.token;
    });

    await page.goto(`/report/${token}`);

    // Cover section
    await expect(page.getByText("456 Oak Ave")).toBeVisible();
    await expect(page.getByText(/austin, tx/i)).toBeVisible();

    // Stats row
    await expect(page.getByText("Total Jobs")).toBeVisible();
    await expect(page.getByText("Verified On-Chain")).toBeVisible();
    await expect(page.getByText("Investment")).toBeVisible();

    // Timeline entries
    await expect(page.getByText("HVAC")).toBeVisible();
    await expect(page.getByText("Painting")).toBeVisible();

    // DIY badge
    await expect(page.getByText("DIY")).toBeVisible();

    // Permit
    await expect(page.getByText("HVAC-2024-001")).toBeVisible();

    // System health section
    await expect(page.getByText("System Health")).toBeVisible();

    // Footer
    await expect(page.getByText(/internet computer blockchain/i)).toBeVisible();
  });

  test("Save as PDF button is visible on report page", async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/dashboard");

    const token = await page.evaluate(async () => {
      const { reportService } = await import("/src/services/report.ts");
      const link = await reportService.generateReport(
        "1",
        {
          address: "789 Pine St", city: "Denver", state: "CO",
          zipCode: "80201", propertyType: "SingleFamily",
          yearBuilt: 1995, squareFeet: 1800, verificationLevel: "Premium",
        },
        [],
        null,
        "Public"
      );
      return link.token;
    });

    await page.goto(`/report/${token}`);
    await expect(page.getByRole("button", { name: /save as pdf/i })).toBeVisible();
  });
});

// ─── Routing ──────────────────────────────────────────────────────────────────

test.describe("Protected routes redirect unauthenticated users", () => {
  test("/dashboard redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/jobs/new redirects to /login when not authenticated", async ({ page }) => {
    await page.goto("/jobs/new");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/report/:token is accessible without auth", async ({ page }) => {
    await page.goto("/report/any-token");
    // Should not redirect to /login — it's a public page
    await expect(page).not.toHaveURL(/\/login/);
  });
});
