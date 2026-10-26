/**
 * ContractorPro and the Florida DBPR licence check E2E
 *
 * CP.1  Public profile: shows what DBPR's file says about the licence
 * CP.2  Own profile: "Check with Florida DBPR" shows the result
 * CP.3  Own profile: an out-of-state licence number has no DBPR check
 * CP.4  Public profile: featured work shows for ContractorPro only
 * CP.5  Own profile: ContractorPro features a co-signed job; Free sees what Pro adds
 * CP.6  Dashboard: ContractorPro gets the earnings view; Free sees what Pro adds
 * CP.7  A review-request link fills in the job ID
 *
 * Canisters and the voice Worker are replaced by window.__e2e_* globals:
 * __e2e_contractors, __e2e_license_checks (by principal; __next is what a
 * new check returns), __e2e_portfolios, __e2e_credentials, __e2e_tiers,
 * __e2e_subscription and __e2e_quotes.
 */

import { test, expect, type Page } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectContractors, injectQuotes } from "./helpers/testData";

const ME = "principal-fl";

const CONTRACTOR = {
  id: ME, name: "John Smith", specialties: ["Plumbing"], email: "john@smith.com", phone: "386-555-0101",
  bio: null, licenseNumber: "CFC1430000", serviceArea: "Daytona Beach, FL", serviceZips: ["32114"],
  trustScore: 70, jobsCompleted: 2, isVerified: false, createdAt: 0,
};

const CHECK = {
  licenseNumber: "CFC1430000", found: true, licenseeName: "SMITH, JOHN", dbaName: "",
  licenseType: "Certified Plumbing Contractor", status: "Current, Active", active: true,
  expiresOn: "2026-08-31", nameMatches: true, sourceDate: "2026-10-20", checkedAt: Date.UTC(2026, 9, 26),
};

const CREDS = [
  { id: 1, jobId: "JOB_1", contractorId: ME, serviceType: "Plumbing", verifiedAt: Date.UTC(2026, 4, 3), homeownerPrincipal: "h1" },
  { id: 2, jobId: "JOB_2", contractorId: ME, serviceType: "Plumbing", verifiedAt: Date.UTC(2026, 6, 9), homeownerPrincipal: "h2" },
];

async function setup(page: Page, tier: "ContractorFree" | "ContractorPro", extra: Record<string, unknown> = {}) {
  await injectTestAuth(page);
  await injectContractors(page, [CONTRACTOR]);
  await page.addInitScript(({ tier, me, creds, extra }) => {
    const w = window as any;
    w.__e2e_properties = [];
    w.__e2e_jobs = [];
    w.__e2e_subscription = { tier, expiresAt: null };
    w.__e2e_tiers = { [me]: tier };
    w.__e2e_credentials = { [me]: creds };
    w.__e2e_license_checks = {};
    w.__e2e_portfolios = {};
    Object.assign(w, extra);
  }, { tier, me: ME, creds: CREDS, extra });
}

test("CP.1 the public profile repeats what DBPR's file says", async ({ page }) => {
  await setup(page, "ContractorFree", { __e2e_license_checks: { [ME]: CHECK } });
  await page.goto(`/contractor/${ME}`);
  const badge = page.getByTestId("license-check");
  await expect(badge).toContainText("DBPR lists CFC1430000 as Current, Active, expiring 2026-08-31.");
  await expect(badge).toContainText("Checked 2026-10-26 against DBPR's licensee file dated 2026-10-20.");
});

test("CP.2 a contractor checks their licence with DBPR", async ({ page }) => {
  await setup(page, "ContractorFree", { __e2e_license_checks: { __next: CHECK } });
  await page.goto("/contractor/profile");
  await page.getByRole("button", { name: "Check with Florida DBPR" }).click();
  await expect(page.getByTestId("license-check-panel")).toContainText("DBPR lists CFC1430000 as Current, Active");
  await expect(page.getByTestId("license-check-panel")).toContainText("Homeowners see this on your public profile.");
});

test("CP.3 an out-of-state licence number has no DBPR check", async ({ page }) => {
  await setup(page, "ContractorFree");
  await page.addInitScript(() => { (window as any).__e2e_contractors[0].licenseNumber = "TX-HVAC-12345"; });
  await page.goto("/contractor/profile");
  await expect(page.getByRole("heading", { name: /profile/i }).first()).toBeVisible();
  await expect(page.getByTestId("license-check-panel")).toHaveCount(0);
});

const PORTFOLIO = { [ME]: [{ credentialId: 1, title: "Whole-home repipe", description: "PEX throughout.", serviceType: "Plumbing", verifiedAt: CREDS[0].verifiedAt, featuredAt: 0 }] };

test("CP.4 a ContractorPro profile shows featured work", async ({ page }) => {
  await setup(page, "ContractorPro", { __e2e_portfolios: PORTFOLIO });
  await page.goto(`/contractor/${ME}`);
  await expect(page.getByTestId("featured-work")).toContainText("Whole-home repipe");
});

test("CP.4b featured work hides when the contractor no longer has ContractorPro", async ({ page }) => {
  await setup(page, "ContractorFree", { __e2e_portfolios: PORTFOLIO });
  await page.goto(`/contractor/${ME}`);
  await expect(page.getByText("Verified Work Portfolio")).toBeVisible();
  await expect(page.getByTestId("featured-work")).toHaveCount(0);
});

test("CP.5 ContractorPro features a co-signed job; Free sees what Pro adds", async ({ page }) => {
  await setup(page, "ContractorPro");
  await page.goto("/contractor/profile");
  const editor = page.getByTestId("portfolio-editor");
  await editor.getByRole("checkbox").first().check();
  await editor.getByLabel(/Title for Plumbing job JOB_2/).fill("Water heater swap");
  await editor.getByRole("button", { name: "Save portfolio" }).click();
  await expect(page.getByText("Portfolio saved.")).toBeVisible();
  const saved = await page.evaluate((me) => (window as any).__e2e_portfolios[me], ME);
  expect(saved.map((e: any) => e.title)).toEqual(["Water heater swap"]);
});

test("CP.5b Contractor Free sees what the portfolio is", async ({ page }) => {
  await setup(page, "ContractorFree");
  await page.goto("/contractor/profile");
  await expect(page.getByTestId("portfolio-upsell")).toContainText("With ContractorPro you can feature your co-signed jobs");
});

const BID = { id: "bid-1", requestId: "req-1", contractor: ME, amount: 1500_00, timeline: 5, validUntil: Date.now() + 86_400_000, status: "accepted" as const, createdAt: Date.now() };

test("CP.6 ContractorPro gets the earnings view", async ({ page }) => {
  await injectQuotes(page, [BID]);
  await setup(page, "ContractorPro");
  await page.goto("/contractor-dashboard");
  await expect(page.getByTestId("earnings-view")).toContainText("from 1 accepted bid");
  await expect(page.getByRole("button", { name: /Download CSV/ })).toBeEnabled();
});

test("CP.6b Contractor Free sees what the earnings view is", async ({ page }) => {
  await injectQuotes(page, [BID]);
  await setup(page, "ContractorFree");
  await page.goto("/contractor-dashboard");
  await expect(page.getByTestId("earnings-upsell")).toBeVisible();
  await expect(page.getByTestId("earnings-view")).toHaveCount(0);
});

test("CP.7 a review-request link fills in the job ID", async ({ page }) => {
  await setup(page, "ContractorPro");
  await page.goto(`/contractor/${ME}?review=JOB_9#review`);
  await expect(page.getByPlaceholder("e.g. JOB_1")).toHaveValue("JOB_9");
});
