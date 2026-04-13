import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties } from "./helpers/testData";

/**
 * E2E tests for the contractor-initiated job proposal feature.
 *
 * Flow:
 *   1. Contractor logs in and opens the AI chat
 *   2. Contractor describes completed work at a homeowner's address
 *   3. AI extracts fields and calls propose_job tool
 *   4. A confirmation card appears in the chat
 *   5. Contractor confirms → proposal submitted to homeowner
 *   6. Homeowner logs in and sees the pending proposal in their dashboard
 *   7. Homeowner approves → job appears in their job history
 *   8. Homeowner rejects → proposal disappears
 *
 * These tests are written first (TDD). Routes and components do not yet exist.
 * They will fail until implementation is complete.
 */

// ── Contractor auth injection (ContractorPro tier) ────────────────────────────

async function injectContractorAuth(page: any) {
  await page.addInitScript(() => {
    (window as any).__e2e_principal  = "contractor-e2e-principal";
    (window as any).__e2e_user_role  = "Contractor";
    (window as any).__e2e_user_tier  = "ContractorPro";
    (window as any).__e2e_user_name  = "Alice Plumber";
  });
}

async function injectHomeownerAuth(page: any) {
  await injectTestAuth(page, "homeowner-e2e-principal");
  await page.addInitScript(() => {
    (window as any).__e2e_user_role  = "Homeowner";
    (window as any).__e2e_user_tier  = "Pro";
  });
}

// Mock property and pending proposal data for the homeowner view
async function injectPendingProposal(page: any) {
  await page.addInitScript(() => {
    (window as any).__e2e_properties = [
      {
        id: "prop-homeowner-1",
        owner: "homeowner-e2e-principal",
        address: "123 Maple Street",
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

    (window as any).__e2e_pending_proposals = [
      {
        id: "JOB_PROPOSAL_1",
        propertyId: "prop-homeowner-1",
        homeowner: "homeowner-e2e-principal",
        contractor: "contractor-e2e-principal",
        contractorName: "Alice Plumber",
        serviceType: "Plumbing",
        description: "Replaced under-sink shut-off valve and supply lines in the kitchen.",
        amount: 18_000,          // $180
        completedDate: "2026-04-10",
        status: "PendingHomeownerApproval",
        contractorSigned: true,
        homeownerSigned:  false,
        createdAt: Date.now() - 3_600_000,
      },
    ];
  });
}

// ── Contractor chat interface ─────────────────────────────────────────────────

test.describe("Contractor job proposal — chat interface", () => {
  test.beforeEach(async ({ page }) => {
    await injectContractorAuth(page);
    await page.goto("/contractor-dashboard");
  });

  test("contractor dashboard has an AI chat or 'Log Job' entry point", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /log job|add job|ai chat|submit job/i })
        .or(page.getByText(/log a job|submit.*job|job.*ai/i))
    ).toBeVisible();
  });

  test("AI chat panel opens from the contractor dashboard", async ({ page }) => {
    await page.getByRole("button", { name: /log job|add job|ai chat|submit job/i }).first().click();
    await expect(
      page.getByPlaceholder(/describe.*work|what.*did.*you|type.*message/i)
        .or(page.getByRole("textbox").filter({ hasText: "" }))
    ).toBeVisible();
  });
});

test.describe("Contractor job proposal — chat submit flow (mocked AI)", () => {
  test.beforeEach(async ({ page }) => {
    await injectContractorAuth(page);
    // Mock the agent endpoint so we control the AI response
    await page.route("**/api/agent", async (route) => {
      const body = await route.request().postDataJSON();
      const lastMsg = body?.messages?.at(-1)?.content ?? "";

      if (typeof lastMsg === "string" && /plumbing|valve|maple/i.test(lastMsg)) {
        // AI responds with a propose_job tool call
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            type: "tool_calls",
            assistantMessage: {
              role: "assistant",
              content: [{
                type: "tool_use",
                id: "toolu_01",
                name: "propose_job",
                input: {
                  property_address: "123 Maple Street, Austin TX 78701",
                  service_type:     "Plumbing",
                  description:      "Replaced under-sink shut-off valve and supply lines.",
                  amount_cents:     18000,
                  completed_date:   "2026-04-10",
                  contractor_name:  "Alice Plumber",
                },
              }],
            },
            toolCalls: [{
              id:   "toolu_01",
              name: "propose_job",
              args: {
                property_address: "123 Maple Street, Austin TX 78701",
                service_type:     "Plumbing",
                description:      "Replaced under-sink shut-off valve and supply lines.",
                amount_cents:     18000,
                completed_date:   "2026-04-10",
                contractor_name:  "Alice Plumber",
              },
            }],
          }),
        });
      } else {
        // Final answer after tool result
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            type: "answer",
            text: "Here's a summary of the job I found. Please confirm before submitting.",
          }),
        });
      }
    });

    await page.goto("/contractor-dashboard");
  });

  test("typing a job description triggers a proposal confirmation card", async ({ page }) => {
    const chatInput = page.getByPlaceholder(/describe.*work|what.*did.*you|type.*message/i)
      .or(page.getByRole("textbox")).first();

    await chatInput.fill("I just replaced the shut-off valve under the sink at 123 Maple Street in Austin. Plumbing job, charged $180, done April 10th.");
    await chatInput.press("Enter");

    // Confirmation card should appear with the extracted details
    await expect(
      page.getByText(/confirmation|confirm.*job|review.*proposal/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("confirmation card shows the service type", async ({ page }) => {
    const chatInput = page.getByPlaceholder(/describe.*work|type.*message/i)
      .or(page.getByRole("textbox")).first();

    await chatInput.fill("Plumbing repair at 123 Maple Street Austin TX, $180, done April 10th");
    await chatInput.press("Enter");

    await expect(page.getByText(/Plumbing/)).toBeVisible({ timeout: 10_000 });
  });

  test("confirmation card shows the dollar amount", async ({ page }) => {
    const chatInput = page.getByPlaceholder(/describe.*work|type.*message/i)
      .or(page.getByRole("textbox")).first();

    await chatInput.fill("Plumbing repair at 123 Maple Street Austin TX, $180, done April 10th");
    await chatInput.press("Enter");

    await expect(page.getByText(/\$180|\$180\.00|18,?000/)).toBeVisible({ timeout: 10_000 });
  });

  test("confirmation card shows the property address", async ({ page }) => {
    const chatInput = page.getByPlaceholder(/describe.*work|type.*message/i)
      .or(page.getByRole("textbox")).first();

    await chatInput.fill("Plumbing repair at 123 Maple Street Austin TX, $180, done April 10th");
    await chatInput.press("Enter");

    await expect(page.getByText(/123 Maple/i)).toBeVisible({ timeout: 10_000 });
  });

  test("'Confirm & Send' button submits and shows success message", async ({ page }) => {
    // Mock the propose_job tool execution (frontend canister call)
    await page.route("**/api/**", async (route) => {
      // Let agent calls through — already mocked above
      await route.continue();
    });

    const chatInput = page.getByPlaceholder(/describe.*work|type.*message/i)
      .or(page.getByRole("textbox")).first();

    await chatInput.fill("Plumbing repair at 123 Maple Street Austin TX, $180, done April 10th");
    await chatInput.press("Enter");

    const confirmBtn = page.getByRole("button", { name: /confirm.*send|submit.*proposal|send.*homeowner/i });
    await expect(confirmBtn).toBeVisible({ timeout: 10_000 });
    await confirmBtn.click();

    await expect(
      page.getByText(/sent.*homeowner|proposal.*submitted|awaiting.*approval/i)
    ).toBeVisible({ timeout: 10_000 });
  });

  test("'Cancel' button on confirmation card discards the proposal", async ({ page }) => {
    const chatInput = page.getByPlaceholder(/describe.*work|type.*message/i)
      .or(page.getByRole("textbox")).first();

    await chatInput.fill("Plumbing repair at 123 Maple Street Austin TX, $180, done April 10th");
    await chatInput.press("Enter");

    const cancelBtn = page.getByRole("button", { name: /cancel|discard|edit/i });
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    await cancelBtn.click();

    // Confirmation card should disappear
    await expect(
      page.getByText(/confirm.*send|submit.*proposal/i)
    ).not.toBeVisible({ timeout: 5_000 });
  });
});

// ── Homeowner — pending proposals view ───────────────────────────────────────

test.describe("Homeowner — pending proposals view", () => {
  test.beforeEach(async ({ page }) => {
    await injectHomeownerAuth(page);
    await injectPendingProposal(page);
    await page.goto("/dashboard");
  });

  test("dashboard shows a 'Pending Proposals' section when proposals exist", async ({ page }) => {
    await expect(
      page.getByText(/pending proposal|awaiting.*approval|contractor.*submitted/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("pending proposal card shows the contractor name", async ({ page }) => {
    await expect(page.getByText(/Alice Plumber/i)).toBeVisible({ timeout: 8_000 });
  });

  test("pending proposal card shows the service type", async ({ page }) => {
    await expect(page.getByText(/Plumbing/i)).toBeVisible({ timeout: 8_000 });
  });

  test("pending proposal card shows the job amount", async ({ page }) => {
    await expect(page.getByText(/\$180|\$180\.00/)).toBeVisible({ timeout: 8_000 });
  });

  test("pending proposal card has an 'Approve' button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /approve/i })
    ).toBeVisible({ timeout: 8_000 });
  });

  test("pending proposal card has a 'Reject' button", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /reject|decline/i })
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Homeowner — approve proposal ─────────────────────────────────────────────

test.describe("Homeowner — approve proposal", () => {
  test.beforeEach(async ({ page }) => {
    await injectHomeownerAuth(page);
    await injectPendingProposal(page);
    await page.goto("/dashboard");
  });

  test("clicking 'Approve' removes proposal from pending list and shows success", async ({ page }) => {
    const approveBtn = page.getByRole("button", { name: /approve/i });
    await expect(approveBtn).toBeVisible({ timeout: 8_000 });
    await approveBtn.click();

    // Success feedback shown
    await expect(
      page.getByText(/approved|job.*added|record.*created|job.*logged/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("approved job appears in the job history list", async ({ page }) => {
    const approveBtn = page.getByRole("button", { name: /approve/i });
    await approveBtn.click();

    await expect(
      page.getByText(/Plumbing|Alice Plumber/i)
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Homeowner — reject proposal ───────────────────────────────────────────────

test.describe("Homeowner — reject proposal", () => {
  test.beforeEach(async ({ page }) => {
    await injectHomeownerAuth(page);
    await injectPendingProposal(page);
    await page.goto("/dashboard");
  });

  test("clicking 'Reject' removes the proposal from the list", async ({ page }) => {
    const rejectBtn = page.getByRole("button", { name: /reject|decline/i });
    await expect(rejectBtn).toBeVisible({ timeout: 8_000 });
    await rejectBtn.click();

    // Proposal should disappear from the pending list
    await expect(
      page.getByText(/JOB_PROPOSAL_1|Alice Plumber/i)
    ).not.toBeVisible({ timeout: 8_000 });
  });

  test("rejection shows a brief confirmation message", async ({ page }) => {
    await page.getByRole("button", { name: /reject|decline/i }).click();
    await expect(
      page.getByText(/rejected|declined|removed/i)
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ── Duplicate detection — homeowner flow ─────────────────────────────────────

test.describe("Duplicate proposal warning", () => {
  test.beforeEach(async ({ page }) => {
    await injectHomeownerAuth(page);
    await page.addInitScript(() => {
      (window as any).__e2e_properties = [
        {
          id: "prop-homeowner-1",
          owner: "homeowner-e2e-principal",
          address: "123 Maple Street",
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

      // An existing verified HVAC job within the 14-day window
      (window as any).__e2e_jobs = [
        {
          id: "JOB_EXISTING",
          propertyId: "prop-homeowner-1",
          homeowner: "homeowner-e2e-principal",
          serviceType: "HVAC",
          contractorName: "Cool Air Services",
          amount: 240_000,
          date: "2026-04-01",
          description: "Full HVAC replacement.",
          isDiy: false, status: "verified", verified: true,
          homeownerSigned: true, contractorSigned: true,
          photos: [], createdAt: Date.now() - 86_400_000 * 10,
        },
      ];

      // Duplicate proposal — same service type, same property, within 14 days
      (window as any).__e2e_pending_proposals = [
        {
          id: "JOB_DUP_PROPOSAL",
          propertyId: "prop-homeowner-1",
          homeowner: "homeowner-e2e-principal",
          contractor: "contractor-e2e-principal",
          contractorName: "Another HVAC Co",
          serviceType: "HVAC",
          description: "HVAC filter replacement.",
          amount: 8_000,
          completedDate: "2026-04-05",     // 4 days after JOB_EXISTING — within 14-day window
          status: "PendingHomeownerApproval",
          contractorSigned: true,
          homeownerSigned:  false,
          createdAt: Date.now() - 1_800_000,
          potentialDuplicateOf: "JOB_EXISTING",
        },
      ];
    });
    await page.goto("/dashboard");
  });

  test("duplicate proposal shows a warning badge or indicator", async ({ page }) => {
    await expect(
      page.getByText(/possible duplicate|similar job|already on record|review carefully/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("duplicate warning links to or mentions the existing job", async ({ page }) => {
    await expect(
      page.getByText(/JOB_EXISTING|Cool Air Services|existing job/i)
    ).toBeVisible({ timeout: 8_000 });
  });

  test("homeowner can still approve a flagged duplicate (their decision)", async ({ page }) => {
    const approveBtn = page.getByRole("button", { name: /approve/i });
    await expect(approveBtn).toBeVisible({ timeout: 8_000 });
    // Should be enabled — homeowner decides
    await expect(approveBtn).not.toBeDisabled();
  });
});
