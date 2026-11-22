/**
 * Shared pieces of the real-browser tests (*.live.test.ts): Chromium, the
 * people who sign in with the app's dev key, and small helpers. See
 * liveApp.ts for the canisters and the Vite server behind them.
 */

import { createRequire } from "module";
import { existsSync } from "fs";
import { resolve } from "path";
import type { Browser, BrowserContext, Page } from "playwright";
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import type { Principal } from "@icp-sdk/core/principal";

const require_ = createRequire(resolve(__dirname, "../../../package.json"));
const { chromium } = require_("playwright") as typeof import("playwright");

// Cloud dev containers ship Chromium here; elsewhere Playwright's own is used.
const PREINSTALLED = "/opt/pw-browsers/chromium";

export const launchChromium = (): Promise<Browser> =>
  chromium.launch(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});

/** The key the app's dev sign-in uses for a seed byte (actor.ts, window.__e2e_local_seed). */
export const identityOf = (seed: number): Ed25519KeyIdentity => {
  const bytes = new Uint8Array(32);
  bytes[0] = seed;
  return Ed25519KeyIdentity.generate(bytes);
};

export const principalOf = (seed: number): Principal => identityOf(seed).getPrincipal();

type R<T> = { ok: T } | { err: Record<string, unknown> };
export function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}

/** Client-side navigation: a full page load would drop the dev sign-in. */
export const go = (page: Page, path: string) =>
  page.evaluate((p) => {
    history.pushState({}, "", p);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);

export type Role = "Homeowner" | "Contractor" | "Realtor";

/**
 * People in their own browser contexts. `person(seed)` signs in as that seed
 * when it presses Dev Login; `guest()` never signs in. Uncaught page errors
 * are collected in `errors`.
 */
export function people(browser: () => Browser, baseUrl: () => string) {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];

  const open = async (label: string, seed?: number) => {
    const ctx = await browser().newContext();
    contexts.push(ctx);
    if (seed !== undefined)
      await ctx.addInitScript((s) => {
        (window as any).__e2e_local_seed = s;
      }, seed);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`${label}: ${e.message}`));
    return page;
  };

  /** The sign-up steps on /register, for someone already signed in. */
  const register = async (page: Page, role: Role, email: string) => {
    await page.getByRole("radio", { name: new RegExp(role) }).check({ timeout: 30_000 });
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByPlaceholder(/you@example.com/i).fill(email);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /create account/i }).click();
  };

  return {
    errors,
    person: (seed: number) => open(`seed ${seed}`, seed),
    guest: () => open("guest"),
    register,
    /** Dev sign-in only (for someone who already has a profile). */
    signIn: async (page: Page) => {
      await page.goto(`${baseUrl()}/login`);
      await page.getByRole("button", { name: /dev login/i }).click();
      await page.waitForURL(/dashboard/, { timeout: 30_000 });
    },
    /** Dev sign-in, then the two-step sign-up as `role`. */
    signUp: async (page: Page, role: Role, email: string) => {
      await page.goto(`${baseUrl()}/login`);
      await page.getByRole("button", { name: /dev login/i }).click();
      await page.waitForURL(/dashboard/);
      await go(page, "/register");
      await register(page, role, email);
      await page.waitForURL(/dashboard/, { timeout: 30_000 });
    },
    close: async () => {
      for (const c of contexts) await c.close().catch(() => {});
    },
  };
}
