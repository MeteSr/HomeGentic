/**
 * The web app in a real browser against real canisters, nothing mocked: all
 * 20 canisters on PocketIC wired as CI wires them, the Vite dev server
 * pointed at PocketIC's HTTP gateway (see __helpers__/liveApp.ts).
 *
 * A homeowner signs up, adds a home, logs a contractor job and signs it,
 * then invites the contractor; the contractor, in a separate browser and not
 * signed in, opens the invite link, signs in from the sign button and signs.
 * The homeowner then sees the job verified, and the canisters agree.
 *
 * Run: cd tests/upgrade && npx vitest run browser-flow.live.test.ts
 * (needs every canister's .dfx/local/canisters/<name>/<name>.wasm, the root
 * npm install, and Playwright's Chromium)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createRequire } from "module";
import { existsSync } from "fs";
import { resolve } from "path";
import type { Browser, BrowserContext, Page } from "playwright";
import { startLiveApp, type LiveApp } from "./__helpers__/liveApp";

const require_ = createRequire(resolve(__dirname, "../../package.json"));
const { chromium } = require_("playwright") as typeof import("playwright");

// Cloud dev containers ship Chromium here; elsewhere Playwright's own is used.
const PREINSTALLED = "/opt/pw-browsers/chromium";

// Dev sign-in derives a fixed key from this byte (window.__e2e_local_seed).
const HOMEOWNER_SEED = 11;
const CONTRACTOR_SEED = 12;

/** Client-side navigation: a full page load would drop the dev sign-in. */
const go = (page: Page, path: string) =>
  page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);

describe("browser: log a job and get it countersigned", () => {
  let app: LiveApp;
  let browser: Browser;
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];

  const person = async (seed: number) => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    await ctx.addInitScript((s) => { (window as any).__e2e_local_seed = s; }, seed);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(`seed ${seed}: ${e.message}`));
    return page;
  };

  beforeAll(async () => {
    app = await startLiveApp();
    browser = await chromium.launch(existsSync(PREINSTALLED) ? { executablePath: PREINSTALLED } : {});
  }, 300_000);

  afterAll(async () => {
    for (const c of contexts) await c.close().catch(() => {});
    await browser?.close();
    await app?.stop();
  }, 60_000);

  it("signs up, adds a home, logs and signs a job, and the contractor countersigns from the invite link", async () => {
    const owner = await person(HOMEOWNER_SEED);

    // Sign in (dev key) and create a homeowner account.
    await owner.goto(`${app.baseUrl}/login`);
    await owner.getByRole("button", { name: /dev login/i }).click();
    await owner.waitForURL(/dashboard/);
    await go(owner, "/register");
    await owner.getByText("Homeowner", { exact: true }).click();
    await owner.getByRole("button", { name: /continue/i }).click();
    await owner.getByPlaceholder(/you@example.com/i).fill("owner@example.com");
    await owner.getByRole("button", { name: /review/i }).click();
    await owner.getByRole("checkbox").check();
    await owner.getByRole("button", { name: /create account/i }).click();
    await owner.waitForURL(/dashboard/, { timeout: 30_000 });

    // The add-property wizard opens for a new account.
    await owner.getByRole("heading", { name: /where is the home/i }).waitFor({ timeout: 30_000 });
    await owner.getByLabel(/street address/i).fill("11 Live Oak Lane");
    await owner.getByLabel(/city/i).fill("Orlando");
    await owner.getByLabel(/state/i).fill("FL");
    await owner.getByLabel(/zip code/i).fill("32801");
    await owner.getByRole("button", { name: /continue/i }).click();
    await owner.getByLabel(/year built/i).fill("2004");
    await owner.getByLabel(/square feet/i).fill("1850");
    await owner.getByRole("button", { name: /save property/i }).click();
    await owner.getByText("Property saved!").waitFor({ timeout: 30_000 });
    await owner.keyboard.press("Escape");
    await owner.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });

    // Log a contractor job.
    await go(owner, "/jobs/new");
    await owner.getByLabel("Service Type *").selectOption("HVAC");
    await owner.getByLabel(/contractor \/ company name/i).fill("Cool Air Services LLC");
    await owner.getByLabel(/amount paid/i).fill("4200");
    await owner.getByLabel(/date completed/i).fill("2026-09-15");
    await owner.getByLabel(/description/i).fill("Replaced the 3-ton condenser.");
    await owner.getByRole("button", { name: /log job to blockchain/i }).click();
    await owner.getByText(/hasn't countersigned/).waitFor({ timeout: 30_000 });

    // The canisters hold what the UI said.
    const href = await owner.locator('a[href^="/properties/"]').first().getAttribute("href");
    const propertyId = href!.split("/")[2];
    const job = (await app.deployment.actor("job", app.admin).getJobsForProperty(propertyId)) as any;
    const jobs: any[] = "ok" in job ? job.ok : job;
    expect(jobs.map((j) => [j.contractorName[0] ?? j.contractorName, j.verified])).toEqual([["Cool Air Services LLC", false]]);

    // Homeowner signs, then invites the contractor.
    await go(owner, `/properties/${propertyId}`);
    await owner.getByRole("button", { name: "Sign →" }).click({ timeout: 30_000 });
    await owner.getByRole("button", { name: "Invite →" }).click({ timeout: 30_000 });
    const inviteUrl = await owner.locator("input[readonly]").first().inputValue({ timeout: 30_000 });
    expect(inviteUrl).toMatch(new RegExp(`^${app.baseUrl}/verify/INV_[0-9a-f]+$`));

    // The contractor isn't signed in; the link shows the job, and signing
    // signs them in first.
    const pro = await person(CONTRACTOR_SEED);
    await pro.goto(inviteUrl);
    await pro.getByRole("heading", { name: /confirm your work/i }).waitFor({ timeout: 30_000 });
    await expect(pro.getByText("11 Live Oak Lane", { exact: false }).count()).resolves.toBeGreaterThan(0);
    await pro.getByLabel(/your name/i).fill("Cool Air Services LLC");
    await pro.getByLabel(/phone/i).fill("+14075550199");
    await pro.getByLabel(/email/i).fill("pat@coolair.example");
    await pro.getByRole("button", { name: /sign in & confirm/i }).click();
    await pro.getByRole("heading", { name: /signature recorded/i }).waitFor({ timeout: 30_000 });

    // The homeowner sees it verified (not yet counted: the guest contractor
    // profile awaits HomeGentic's review).
    await owner.keyboard.press("Escape");
    await go(owner, "/dashboard");
    await go(owner, `/properties/${propertyId}`);
    const timeline = owner.locator("#property-tabs");
    await timeline.getByText(/^verified$/i).waitFor({ timeout: 30_000 });
    await expect(timeline.getByText(/contractor not yet verified/i).count()).resolves.toBe(1);

    const after = (await app.deployment.actor("job", app.admin).getJobsForProperty(propertyId)) as any;
    const [signed] = "ok" in after ? after.ok : after;
    expect([signed.homeownerSigned, signed.contractorSigned, signed.verified]).toEqual([true, true, true]);
    expect(signed.contractor[0]).toBeDefined();

    expect(errors).toEqual([]);
  }, 240_000);
});
