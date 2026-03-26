import { Page } from "@playwright/test";

/**
 * Injects a fake principal before React boots so AuthContext skips Internet
 * Identity and immediately marks the session as authenticated.
 *
 * Call this before page.goto() so the script runs before React hydrates.
 */
export async function injectTestAuth(page: Page, principal = "test-e2e-principal") {
  await page.addInitScript((p) => {
    (window as any).__e2e_principal = p;
  }, principal);
}
