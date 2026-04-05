/**
 * E2E: Job lifecycle — create → sign → verify
 *
 * This is the core HomeGentic value proposition: a homeowner creates a job,
 * both parties sign it, and the record becomes permanently verified on-chain.
 *
 * Test data (from MOCK_JOBS in frontend/src/services/job.ts):
 *   Job 1 — HVAC,    Cool Air Services, $2 400, verified
 *   Job 2 — Roofing, Top Roof Co,       $8 500, completed
 *   Job 3 — Plumbing, Flow Masters,     $  650, verified
 *   Job 4 — Painting, (DIY),            $  280, verified
 *   Total value: $11 830  |  Verified: 3  |  Property ID: "1"
 *
 * The property canister is not running in E2E mode.
 *   • DashboardPage seeds the store from window.__e2e_properties (injected below).
 *   • PropertyDetailPage falls back to the store when the canister query fails.
 *   • jobService is fully client-side mock — no canister needed.
 *
 * Sign / verify action: the UI button does not exist yet.
 * Those cases are marked test.fixme() so they appear in the report as
 * "planned" and turn green automatically once the button is implemented.
 */

import { test, expect, Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

// ── Shared setup ──────────────────────────────────────────────────────────────

async function setup(page: Page) {
  await injectTestAuth(page);
  await injectTestProperties(page);
}

/** Navigate dashboard → click the injected property card (client-side nav so
 *  the property store is already populated when PropertyDetailPage mounts). */
async function gotoPropertyDetail(page: Page) {
  await page.goto("/dashboard");
  await page.waitForSelector("text=123 Maple Street");
  await page.getByText("123 Maple Street").first().click();
  await expect(
    page.getByRole("heading", { name: "123 Maple Street" })
  ).toBeVisible();
}

// ── 1. Dashboard ─────────────────────────────────────────────────────────────

test.describe("Dashboard — initial state", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.goto("/dashboard");
  });

  test("renders the Dashboard heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
  });

  test("shows the injected property card", async ({ page }) => {
    await expect(page.getByText("123 Maple Street")).toBeVisible();
    await expect(page.getByText("Austin, TX 78701")).toBeVisible();
  });

  test("Properties stat card shows 1", async ({ page }) => {
    await expect(page.getByText("Properties").first()).toBeVisible();
    // The stat value sits next to the label
    const statCard = page.locator("text=Properties").locator("..").locator("..");
    await expect(statCard.getByText("1")).toBeVisible();
  });

  test("Verified Jobs stat card shows 3 from mock history", async ({ page }) => {
    const statCard = page
      .locator("text=Verified Jobs")
      .locator("..")
      .locator("..");
    await expect(statCard.getByText("3")).toBeVisible();
  });

  test("Total Value Added stat shows $11,830 from mock history", async ({
    page,
  }) => {
    await expect(page.getByText("$11,830")).toBeVisible();
  });

  test("Quick Actions section contains Log a Job button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /log a job/i })
    ).toBeVisible();
  });

  test("Recent Activity shows existing verified HVAC job", async ({ page }) => {
    await expect(page.getByText("HVAC — Cool Air Services")).toBeVisible();
  });

  test("verified job in Recent Activity shows success badge", async ({
    page,
  }) => {
    // The HVAC row is verified — its badge text is "verified"
    const hvacRow = page.getByText("HVAC — Cool Air Services").locator("..");
    await expect(hvacRow).toBeVisible();
    // At least one "verified" badge is visible in the activity list
    await expect(page.getByText("verified").first()).toBeVisible();
  });

  test("completed job in Recent Activity shows completed badge", async ({
    page,
  }) => {
    await expect(page.getByText("Roofing — Top Roof Co")).toBeVisible();
    await expect(page.getByText("completed")).toBeVisible();
  });

  test("DIY job in Recent Activity shows DIY label", async ({ page }) => {
    await expect(page.getByText("Painting — DIY")).toBeVisible();
  });
});

// ── 2. Contractor job creation ────────────────────────────────────────────────

test.describe("Contractor job creation", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    // Load dashboard first so the property store is populated, then
    // use the quick-action button for client-side navigation (store preserved).
    await page.goto("/dashboard");
    await page.waitForSelector("text=123 Maple Street");
    await page.getByRole("button", { name: /log a job/i }).click();
    await expect(
      page.getByRole("heading", { name: "Log a Job" })
    ).toBeVisible();
  });

  test("property is pre-selected in the form", async ({ page }) => {
    // The property selector should already show the injected property
    await expect(
      page.getByRole("combobox").filter({ hasText: "123 Maple Street" })
    ).toBeVisible();
  });

  test("successful submit redirects to dashboard", async ({ page }) => {
    await page.getByLabel(/service type/i).selectOption("Plumbing");
    await page.getByLabel(/contractor \/ company name/i).fill("Fix-It Pro LLC");
    await page.locator('input[type="number"]').first().fill("1500");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();

    await expect(page).toHaveURL("/dashboard");
  });

  test("success toast appears after submit", async ({ page }) => {
    await page.getByLabel(/service type/i).selectOption("Plumbing");
    await page.getByLabel(/contractor \/ company name/i).fill("Fix-It Pro LLC");
    await page.locator('input[type="number"]').first().fill("1500");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();

    await expect(page.getByText("Job logged successfully!")).toBeVisible();
  });

  test("new job appears in Recent Activity with pending badge", async ({
    page,
  }) => {
    await page.getByLabel(/service type/i).selectOption("Plumbing");
    await page.getByLabel(/contractor \/ company name/i).fill("Fix-It Pro LLC");
    await page.locator('input[type="number"]').first().fill("1500");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(
      page.getByText("Plumbing — Fix-It Pro LLC")
    ).toBeVisible();
    await expect(page.getByText("pending")).toBeVisible();
  });

  test("new job amount is shown correctly in Recent Activity", async ({
    page,
  }) => {
    await page.getByLabel(/service type/i).selectOption("HVAC");
    await page.getByLabel(/contractor \/ company name/i).fill("Cool Breeze AC");
    await page.locator('input[type="number"]').first().fill("3200");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("$3,200")).toBeVisible();
  });

  test("Verified Jobs stat does not change after creating a pending job", async ({
    page,
  }) => {
    // Submit a new job
    await page.getByLabel(/service type/i).selectOption("Electrical");
    await page.getByLabel(/contractor \/ company name/i).fill("Bright Sparks");
    await page.locator('input[type="number"]').first().fill("900");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();

    await expect(page).toHaveURL("/dashboard");
    // Verified count stays at 3 — the new job is only pending
    const statCard = page
      .locator("text=Verified Jobs")
      .locator("..")
      .locator("..");
    await expect(statCard.getByText("3")).toBeVisible();
  });
});

// ── 3. DIY job creation ───────────────────────────────────────────────────────

test.describe("DIY job creation", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await page.goto("/dashboard");
    await page.waitForSelector("text=123 Maple Street");
    await page.getByRole("button", { name: /log a job/i }).click();
    await expect(
      page.getByRole("heading", { name: "Log a Job" })
    ).toBeVisible();
    await page.getByText("I did this myself (DIY)").click();
  });

  test("successful DIY submit redirects to dashboard", async ({ page }) => {
    await page.getByLabel(/service type/i).selectOption("Painting");
    await page.locator('input[type="number"]').first().fill("250");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Job logged successfully!")).toBeVisible();
  });

  test("new DIY job appears in Recent Activity with DIY label", async ({
    page,
  }) => {
    await page.getByLabel(/service type/i).selectOption("Flooring");
    await page.locator('input[type="number"]').first().fill("800");
    await page.getByRole("button", { name: /log job to blockchain/i }).click();

    await expect(page).toHaveURL("/dashboard");
    await expect(page.getByText("Flooring — DIY")).toBeVisible();
    await expect(page.getByText("pending")).toBeVisible();
  });
});

// ── 4. Property detail page ───────────────────────────────────────────────────

test.describe("Property detail page", () => {
  test.beforeEach(async ({ page }) => {
    await setup(page);
    await gotoPropertyDetail(page);
  });

  test("renders property address as page heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "123 Maple Street" })
    ).toBeVisible();
  });

  test("renders city, state and year built in subheading", async ({ page }) => {
    await expect(page.getByText(/Austin.*TX.*78701/)).toBeVisible();
    await expect(page.getByText(/Built 2001/)).toBeVisible();
  });

  test("stats panel: Total Jobs = 4", async ({ page }) => {
    await expect(page.getByText("Total Jobs")).toBeVisible();
    const totalJobsStat = page.getByText("Total Jobs").locator("..").locator("..");
    await expect(totalJobsStat.getByText("4")).toBeVisible();
  });

  test("stats panel: Verified = 3", async ({ page }) => {
    const verifiedStat = page.getByText("Verified").locator("..").locator("..");
    await expect(verifiedStat.getByText("3")).toBeVisible();
  });

  test("stats panel: Value Added = $11,830", async ({ page }) => {
    await expect(page.getByText("Value Added")).toBeVisible();
    await expect(page.getByText("$11,830")).toBeVisible();
  });

  test("Share HomeGentic Report button is visible", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Share HomeGentic Report" })
    ).toBeVisible();
  });

  test("Share HomeGentic Report button opens the report modal", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Share HomeGentic Report" }).click();
    // The GenerateReportModal renders expiry options
    await expect(page.getByText(/7 days|generate report|never/i)).toBeVisible();
  });

  // ── Timeline tab ────────────────────────────────────────────────────────────

  test.describe("Timeline tab (default)", () => {
    test("shows all four mock jobs", async ({ page }) => {
      await expect(page.getByText("HVAC")).toBeVisible();
      await expect(page.getByText("Roofing")).toBeVisible();
      await expect(page.getByText("Plumbing")).toBeVisible();
      await expect(page.getByText("Painting")).toBeVisible();
    });

    test("shows contractor names for non-DIY jobs", async ({ page }) => {
      await expect(page.getByText("Cool Air Services")).toBeVisible();
      await expect(page.getByText("Top Roof Co")).toBeVisible();
      await expect(page.getByText("Flow Masters")).toBeVisible();
    });

    test("shows DIY label for the DIY painting job", async ({ page }) => {
      // The Painting job has isDiy:true — renders as "DIY" in the subtitle
      const paintingCard = page.getByText("Painting").locator("..").locator("..");
      await expect(paintingCard.getByText("DIY")).toBeVisible();
    });

    test("verified jobs show a verified badge", async ({ page }) => {
      // Three jobs are verified — expect at least three "verified" badge texts
      const verifiedBadges = page.getByText("verified");
      await expect(verifiedBadges).toHaveCount(3);
    });

    test("completed job shows a completed badge", async ({ page }) => {
      await expect(page.getByText("completed")).toBeVisible();
    });

    test("shows correct dollar amounts on timeline cards", async ({ page }) => {
      await expect(page.getByText("$2,400")).toBeVisible(); // HVAC
      await expect(page.getByText("$8,500")).toBeVisible(); // Roofing
      await expect(page.getByText("$650")).toBeVisible();   // Plumbing
      await expect(page.getByText("$280")).toBeVisible();   // Painting
    });
  });

  // ── Jobs tab ────────────────────────────────────────────────────────────────

  test.describe("Jobs tab", () => {
    test.beforeEach(async ({ page }) => {
      await page.getByRole("button", { name: /jobs/i }).click();
    });

    test("renders a table with all four jobs", async ({ page }) => {
      await expect(page.getByRole("table")).toBeVisible();
      const rows = page.getByRole("row");
      // 1 header row + 4 data rows
      await expect(rows).toHaveCount(5);
    });

    test("table header columns are present", async ({ page }) => {
      await expect(page.getByText("Service")).toBeVisible();
      await expect(page.getByText("Contractor")).toBeVisible();
      await expect(page.getByText("Amount")).toBeVisible();
      await expect(page.getByText("Status")).toBeVisible();
    });

    test("HVAC row has correct contractor and status", async ({ page }) => {
      const hvacRow = page.getByRole("row", { name: /HVAC/ });
      await expect(hvacRow.getByText("Cool Air Services")).toBeVisible();
      await expect(hvacRow.getByText("verified")).toBeVisible();
    });

    test("DIY job shows DIY in the Contractor column", async ({ page }) => {
      const paintRow = page.getByRole("row", { name: /Painting/ });
      await expect(paintRow.getByText("DIY")).toBeVisible();
    });

    test("Roofing row shows completed status", async ({ page }) => {
      const roofRow = page.getByRole("row", { name: /Roofing/ });
      await expect(roofRow.getByText("completed")).toBeVisible();
    });
  });
});

// ── 5. Sign & verify ─────────────────────────────────────────────────────────

test.describe("Sign & verify action", () => {
  test(
    "completed contractor job shows a Sign button",
    async ({ page }) => {
      await setup(page);
      await gotoPropertyDetail(page);
      const roofingCard = page.getByTestId("job-roofing");
      await expect(
        roofingCard.getByRole("button", { name: /sign/i })
      ).toBeVisible();
    }
  );

  test(
    "homeowner signing a DIY job transitions its status to verified",
    async ({ page }) => {
      await setup(page);
      // Create a fresh DIY job so it starts as pending
      await page.goto("/dashboard");
      await page.waitForSelector("text=123 Maple Street");
      await page.getByRole("button", { name: /log a job/i }).click();
      await page.getByText("I did this myself (DIY)").click();
      await page.getByLabel(/service type/i).selectOption("Landscaping");
      await page.locator('input[type="number"]').first().fill("400");
      await page.getByRole("button", { name: /log job to blockchain/i }).click();
      await expect(page).toHaveURL("/dashboard");

      // Navigate to property detail and sign the job
      await gotoPropertyDetail(page);
      const landscapeCard = page.getByTestId("job-landscaping");
      await landscapeCard.getByRole("button", { name: /sign/i }).click();

      // After signing a DIY job (only homeowner sig needed), status → verified
      await expect(landscapeCard.getByText("verified")).toBeVisible();
    }
  );

  test(
    "contractor job requires both signatures — shows awaiting contractor after homeowner signs",
    async ({ page }) => {
      await setup(page);
      await gotoPropertyDetail(page);
      const roofingCard = page.getByTestId("job-roofing");

      // Homeowner signs
      await roofingCard.getByRole("button", { name: /sign/i }).click();
      // Not yet verified — waiting for contractor
      await expect(roofingCard.getByText("verified")).not.toBeVisible();
      await expect(
        roofingCard.getByText(/awaiting contractor/i)
      ).toBeVisible();
    }
  );

  test(
    "a fully verified job does not show the Sign button",
    async ({ page }) => {
      await setup(page);
      await gotoPropertyDetail(page);
      const hvacCard = page.getByTestId("job-hvac");
      // HVAC is already verified in injected mock data
      await expect(hvacCard.getByText("verified")).toBeVisible();
      await expect(
        hvacCard.getByRole("button", { name: /sign/i })
      ).not.toBeVisible();
    }
  );
});
