/**
 * The web app in a real browser against real canisters, nothing mocked: all
 * 20 canisters on PocketIC wired as CI wires them, the Vite dev server
 * pointed at PocketIC's HTTP gateway (see __helpers__/liveApp.ts).
 *
 * A homeowner signs up, adds a home, logs a contractor job and signs it,
 * then invites the contractor; the contractor, in a separate browser and not
 * signed in, opens the invite link, signs in from the sign button and signs.
 * The homeowner then sees the job verified, and the canisters agree. An
 * admin verifies the contractor on /admin, and the job starts counting.
 *
 * A realtor signs up, files licence details on /agents/verify, is reviewed
 * by HomeGentic, finds a home on /agents/browse that a homeowner put up for
 * Bid to List, and places a sealed bid that shows on /agents/bids.
 *
 * New people open a gift link and a manager-invite link while signed out,
 * sign in, register, and land back on the link to redeem / accept it.
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
import { Ed25519KeyIdentity } from "@icp-sdk/core/identity";
import { createIdentity } from "@dfinity/pic";
import type { Principal } from "@icp-sdk/core/principal";
import { startLiveApp, type LiveApp } from "./__helpers__/liveApp";
import { ALL_CANISTERS } from "./__helpers__/deployAll";

const require_ = createRequire(resolve(__dirname, "../../package.json"));
const { chromium } = require_("playwright") as typeof import("playwright");

// Cloud dev containers ship Chromium here; elsewhere Playwright's own is used.
const PREINSTALLED = "/opt/pw-browsers/chromium";

// Dev sign-in derives a fixed key from this byte (window.__e2e_local_seed).
const HOMEOWNER_SEED = 11;
const CONTRACTOR_SEED = 12;
const ADMIN_SEED = 13;
const REALTOR_SEED = 14;
const GIFTEE_SEED = 15;
const MANAGER_SEED = 16;

/** The principal the app's dev sign-in uses for a seed (actor.ts). */
const principalOf = (seed: number): Principal => {
  const bytes = new Uint8Array(32);
  bytes[0] = seed;
  return Ed25519KeyIdentity.generate(bytes).getPrincipal();
};

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}

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

  /** Dev sign-in, then the three-step sign-up as `role`. */
  const signUp = async (page: Page, role: "Homeowner" | "Realtor", email: string) => {
    await page.goto(`${app.baseUrl}/login`);
    await page.getByRole("button", { name: /dev login/i }).click();
    await page.waitForURL(/dashboard/);
    await go(page, "/register");
    await page.getByText(role, { exact: true }).click();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByPlaceholder(/you@example.com/i).fill(email);
    await page.getByRole("button", { name: /review/i }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 30_000 });
  };

  /** The sign-up steps on /register, for someone already signed in. */
  const register = async (page: Page, role: "Homeowner" | "Realtor", email: string) => {
    await page.getByText(role, { exact: true }).click({ timeout: 30_000 });
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByPlaceholder(/you@example.com/i).fill(email);
    await page.getByRole("button", { name: /review/i }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /create account/i }).click();
  };

  let propertyId = "";

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
    await signUp(owner, "Homeowner", "owner@example.com");

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
    propertyId = href!.split("/")[2];
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
    ownerPage = owner;
  }, 240_000);

  let ownerPage: Page;

  it("an admin verifies the contractor on /admin, and the job starts counting", async () => {
    // Make the admin's dev key an admin, as deploy.sh's admin list would.
    for (const name of ALL_CANISTERS) {
      const fn = new Map(app.deployment.svcs[name]._fields).get("addAdmin");
      if (!fn) continue;
      const a = app.deployment.actor(name, app.admin);
      await (fn.argTypes.length === 2 ? a.addAdmin(principalOf(ADMIN_SEED), "n") : a.addAdmin(principalOf(ADMIN_SEED)));
    }
    const admin = await person(ADMIN_SEED);
    await admin.goto(`${app.baseUrl}/login`);
    await admin.getByRole("button", { name: /dev login/i }).click();
    await admin.waitForURL(/dashboard/);
    await go(admin, "/admin");
    await admin.getByRole("button", { name: /contractors/i }).first().click({ timeout: 30_000 });
    const row = admin.getByRole("row").filter({ hasText: "Cool Air Services LLC" });
    await row.getByRole("button", { name: /verify/i }).click({ timeout: 30_000 });
    // Verified contractors leave the review queue.
    await expect.poll(() => row.count(), { timeout: 30_000 }).toBe(0);

    const pro = principalOf(CONTRACTOR_SEED);
    expect(ok<any>(await app.deployment.actor("contractor", app.admin).getContractor(pro)).isVerified).toBe(true);

    // The homeowner's timeline no longer holds the job back.
    await go(ownerPage, "/dashboard");
    await go(ownerPage, `/properties/${propertyId}`);
    const timeline = ownerPage.locator("#property-tabs");
    await timeline.getByText(/^verified$/i).waitFor({ timeout: 30_000 });
    await expect.poll(() => timeline.getByText(/contractor not yet verified/i).count(), { timeout: 15_000 }).toBe(0);
    expect(errors).toEqual([]);
  }, 180_000);

  it("a realtor gets reviewed, finds a home taking bids and places a sealed bid", async () => {
    // A homeowner (outside the browser) puts a home up for Bid to List.
    const seller = createIdentity("live-seller");
    ok(await app.deployment.actor("payment", app.admin).adminActivateStripeSubscription(seller.getPrincipal(), { Pro: null }, 12n));
    const home = ok<any>(await app.deployment.actor("property", seller).registerProperty({
      address: "40 Heron Way", city: "Winter Park", state: "FL", zipCode: "32789",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 2100n, tier: { Pro: null },
    }));
    const listDate = BigInt(await app.pic.getTime()) * 1_000_000n + 30n * 86_400n * 1_000_000_000n;
    const request = ok<any>(await app.deployment.actor("listing", seller).createBidRequest(
      home.id, "40 Heron Way", "Winter Park", "Orange", "32789", "seller@example.com",
      [3n], [2n], [2100n], listDate, [450_000_00n], "Corner lot.", { Seven: null },
    ));

    const realtor = await person(REALTOR_SEED);
    await signUp(realtor, "Realtor", "agent@example.com");
    await go(realtor, "/agents/verify");
    await realtor.getByRole("heading", { name: /get verified to bid/i }).waitFor({ timeout: 30_000 });
    await realtor.getByLabel("Full name").fill("Riley Realtor");
    await realtor.getByLabel("Brokerage").fill("Lakeside Realty");
    await realtor.getByLabel("License number").fill("SL3456789");
    await realtor.getByLabel("County").fill("Orange");
    await realtor.getByLabel(/cities served/i).fill("Winter Park, Orlando");
    await realtor.getByLabel("Email").fill("agent@example.com");
    await realtor.getByRole("button", { name: /save details/i }).click();
    await realtor.getByRole("button", { name: /accept fee terms/i }).click({ timeout: 30_000 });
    await realtor.waitForURL(/agents\/browse/, { timeout: 30_000 });

    // HomeGentic reviews the licence (agent.verifyAgent, admin only).
    ok(await app.deployment.actor("agent", app.admin).verifyAgent(principalOf(REALTOR_SEED)));

    // The browse page shows the home masked: city and zip, never the street.
    await go(realtor, "/agents/verify");
    await go(realtor, "/agents/browse");
    await realtor.getByText(/winter park/i).first().waitFor({ timeout: 30_000 });
    await expect(realtor.getByText("40 Heron Way").count()).resolves.toBe(0);
    await realtor.getByRole("button", { name: /bid/i }).first().click();
    await realtor.waitForURL(new RegExp(`/agents/listings/${request.id}/bid`), { timeout: 30_000 });

    await realtor.getByRole("heading", { name: /submit a sealed bid/i }).waitFor({ timeout: 30_000 });
    await realtor.getByLabel("Commission %").fill("2.5");
    await realtor.getByLabel("Suggested list ($)").fill("455000");
    await realtor.getByLabel("CMA summary").fill("Three closed sales within half a mile.");
    await realtor.getByLabel("Marketing plan").fill("Pro photos, open house, MLS.");
    await realtor.locator('label:has(input[type="checkbox"])').first().click();
    await realtor.getByRole("button", { name: /submit sealed bid/i }).click();
    await realtor.waitForURL(/agents\/bids$/, { timeout: 30_000 });
    await realtor.getByText(/1 bids? placed/i).waitFor({ timeout: 30_000 });

    // The listing canister holds exactly that bid. (The seller's own view
    // stays sealed until the window closes; an admin sees it masked.)
    expect(await app.deployment.actor("listing", seller).getProposalsForRequest(request.id)).toEqual([]);
    const list: any[] = await app.deployment.actor("listing", app.admin).getProposalsForRequest(request.id);
    expect(list.map((p) => [Number(p.commissionBps), Number(p.suggestedListCents)])).toEqual([[250, 455_000_00]]);
    expect(errors).toEqual([]);
  }, 240_000);

  it("a new person signs in from a gift link, registers, comes back to it and redeems it", async () => {
    // What the Stripe webhook records for a paid gift.
    const token = "cs_test_LiveGift0001";
    ok(await app.deployment.actor("payment", app.admin).stripeRecordGift(token, { Pro: null }, { Yearly: null }, {
      recipientEmail: "giftee@example.com", recipientName: "Gale", senderName: "Sam", giftMessage: "Enjoy", deliveryDate: "",
    }));

    const giftee = await person(GIFTEE_SEED);
    await giftee.goto(`${app.baseUrl}/gift/redeem?token=${token}`);
    await giftee.getByRole("heading", { name: /you've been given homegentic pro/i }).waitFor({ timeout: 30_000 });
    await giftee.getByRole("button", { name: /sign in to redeem/i }).click();
    await giftee.waitForURL(/\/register/, { timeout: 30_000 });
    await register(giftee, "Homeowner", "giftee@example.com");
    await giftee.waitForURL(new RegExp(`/gift/redeem\\?token=${token}$`), { timeout: 30_000 });
    await giftee.getByRole("button", { name: /redeem gift/i }).click({ timeout: 30_000 });
    await giftee.getByRole("heading", { name: /your gift is active/i }).waitFor({ timeout: 30_000 });

    expect(await app.deployment.actor("payment", app.admin).getTierForPrincipal(principalOf(GIFTEE_SEED))).toEqual({ Pro: null });
    expect(errors).toEqual([]);
  }, 180_000);

  it("a new person signs in from a manager invite, registers, comes back to it and accepts it", async () => {
    const owner = createIdentity("live-manager-owner");
    ok(await app.deployment.actor("payment", app.admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    const home = ok<any>(await app.deployment.actor("property", owner).registerProperty({
      address: "7 Cypress Ct", city: "Orlando", state: "FL", zipCode: "32803",
      propertyType: { SingleFamily: null }, yearBuilt: 2010n, squareFeet: 1600n, tier: { Pro: null },
    }));
    const invite = ok<any>(await app.deployment.actor("property", owner).inviteManager(home.id, { Manager: null }, "Morgan", []));

    const manager = await person(MANAGER_SEED);
    await manager.goto(`${app.baseUrl}/manage/claim/${invite.token}`);
    await manager.getByRole("heading", { name: /invited as a manager/i }).waitFor({ timeout: 30_000 });
    await expect(manager.getByText("7 Cypress Ct").count()).resolves.toBe(1);
    await manager.getByRole("link", { name: /sign in to accept/i }).click();
    await manager.waitForURL(/\/login\?redirect=/, { timeout: 30_000 });
    await manager.getByRole("button", { name: /dev login/i }).click();
    await manager.waitForURL(/\/register/, { timeout: 30_000 });
    await register(manager, "Homeowner", "morgan@example.com");
    await manager.waitForURL(new RegExp(`/manage/claim/${invite.token}$`), { timeout: 30_000 });
    await manager.getByRole("button", { name: /accept manager access/i }).click({ timeout: 30_000 });
    await manager.waitForURL(/\/dashboard/, { timeout: 30_000 });

    expect(await app.deployment.actor("property", app.admin).getAccessRole(home.id, principalOf(MANAGER_SEED))).toEqual([{ Manager: null }]);
    expect(errors).toEqual([]);
  }, 180_000);
});
