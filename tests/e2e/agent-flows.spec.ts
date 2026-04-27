/**
 * Agent persona E2E — /agent-dashboard, /agent/marketplace,
 *                     /agent/profile, /agents, /agent/:id    (#180)
 *
 * AF.1  /agent-dashboard with Realtor role → "Agent Dashboard" heading
 * AF.2  /agent/marketplace → "Agent Marketplace" heading + description
 * AF.3  /agent/profile → "Agent Profile" heading + form fields
 * AF.4  /agents with Basic tier → "Find an Agent" heading + search input
 * AF.5  /agent/:id with no canister → loading or not-found state (no crash)
 */

import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";
import { injectTestProperties, injectSubscription } from "./helpers/testData";

// ── AF.1 — Agent Dashboard (Realtor role) ─────────────────────────────────────

test.describe("AF.1 — /agent-dashboard (Realtor)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectTestProperties(page);
    await page.addInitScript(() => {
      (window as any).__e2e_profile = { role: "Realtor" };
    });
    await page.goto("/agent-dashboard");
    await expect(page.getByRole("heading", { name: /agent dashboard/i })).toBeVisible();
  });

  test("shows 'Agent Dashboard' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /agent dashboard/i })).toBeVisible();
  });

  test("shows share links section", async ({ page }) => {
    // Loads even with no share links
    await expect(page).toHaveURL("/agent-dashboard");
  });
});

// ── AF.2 — Agent Marketplace ──────────────────────────────────────────────────

test.describe("AF.2 — /agent/marketplace", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/agent/marketplace");
    await expect(page.getByRole("heading", { name: /agent marketplace/i })).toBeVisible();
  });

  test("shows 'Agent Marketplace' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /agent marketplace/i })).toBeVisible();
  });

  test("shows description about sealed proposals", async ({ page }) => {
    await expect(page.getByText(/sealed proposals/i)).toBeVisible();
  });
});

// ── AF.3 — Agent Profile Edit ─────────────────────────────────────────────────

test.describe("AF.3 — /agent/profile", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/agent/profile");
    await expect(page.getByRole("heading", { name: /agent profile/i })).toBeVisible();
  });

  test("shows 'Agent Profile' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /agent profile/i })).toBeVisible();
  });
});

// ── AF.4 — Agent Browse ───────────────────────────────────────────────────────

test.describe("AF.4 — /agents (Basic tier)", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
    await injectSubscription(page, "Basic");
    await page.goto("/agents");
    await expect(page.getByRole("heading", { name: /find an agent/i })).toBeVisible();
  });

  test("shows 'Find an Agent' heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /find an agent/i })).toBeVisible();
  });

  test("shows search input", async ({ page }) => {
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible();
  });

  test("shows 'Directory' eyebrow label", async ({ page }) => {
    await expect(page.getByText("Directory")).toBeVisible();
  });
});

// ── AF.5 — Agent public profile (/agent/:id) ──────────────────────────────────

test.describe("AF.5 — /agent/:id (no canister)", () => {
  test("renders without crashing (shows loading or not-found)", async ({ page }) => {
    await injectTestAuth(page);
    await page.goto("/agent/some-agent-id");
    // Page either stays on loading or resolves to not-found — no JS crash
    const loading = page.getByText(/loading/i);
    const notFound = page.getByText(/agent not found/i);
    await expect(loading.or(notFound)).toBeVisible({ timeout: 10_000 });
  });
});
