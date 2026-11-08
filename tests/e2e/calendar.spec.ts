/**
 * Calendar export E2E (#717)
 *
 * CAL.1  /maintenance: turning on the calendar link shows it, with the copy
 *        saying anyone with the link can read it; turning it off hides it
 * CAL.2  /warranties: "Add to calendar" downloads an .ics with the warranty end
 * CAL.3  with the job canister absent (no e2e calendar mock) the card stays hidden
 * CAL.4  the Insurance tab downloads the renewal date, without the policy number
 *
 * The job canister is replaced by window.__e2e_calendar.
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectSubscription, injectTestProperties, injectWarrantyJobs } from "./helpers/testData";

test.describe("CAL — calendar link on /maintenance", () => {
  test("CAL.1 turns the link on and off", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await injectWarrantyJobs(page);
    await page.addInitScript(() => {
      (window as any).__e2e_calendar = {};
    });
    await page.goto("/maintenance");
    const card = page.getByTestId("calendar-feed");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Anyone with the link can see those dates");

    await card.getByRole("button", { name: "Turn on calendar link" }).click();
    await expect(page.getByTestId("calendar-feed-url")).toContainText(/\/calendar\/c{32}\.ics$/);
    await expect(card.getByRole("link", { name: "Open in calendar app" })).toHaveAttribute(
      "href",
      /^webcal:\/\/.+\/calendar\/c{32}\.ics$/,
    );
    await expect(card).toContainText(/CALENDAR LINK · \d+ DATES?/);

    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Turn off" }).click();
    await expect(card.getByRole("button", { name: "Turn on calendar link" })).toBeVisible();
  });

  test("CAL.3 stays hidden without the job canister", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await injectWarrantyJobs(page);
    await page.goto("/maintenance");
    await expect(page.getByText("SCHEDULED TASKS")).toBeVisible();
    await expect(page.getByTestId("calendar-feed")).toHaveCount(0);
  });
});

test.describe("CAL — Add to calendar on /warranties", () => {
  test("CAL.2 downloads the warranty end as an .ics file", async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Pro");
    await injectWarrantyJobs(page);
    await page.goto("/warranties");
    const button = page.getByRole("button", { name: "Add HVAC warranty end to calendar" });
    await expect(button).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("warranty-hvac.ics");
    const path = await download.path();
    const { readFileSync } = await import("fs");
    const text = readFileSync(path!, "utf8");
    expect(text).toContain("BEGIN:VEVENT");
    expect(text).toContain("SUMMARY:Warranty ends: HVAC (Cool Air Services)");
  });
});

test.describe("CAL — Add to calendar on the Insurance tab", () => {
  test("CAL.4 downloads the renewal date without the policy number", async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
    await page.addInitScript(() => {
      (window as any).__e2e_insurance_policies = {
        "1": {
          carrier: "Citizens",
          policyNumber: "HO3-42",
          renewalDate: "2030-06-01",
          coverageA: null,
          hurricaneDeductible: null,
        },
      };
    });
    await page.goto("/properties/1");
    await expect(page.getByText(/123 maple street/i).first()).toBeVisible();
    await page.getByRole("button", { name: "Insurance", exact: true }).click();
    const button = page.getByRole("button", { name: "Add insurance renewal to calendar" });
    await expect(button).toBeVisible();
    const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
    expect(download.suggestedFilename()).toBe("insurance-renewal.ics");
    const { readFileSync } = await import("fs");
    const text = readFileSync((await download.path())!, "utf8");
    expect(text).toContain("SUMMARY:Home insurance renews (Citizens)");
    expect(text).toContain("DTSTART;VALUE=DATE:20300601");
    expect(text).not.toContain("HO3-42");
  });
});
