/**
 * Internet Identity auth-flow E2E tests                             (#77)
 *
 * II.1  Unauthenticated user → /login → II popup → authenticated → /register|/dashboard
 * II.2  Sign out via user menu navigates to /
 * II.3  After Sign out, protected routes redirect to /login
 *
 * ── Running these tests ───────────────────────────────────────────────────────
 *
 * II.1 requires a locally deployed II canister.  Start the stack first:
 *
 *   dfx start --background
 *   dfx deps pull                # downloads the II Wasm from the IC
 *   dfx deps deploy              # deploys internet_identity at rdmx6-jaaaa-aaaaa-aaadq-cai
 *
 * Then run the full E2E suite (II.1 will no longer be skipped):
 *
 *   npm run test:e2e
 *
 * II.2 and II.3 use the window.__e2e_principal bypass and always run.
 *
 * ── Package used ─────────────────────────────────────────────────────────────
 *
 * @dfinity/internet-identity-playwright
 *   testWithII  – extended test fixture that provides the `iiPage` helper
 *   InternetIdentityPage.waitReady()  – polls until the II canister serves HTML
 *   InternetIdentityPage.signIn()     – creates a passkey via virtual WebAuthn,
 *                                       clicks the app's [data-tid=login-button],
 *                                       and resolves when the II popup closes
 */

import { testWithII } from "@dfinity/internet-identity-playwright";
import { test, expect } from "@playwright/test";
import { injectTestAuth } from "./helpers/auth";

// ─── constants ────────────────────────────────────────────────────────────────

const II_HOST        = "http://localhost:4943";
const II_CANISTER_ID = "rdmx6-jaaaa-aaaaa-aaadq-cai";
// subdomain URL used by the local II canister frontend
const II_ORIGIN      = `http://${II_CANISTER_ID}.localhost:4943/`;

// ── II.1 — Internet Identity login ───────────────────────────────────────────
//
// This suite skips automatically when the II canister isn't reachable so the
// regular CI (frontend-only, no replica) stays green.

testWithII.describe("Internet Identity — login flow", () => {
  // Check II availability once per worker before any test runs.
  let iiReachable = false;
  testWithII.beforeAll(async () => {
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2_000);
      const res   = await fetch(II_ORIGIN, { signal: ctrl.signal });
      clearTimeout(timer);
      iiReachable = res.ok;
    } catch {
      iiReachable = false;
    }
  });

  testWithII.beforeEach(() => {
    testWithII.skip(
      !iiReachable,
      `II canister unreachable at ${II_ORIGIN}\n` +
      `Start the replica first:\n` +
      `  dfx start --background && dfx deps pull && dfx deps deploy`,
    );
  });

  // II.1
  testWithII(
    "unauthenticated → /login → II popup → authenticated → /register or /dashboard",
    async ({ page, iiPage }) => {
      // 1. Wait for the II canister to be ready (polls the II HTML endpoint).
      await iiPage.waitReady({ url: II_HOST, canisterId: II_CANISTER_ID });

      // 2. Navigate to the app's login page.
      await page.goto("/login");

      // 3. signIn() sets up a virtual WebAuthn authenticator, then clicks
      //    [data-tid=login-button] in the app, waits for the II popup,
      //    completes passkey creation/auth inside the popup, and resolves
      //    when the popup closes and the app receives the principal.
      await iiPage.signIn({ passkey: { account: "HomeGentic-E2E" } });

      // 4. After successful authentication:
      //    - A brand-new II anchor (no registered app profile) → /register
      //    - A returning user with an existing app profile   → /dashboard
      await expect(page).toHaveURL(/\/(register|dashboard)/);
    },
  );
});

// ── II.2 & II.3 — Logout flow ────────────────────────────────────────────────
//
// The logout path is independent of HOW the user authenticated.
// We inject dev auth to reach the authenticated state, then exercise
// the real UI logout mechanism (user menu → Sign out).

test.describe("Internet Identity — logout flow", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestAuth(page);
  });

  // II.2
  test("Sign out via user menu navigates away from /dashboard", async ({ page }) => {
    await page.goto("/dashboard");

    // The avatar button aria-label is the user's display name.
    // injectTestAuth sets email = "e2e@test.com", so displayName = "e2e@test.com".
    await page.getByRole("button", { name: "e2e@test.com" }).click();
    await page.getByRole("button", { name: /sign out/i }).click();

    // After logout the user leaves /dashboard (may land at / or /login depending on race)
    await expect(page).not.toHaveURL("/dashboard");
  });

  // II.3
  test("after Sign out, protected routes redirect to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "e2e@test.com" }).click();
    await page.getByRole("button", { name: /sign out/i }).click();
    // Wait until navigated away from dashboard
    await expect(page).not.toHaveURL("/dashboard");

    // Auth state is cleared — ProtectedRoute now gates /dashboard → /login.
    // Use pushState (not page.goto) to navigate client-side; page.goto causes a
    // full reload which re-runs addInitScript and re-injects __e2e_principal.
    await page.evaluate(() => window.history.pushState({}, "", "/dashboard"));
    await page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
    await expect(page).toHaveURL("/login");
  });
});
