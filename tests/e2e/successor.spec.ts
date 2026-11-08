/**
 * Successor for the home record (#724): the owner names who can claim the
 * record if they die or the home passes to a trust or heir; the successor
 * sends a claim with a document; the owner can cancel it during the wait.
 * Mock mode: successors, links and claims from __e2e_succession.
 *
 * Seed (helpers/testData.ts): property 1 is 123 Maple Street, owned by the
 * test principal.
 */
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

const DAY = 86_400_000;

test.describe("Successor", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await injectSubscription(page, "Pro");
  });

  test("the owner names a successor from the home's settings and gets a link", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_succession = { successors: {}, invites: {}, claims: [] };
    });
    await page.goto("/properties/1");
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: /successor and claims/i }).click();
    await expect(page).toHaveURL(/\/properties\/1\/successor$/);
    await expect(page.getByRole("heading", { name: "Successor", exact: true })).toBeVisible();
    await expect(page.getByText(/doesn't transfer the property or act in any estate or probate matter/i)).toBeVisible();

    await page.getByLabel("Name", { exact: true }).fill("Jordan Rivera");
    await page.getByLabel("Email", { exact: true }).fill("jordan@example.com");
    await page.getByLabel(/relationship/i).fill("Daughter");
    await page.getByRole("button", { name: "Save successor" }).click();
    await expect(page.getByLabel("Successor link")).toHaveValue(/\/successor\/e2e-1-/);
  });

  test("a successor sends a claim with a document and sees it in review", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_succession = {
        successors: {},
        invites: {
          tok123: {
            propertyId: "1",
            address: "123 Maple Street",
            city: "Austin",
            state: "TX",
            zipCode: "78701",
            successorName: "Jordan Rivera",
            waitDays: 30,
          },
        },
        claims: [],
      };
    });
    await page.goto("/successor/tok123");
    await expect(page.getByRole("heading", { name: /123 Maple Street/ })).toBeVisible();
    await page.getByLabel("Your full name").fill("Jordan Rivera");
    await page.getByLabel("Document type").selectOption("LettersOfAdministration");
    await page.getByLabel("Document", { exact: true }).setInputFiles({
      name: "letters.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n%%EOF"),
    });
    await page.getByRole("button", { name: "Send claim" }).click();
    await expect(page).toHaveURL(/\/successor-claims$/);
    await expect(page.getByText("In review")).toBeVisible();
    await expect(page.getByText(/Waiting for HomeGentic to review the document/)).toBeVisible();
  });

  test("an unknown successor link says it isn't valid", async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__e2e_succession = { successors: {}, invites: {}, claims: [] };
    });
    await page.goto("/successor/nope");
    await expect(page.getByRole("heading", { name: /this successor link isn't valid/i })).toBeVisible();
  });

  test("the owner cancels an open claim", async ({ page }) => {
    await page.addInitScript((day) => {
      const now = Date.now();
      (window as any).__e2e_succession = {
        successors: {
          "1": { name: "Jordan Rivera", email: "jordan@example.com", relationship: "", token: "tok123", namedAt: now },
        },
        invites: {},
        claims: [
          {
            id: "sc-1",
            propertyId: "1",
            claimant: "heir",
            claimantName: "Jordan Rivera",
            proofKind: "DeathCertificate",
            fileName: "c.pdf",
            mimeType: "application/pdf",
            proofSize: 12,
            note: "",
            openedAt: now,
            waitEndsAt: now + 30 * day,
            status: { tag: "AwaitingReview" },
          },
        ],
      };
    }, DAY);
    await page.goto("/properties/1/successor");
    await expect(page.getByText("A successor claim is open")).toBeVisible();
    await page.getByRole("button", { name: "Cancel claim" }).click();
    await page.getByRole("button", { name: "Yes, cancel it" }).click();
    await expect(page.getByText("A successor claim is open")).toHaveCount(0);
  });
});
