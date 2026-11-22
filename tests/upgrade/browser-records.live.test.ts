/**
 * The web app in a real browser against real canisters, nothing mocked (see
 * __helpers__/liveApp.ts), for the record-keeping flows whose rules live in
 * the canisters:
 *
 *  - A report share link opens signed out; with public reports turned off in
 *    Settings → Privacy the same link needs a sign-in; turned back on it opens
 *    again; revoked, it says so (report canister).
 *  - A Free owner adds photos to a job up to the plan's 5 and the 6th is
 *    refused (photo canister reads the tier from payment).
 *  - An admin approves a home's ownership document on /admin (property).
 *  - A contractor turns "Listed in the Directory" and "Show Trust Score" off
 *    and drops out of the homeowner's directory (contractor canister).
 *  - A successor's claim is approved by an admin and, once 30 days have
 *    passed, the successor takes over the record (property canister).
 *
 *  - Bid to List: the seller chooses a bid, the winning agent is asked for the
 *    platform fee and sees nothing of the seller until the Stripe payment is
 *    reported, then sees the address and email (listing + fee canisters).
 *
 *  - An unverified home's report modal doesn't offer a link at all.
 *
 * The manual plan's cases: REPORT-01, PRIV-01, PHOTO-01/02, ONB-05, PRIV-03,
 * SUCC-02, SELL-04 (docs/MANUAL_TEST_PLAN.md).
 *
 * Run: cd tests/upgrade && npx vitest run browser-records.live.test.ts
 * (needs every canister's .dfx/local/canisters/<name>/<name>.wasm, the root
 * npm install, and Playwright's Chromium)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { deflateSync } from "zlib";
import type { Browser, Page } from "playwright";
import { startLiveApp, type LiveApp } from "./__helpers__/liveApp";
import { ALL_CANISTERS } from "./__helpers__/deployAll";
import { go, identityOf, launchChromium, ok, people, principalOf } from "./__helpers__/liveBrowser";

// Dev sign-in derives a fixed key from this byte (window.__e2e_local_seed).
const REPORT_OWNER = 31;
const PHOTO_OWNER = 32;
const VERIFY_OWNER = 33;
const ADMIN = 34;
const CONTRACTOR = 35;
const BROWSING_OWNER = 36;
const LEGACY_OWNER = 37;
const SUCCESSOR = 38;
const SELLER = 39;
const LISTING_AGENT = 40;
const STRIPE_RELAY = 41; // the voice Worker's identity

const DAY_MS = 86_400_000;

/** A 1×1 PNG of one colour: a different image, so a different hash, per colour. */
function png(r: number, g: number, b: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.from([0, r, g, b]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("browser: records, privacy and succession on real canisters", () => {
  let app: LiveApp;
  let browser: Browser;
  const crowd = people(
    () => browser,
    () => app.baseUrl,
  );

  /** A home registered straight on the property canister by the person with this seed. */
  const homeFor = async (seed: number, address: string, tier: "Free" | "Pro") => {
    if (tier === "Pro")
      ok(
        await app.deployment
          .actor("payment", app.admin)
          .adminActivateStripeSubscription(principalOf(seed), { Pro: null }, 12n),
      );
    const home = ok<any>(
      await app.deployment.actor("property", identityOf(seed)).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2001n,
        squareFeet: 1700n,
        tier: { [tier]: null },
      }),
    );
    return home.id as string;
  };

  /** Makes the admin's dev key an admin everywhere, as deploy.sh's admin list would. */
  const makeAdmin = async (seed: number) => {
    for (const name of ALL_CANISTERS) {
      const fn = new Map(app.deployment.svcs[name]._fields).get("addAdmin");
      if (!fn) continue;
      const a = app.deployment.actor(name, app.admin);
      await (fn.argTypes.length === 2 ? a.addAdmin(principalOf(seed), "n") : a.addAdmin(principalOf(seed)));
    }
  };

  let adminPage: Page;
  const admin = async () => {
    if (adminPage) return adminPage;
    await makeAdmin(ADMIN);
    adminPage = await crowd.person(ADMIN);
    await crowd.signIn(adminPage);
    return adminPage;
  };

  beforeAll(async () => {
    app = await startLiveApp();
    browser = await launchChromium();
  }, 300_000);

  afterAll(async () => {
    await crowd.close();
    await browser?.close();
    await app?.stop();
  }, 60_000);

  it("a report link opens signed out, needs a sign-in while public reports are off, and stops when revoked", async () => {
    const propertyId = await homeFor(REPORT_OWNER, "5 Report Row", "Pro");
    const owner = await crowd.person(REPORT_OWNER);
    await crowd.signUp(owner, "Homeowner", "reports@example.com");

    // Unverified: the report canister won't share it, so the modal offers
    // verification instead of a link.
    await go(owner, `/properties/${propertyId}`);
    await owner.getByRole("button", { name: /view full report/i }).click({ timeout: 30_000 });
    await owner.getByRole("link", { name: /verify ownership/i }).waitFor({ timeout: 30_000 });
    await expect(owner.getByRole("button", { name: /generate report link/i }).isDisabled()).resolves.toBe(true);
    await owner.keyboard.press("Escape");

    ok(await app.deployment.actor("property", app.admin).verifyProperty(propertyId, { Basic: null }, ["UtilityBill"]));
    await go(owner, "/dashboard");
    await go(owner, `/properties/${propertyId}`);
    await owner.getByRole("button", { name: /view full report/i }).click({ timeout: 30_000 });
    await owner.getByRole("button", { name: /generate report link/i }).click({ timeout: 30_000 });

    const listLinks = (): Promise<any[]> =>
      app.deployment.actor("report", identityOf(REPORT_OWNER)).listShareLinks(propertyId);
    await expect.poll(async () => (await listLinks()).length, { timeout: 30_000 }).toBe(1);
    const links = await listLinks();

    const reportUrl = `${app.baseUrl}/report/${links[0].token}`;

    // A buyer who isn't signed in sees the report.
    const buyer = await crowd.guest();
    await buyer.goto(reportUrl);
    await buyer.getByText("Property History Report").waitFor({ timeout: 30_000 });
    await expect(buyer.getByText("5 Report Row", { exact: false }).count()).resolves.toBeGreaterThan(0);

    // Public reports off: the switch saves at once, and the link already
    // shared now needs a sign-in.
    await owner.keyboard.press("Escape");
    await go(owner, "/settings");
    await owner.getByRole("button", { name: /privacy/i }).click({ timeout: 30_000 });
    const sw = owner.getByRole("switch", { name: "Public HomeGentic Report" });
    await expect.poll(() => sw.getAttribute("aria-checked"), { timeout: 30_000 }).toBe("true");
    await sw.click();
    await expect
      .poll(() => app.deployment.actor("report", identityOf(REPORT_OWNER)).getAllowPublicReports(), {
        timeout: 30_000,
      })
      .toBe(false);
    await buyer.reload();
    await buyer.getByText("Sign in to view this report").waitFor({ timeout: 30_000 });
    await expect(buyer.getByText("5 Report Row", { exact: false }).count()).resolves.toBe(0);

    // Back on: the same link opens signed out again.
    await sw.click();
    await expect
      .poll(() => app.deployment.actor("report", identityOf(REPORT_OWNER)).getAllowPublicReports(), {
        timeout: 30_000,
      })
      .toBe(true);
    await buyer.reload();
    await buyer.getByText("Property History Report").waitFor({ timeout: 30_000 });

    // Revoked: the link says so, in a fresh browser too.
    await go(owner, `/properties/${propertyId}`);
    await owner.getByRole("button", { name: /view full report/i }).click({ timeout: 30_000 });
    await owner.getByTitle("Revoke link").click({ timeout: 30_000 });
    await owner.getByText("Link revoked").waitFor({ timeout: 30_000 });
    await buyer.reload();
    await buyer.getByText("Report link revoked").waitFor({ timeout: 30_000 });
    const another = await crowd.guest();
    await another.goto(reportUrl);
    await another.getByText("Report link revoked").waitFor({ timeout: 30_000 });

    expect(crowd.errors).toEqual([]);
  }, 240_000);

  it("a Free owner adds photos to a job up to the plan's 5, and the 6th is refused", async () => {
    const propertyId = await homeFor(PHOTO_OWNER, "6 Snapshot St", "Free");
    const owner = await crowd.person(PHOTO_OWNER);
    await crowd.signUp(owner, "Homeowner", "photos@example.com");

    await go(owner, "/jobs/new");
    await owner.getByLabel("Service Type *").selectOption("Plumbing", { timeout: 30_000 });
    await owner.getByLabel(/contractor \/ company name/i).fill("Pipe Pros LLC");
    await owner.getByLabel(/amount paid/i).fill("650");
    await owner.getByLabel(/date completed/i).fill("2026-10-02");
    await owner.getByLabel(/description/i).fill("Replaced the kitchen shut-off valve.");
    await owner.getByRole("button", { name: /log job to blockchain/i }).click();
    await owner.getByText(/hasn't countersigned/).waitFor({ timeout: 30_000 });
    const jobs = await app.deployment.actor("job", identityOf(PHOTO_OWNER)).getJobsForProperty(propertyId);
    const [job] = "ok" in jobs ? jobs.ok : jobs;

    await go(owner, `/properties/${propertyId}`);
    const input = owner.locator('input[type="file"][accept="image/*"]').first();
    await input.waitFor({ state: "attached", timeout: 30_000 });
    const thumbs = owner.locator("#property-tabs img");
    for (let i = 0; i < 5; i++) {
      await input.setInputFiles({ name: `job-${i}.png`, mimeType: "image/png", buffer: png(40 * i, 90, 200 - 30 * i) });
      await expect.poll(() => thumbs.count(), { timeout: 30_000 }).toBe(i + 1);
    }

    await input.setInputFiles({ name: "job-6.png", mimeType: "image/png", buffer: png(250, 10, 10) });
    await owner.getByText(/job photo limit \(5\) reached for your plan/i).waitFor({ timeout: 30_000 });
    await expect(thumbs.count()).resolves.toBe(5);

    const stored: any[] = await app.deployment.actor("photo", identityOf(PHOTO_OWNER)).getPhotosByJob(job.id);
    expect(stored).toHaveLength(5);
    expect(crowd.errors).toEqual([]);
  }, 240_000);

  it("an admin approves a home's ownership document on /admin", async () => {
    const propertyId = await homeFor(VERIFY_OWNER, "7 Deed Drive", "Free");
    ok(
      await app.deployment
        .actor("property", identityOf(VERIFY_OWNER))
        .submitVerification(propertyId, "UtilityBill", "sha256-utility-bill-7", ["Val Owner"]),
    );

    const page = await admin();
    await go(page, "/admin");
    await page
      .getByRole("button", { name: /verifications/i })
      .first()
      .click({ timeout: 30_000 });
    const card = page
      .locator("div")
      .filter({ hasText: "7 Deed Drive" })
      .filter({ has: page.getByRole("button", { name: /approve/i }) })
      .last();
    await card.getByRole("button", { name: /approve/i }).click({ timeout: 30_000 });
    await expect.poll(() => page.getByText("7 Deed Drive").count(), { timeout: 30_000 }).toBe(0);

    const home = ok<any>(await app.deployment.actor("property", identityOf(VERIFY_OWNER)).getProperty(propertyId));
    expect(home.verificationLevel).toEqual({ Basic: null });
    expect(crowd.errors).toEqual([]);
  }, 180_000);

  it("a contractor who turns off 'Listed in the Directory' drops out of the homeowner's directory", async () => {
    ok(
      await app.deployment.actor("contractor", identityOf(CONTRACTOR)).register({
        name: "Hidden Hammer LLC",
        specialties: [{ Roofing: null }],
        email: "hammer@example.com",
        phone: "+14075550123",
      }),
    );
    const pro = await crowd.person(CONTRACTOR);
    await crowd.signUp(pro, "Contractor", "hammer@example.com");

    await homeFor(BROWSING_OWNER, "8 Browse Blvd", "Free");
    const owner = await crowd.person(BROWSING_OWNER);
    await crowd.signUp(owner, "Homeowner", "browse@example.com");
    await go(owner, "/contractors");
    await owner.getByText("Hidden Hammer LLC").first().waitFor({ timeout: 30_000 });

    await go(pro, "/settings");
    await pro.getByRole("button", { name: /privacy/i }).click({ timeout: 30_000 });
    const listed = pro.getByRole("switch", { name: "Listed in the Directory" });
    const score = pro.getByRole("switch", { name: "Show Trust Score" });
    await expect.poll(() => listed.getAttribute("aria-checked"), { timeout: 30_000 }).toBe("true");
    await score.click();
    await listed.click();
    await expect
      .poll(
        async () => {
          const p = await app.deployment.actor("contractor", identityOf(CONTRACTOR)).getMyProfilePrivacy();
          return [p.listed, p.showTrustScore];
        },
        { timeout: 30_000 },
      )
      .toEqual([false, false]);

    // The directory leaves the contractor out; the canister agrees.
    await go(owner, "/dashboard");
    await go(owner, "/contractors");
    await owner.getByRole("heading", { name: /find a contractor/i }).waitFor({ timeout: 30_000 });
    await expect.poll(() => owner.getByText("Hidden Hammer LLC").count(), { timeout: 15_000 }).toBe(0);
    const all: any[] = await app.deployment.actor("contractor", identityOf(BROWSING_OWNER)).getAll();
    expect(all.map((c) => c.name)).not.toContain("Hidden Hammer LLC");
    expect(crowd.errors).toEqual([]);
  }, 240_000);

  it("a successor's claim is approved and, after the 30-day wait, takes over the record", async () => {
    const propertyId = await homeFor(LEGACY_OWNER, "9 Legacy Lane", "Pro");
    const owner = await crowd.person(LEGACY_OWNER);
    await crowd.signUp(owner, "Homeowner", "legacy@example.com");

    // The owner names a successor and gets the link to hand over.
    await go(owner, `/properties/${propertyId}/successor`);
    await owner.getByLabel("Name", { exact: true }).fill("Jordan Heir", { timeout: 30_000 });
    await owner.getByLabel("Email", { exact: true }).fill("jordan@example.com");
    await owner.getByLabel(/relationship/i).fill("Son");
    await owner.getByRole("button", { name: "Save successor" }).click();
    const linkBox = owner.getByLabel("Successor link");
    await expect.poll(() => linkBox.inputValue(), { timeout: 30_000 }).toMatch(/\/successor\/[^/]+$/);
    const successorUrl = await linkBox.inputValue();

    // The successor opens it signed out, signs up, comes back and sends a claim.
    const heir = await crowd.person(SUCCESSOR);
    await heir.goto(successorUrl);
    await heir.getByRole("link", { name: /sign in to continue/i }).click({ timeout: 30_000 });
    await heir.waitForURL(/\/login\?redirect=/, { timeout: 30_000 });
    await heir.getByRole("button", { name: /dev login/i }).click();
    await heir.waitForURL(/\/register/, { timeout: 30_000 });
    await crowd.register(heir, "Homeowner", "jordan@example.com");
    await heir.waitForURL(/\/successor\//, { timeout: 30_000 });
    await heir.getByLabel("Your full name").fill("Jordan Heir", { timeout: 30_000 });
    await heir.getByLabel("Document type").selectOption("LettersOfAdministration");
    await heir.getByLabel("Document", { exact: true }).setInputFiles({
      name: "letters.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF"),
    });
    await heir.getByRole("button", { name: "Send claim" }).click();
    await heir.waitForURL(/\/successor-claims$/, { timeout: 30_000 });
    await heir.getByText(/waiting for homegentic to review the document/i).waitFor({ timeout: 30_000 });

    // HomeGentic reviews the document on /admin.
    const page = await admin();
    await go(page, "/admin");
    await page.getByRole("button", { name: /successor claims/i }).click({ timeout: 30_000 });
    await page.getByText("9 Legacy Lane").waitFor({ timeout: 30_000 });
    await page.getByRole("button", { name: /^approve$/i }).click();
    await expect.poll(() => page.getByText("9 Legacy Lane").count(), { timeout: 30_000 }).toBe(0);

    // Approved, but the 30 days haven't passed: no take-over yet.
    await go(heir, "/dashboard");
    await go(heir, "/successor-claims");
    await heir.getByText(/you can take over the record on or after/i).waitFor({ timeout: 30_000 });
    await expect(heir.getByRole("button", { name: /take over the record/i }).count()).resolves.toBe(0);
    expect(await app.deployment.actor("property", app.admin).getPropertyOwner(propertyId)).toEqual([
      principalOf(LEGACY_OWNER),
    ]);

    // 31 days later, on the canisters' clock and the successor's.
    await app.pic.advanceTime(31 * DAY_MS);
    await app.pic.tick();
    await heir.clock.setSystemTime(Date.now() + 31 * DAY_MS);
    await go(heir, "/dashboard");
    await go(heir, "/successor-claims");
    await heir.getByRole("button", { name: /take over the record/i }).click({ timeout: 30_000 });
    await expect
      .poll(() => app.deployment.actor("property", app.admin).getPropertyOwner(propertyId), { timeout: 30_000 })
      .toEqual([principalOf(SUCCESSOR)]);

    // The previous household no longer has the home.
    const mine: any[] = await app.deployment.actor("property", identityOf(LEGACY_OWNER)).getMyProperties();
    expect(mine.map((p) => p.id)).not.toContain(propertyId);
    expect(crowd.errors).toEqual([]);
  }, 300_000);

  it("Bid to List: the agent pays the platform fee before seeing the seller", async () => {
    // The home exists before sign-up, so the first-home wizard doesn't open over the page.
    const propertyId = await homeFor(SELLER, "12 Auction Avenue", "Free");
    // Earlier tests moved the canisters' clock ahead; the browsers follow it.
    const seller = await crowd.person(SELLER);
    const agentPage = await crowd.person(LISTING_AGENT);
    for (const p of [seller, agentPage]) await p.clock.setSystemTime(await app.pic.getTime());
    await crowd.signUp(seller, "Homeowner", "seller@example.com");
    await crowd.signUp(agentPage, "Realtor", "lena@example.com");

    const sellerId = identityOf(SELLER);
    const agentId = identityOf(LISTING_AGENT);
    const nowNs = BigInt(await app.pic.getTime()) * 1_000_000n;
    const request = ok<any>(
      await app.deployment
        .actor("listing", sellerId)
        .createBidRequest(
          propertyId,
          "12 Auction Avenue",
          "Orlando",
          "Orange",
          "32801",
          "seller@example.com",
          [3n],
          [2n],
          [1700n],
          nowNs + 30n * BigInt(DAY_MS) * 1_000_000n,
          [],
          "",
          { Seven: null },
        ),
    );
    ok(
      await app.deployment.actor("agent", agentId).register({
        name: "Lena Lister",
        brokerage: "Gulf Realty",
        licenseNumber: "BK3301234",
        licenseState: "FL",
        county: "Orange",
        serviceCities: ["orlando"],
        bio: "",
        phone: "+14075550111",
        email: "lena@example.com",
      }),
    );
    ok(await app.deployment.actor("agent", app.admin).verifyAgent(principalOf(LISTING_AGENT)));
    const bid = ok<any>(
      await app.deployment
        .actor("listing", agentId)
        .submitProposal(
          request.id,
          250n,
          465_000_00n,
          "Recent sales support this.",
          "Open houses",
          ["Pro photos"],
          21n,
          [],
          0n,
          "Hello",
        ),
    );

    // The 7-day window closes, on the canisters' clock and the browsers'.
    await app.pic.advanceTime(8 * DAY_MS);
    await app.pic.tick();
    // A fresh sign-in after the jump, so neither app keeps an old clock offset.
    for (const p of [seller, agentPage]) {
      await p.clock.setSystemTime(await app.pic.getTime());
      await crowd.signIn(p);
    }

    // The seller shortlists and chooses the bid.
    await go(seller, `/listing/${request.id}`);
    await seller.getByRole("button", { name: "Shortlist" }).click({ timeout: 30_000 });
    await seller.getByRole("button", { name: "Choose" }).click();
    await seller.getByRole("checkbox").check();
    await seller.getByRole("button", { name: /choose bid a and unmask/i }).click();
    await expect
      .poll(async () => (await app.deployment.actor("fee", app.admin).getFeeForRequest(request.id))[0]?.proposalId, {
        timeout: 30_000,
      })
      .toBe(bid.id);
    const [fee] = await app.deployment.actor("fee", app.admin).getFeeForRequest(request.id);

    // The agent is asked to pay, and sees nothing of the seller yet.
    await go(agentPage, "/agents/bids");
    await agentPage.getByText("CHOSEN").waitFor({ timeout: 30_000 });
    await agentPage.getByRole("link", { name: "Pay fee" }).click();
    await agentPage.getByText(/the seller chose your bid\. pay the \$399 platform fee/i).waitFor({ timeout: 30_000 });
    await agentPage.getByRole("button", { name: "Pay $399 by card" }).waitFor();
    expect(await agentPage.getByText("12 Auction Avenue").count()).toBe(0);
    expect(ok<any>(await app.deployment.actor("listing", agentId).getBidRequest(request.id)).address).toBe("");

    // Stripe reports the settled payment through the Worker (its webhook's call).
    ok(await app.deployment.actor("fee", app.admin).addReferralRelay(principalOf(STRIPE_RELAY)));
    ok(await app.deployment.actor("fee", identityOf(STRIPE_RELAY)).relayMarkPlatformFeePaid(fee.id, bid.id));

    // Back from Stripe, the agent's page picks up the release.
    await go(agentPage, `/agents/bids/${bid.id}?fee_paid=1`);
    await agentPage.getByText("12 Auction Avenue").waitFor({ timeout: 30_000 });
    await agentPage.getByText("seller@example.com").waitFor();
    await agentPage.getByText(/your \$399 platform fee is paid/i).waitFor();

    // And the seller sees who they chose.
    await go(seller, "/dashboard");
    await go(seller, `/listing/${request.id}`);
    await seller.getByText(/payment cleared/i).waitFor({ timeout: 30_000 });
    await seller.getByText("Lena Lister").first().waitFor();
    expect(crowd.errors).toEqual([]);
  }, 300_000);
});
