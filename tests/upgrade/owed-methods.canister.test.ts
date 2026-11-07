/**
 * The methods the method-inventory gate found with no real-canister test at
 * all (test-gap audit 2026-11-03, M6 leftovers). Each is checked for who may
 * call it and what it returns.
 *
 *  OWE.1  auth.getNotificationContact: notifiers and admins only; null for an
 *         unknown principal
 *  OWE.2  setAuditCanisterId on auth, property, payment, photo, report:
 *         admin only
 *  OWE.3  ai_proxy's retired email and key methods refuse, admin-only ones
 *         refuse strangers first; setOutcallBudgets is admin only;
 *         transformResponse drops the headers
 *  OWE.4  property: address and year built by id, verify status for the
 *         owner only, pending invites for the owner only, managed properties
 *         for the manager
 *  OWE.5  contractor: getByZip, getContractorStats, getCredentials
 *  OWE.6  quote: getOpenRequestsForMe shows an open request to a
 *         non-contractor; getRevealedBids is empty before any reveal
 *  OWE.7  payment.getAllPricing matches the published tiers
 *  OWE.8  photo: getPhotosByPhase filters by phase, getPhotosByRoom reads the
 *         room's photos, and strangers see neither
 *  OWE.9  monitoring: tracked-canister registry, cycle threshold and checks,
 *         frontend error stats, product metrics
 *  OWE.10 market.getNeighborhoodPublicKey returns a key
 *  OWE.11 report: score and attestation by share token, risk profile by token
 *  OWE.12 listing: comps median, panoramas, bid progress, cancelBidRequest,
 *         getReviewEligibility
 *  OWE.13 agent.getProfilesByCounty
 *  OWE.14 bills.getUsageTrend
 *  OWE.15 recurring.attachContractDoc
 *  OWE.16 audit.setTrustedCanisterName
 *  OWE.17 referrals (retired, admin-only through inspect)
 *
 * Run: cd tests/upgrade && npx vitest run owed-methods.canister.test.ts
 * (needs .dfx/local/canisters/<all>/<name>.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, SubnetStateType, createIdentity } from "@dfinity/pic";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic } from "./__helpers__/setup";
import { deployAll, type Deployment, type CanisterName } from "./__helpers__/deployAll";

type R<T> = { ok: T } | { err: unknown };
const ok = <T = any>(r: R<T>): T => {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
};
const errOf = (r: R<unknown>) =>
  "err" in r ? (typeof r.err === "object" && r.err ? Object.keys(r.err)[0] : String(r.err)) : "ok";
const DAY_NS = 86_400_000_000_000n;

describe("methods the inventory gate found untested", () => {
  let pic: PocketIc;
  let d: Deployment;
  let n = 0;
  const admin = createIdentity("owe-admin");
  const stranger = createIdentity("owe-stranger");
  const as = (name: CanisterName, who: Identity) => d.actor(name, who);

  async function proUser(tag: string): Promise<Identity> {
    const u = createIdentity(`owe-${tag}-${++n}`);
    ok(await as("payment", admin).grantSubscription(u.getPrincipal(), { Pro: null }));
    return u;
  }
  async function home(owner: Identity, yearBuilt = 1998n): Promise<string> {
    return ok<any>(
      await as("property", owner).registerProperty({
        address: `${++n} Owed Street`,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt,
        squareFeet: 1850n,
        tier: { Pro: null },
      }),
    ).id;
  }

  beforeAll(async () => {
    // The II subnet provides test_key_1 for market's vetKD key (OWE.10).
    pic = await createPic({
      ii: { state: { type: SubnetStateType.New } },
      application: [{ state: { type: SubnetStateType.New } }],
    });
    d = await deployAll(pic, admin);
  });
  afterAll(async () => {
    await pic?.tearDown();
  });

  it("OWE.1 getNotificationContact is for notifiers and admins", async () => {
    const u = createIdentity(`owe-contact-${++n}`);
    ok(await as("auth", u).register({ role: { Homeowner: null }, email: "pat@example.com", phone: "" }));
    expect(errOf(await as("auth", stranger).getNotificationContact(u.getPrincipal()))).toBe("NotAuthorized");
    expect(ok(await as("auth", admin).getNotificationContact(u.getPrincipal()))).toEqual([
      { email: "pat@example.com" },
    ]);
    expect(ok(await as("auth", admin).getNotificationContact(stranger.getPrincipal()))).toEqual([]);
    const notifier = createIdentity("owe-notifier");
    ok(await as("auth", admin).addNotifier(notifier.getPrincipal()));
    expect(ok(await as("auth", notifier).getNotificationContact(u.getPrincipal()))).toEqual([
      { email: "pat@example.com" },
    ]);
  });

  it.each(["auth", "property", "payment", "photo", "report"] as CanisterName[])(
    "OWE.2 %s.setAuditCanisterId is admin only",
    async (c) => {
      expect(errOf(await as(c, stranger).setAuditCanisterId(stranger.getPrincipal()))).toBe("NotAuthorized");
      ok(await as(c, admin).setAuditCanisterId(d.ids.audit));
    },
  );

  it("OWE.3 ai_proxy's retired methods refuse; admin-only ones refuse strangers first", async () => {
    const ai = (who: Identity) => as("ai_proxy", who);
    expect(errOf(await ai(stranger).sendInviteEmail("a@example.com", [], "1 Main", "Roofing", [], "https://x"))).toBe(
      "HttpError",
    );
    expect(errOf(await ai(stranger).sendJobMatchEmail("a@example.com", "JOB_1", "Roofing", "32801"))).toBe("HttpError");
    for (const m of ["setAttomApiKey", "setOpenPermitApiKey"]) {
      expect(errOf(await ai(stranger)[m]("k"))).toBe("NotAuthorized");
      expect(errOf(await ai(admin)[m]("k"))).toBe("InvalidInput");
    }
    expect(errOf(await ai(stranger).setOutcallBudgets(5n, 5n))).toBe("NotAuthorized");
    ok(await ai(admin).setOutcallBudgets(5n, 5n));

    const body = new Uint8Array([104, 105]);
    const out = await ai(stranger).transformResponse({
      response: { status: 200n, headers: [{ name: "date", value: "now" }], body },
      context: new Uint8Array(),
    });
    expect(out.status).toBe(200n);
    expect(out.headers).toEqual([]);
    expect(Array.from(out.body as Uint8Array)).toEqual([104, 105]);
  });

  it("OWE.4 property lookups, verify status, invites and managed properties", async () => {
    const owner = await proUser("prop");
    const pid = await home(owner, 1987n);
    const p = (who: Identity) => as("property", who);

    expect(await p(stranger).getPropertyYearBuilt(pid)).toEqual([1987n]);
    expect(await p(stranger).getPropertyYearBuilt("NOPE")).toEqual([]);
    expect((await p(stranger).getPropertyAddress(pid))[0]).toMatch(/Owed Street, Orlando, FL 32801$/);
    expect(await p(stranger).getPropertyAddress("NOPE")).toEqual([]);

    expect(ok(await p(owner).getVerifyStatus(pid)).propertyId).toBe(pid);
    expect(errOf(await p(stranger).getVerifyStatus(pid))).toBe("NotAuthorized");
    expect(errOf(await p(owner).getVerifyStatus("NOPE"))).toBe("NotFound");

    const invite = ok<any>(await p(owner).inviteManager(pid, { Manager: null }, "Morgan", []));
    const pending = ok<any[]>(await p(owner).getPendingInvitesForProperty(pid));
    expect(pending.map((i) => i.token)).toContain(invite.token);
    expect(errOf(await p(stranger).getPendingInvitesForProperty(pid))).toBe("NotAuthorized");

    const manager = createIdentity(`owe-mgr-${++n}`);
    expect(await p(manager).getMyManagedProperties()).toEqual([]);
    ok(await p(manager).claimManagerRole(invite.token));
    const managed = await p(manager).getMyManagedProperties();
    expect(managed.map((m: any) => [m.property.id, Object.keys(m.role)[0]])).toEqual([[pid, "Manager"]]);
    expect(await p(stranger).getMyManagedProperties()).toEqual([]);
  });

  it("OWE.5 contractor zip search, stats and credentials", async () => {
    const pro = createIdentity(`owe-contractor-${++n}`);
    const c = (who: Identity) => as("contractor", who);
    ok(
      await c(pro).register({
        name: "Zip Roofing",
        specialties: [{ Roofing: null }],
        email: "z@example.com",
        phone: "+14075550100",
      }),
    );
    ok(
      await c(pro).updateProfile({
        name: "Zip Roofing",
        specialties: [{ Roofing: null }],
        email: "z@example.com",
        phone: "+14075550100",
        bio: [],
        licenseNumber: [],
        serviceArea: [],
        serviceZips: ["32801"],
      }),
    );
    const ids = (ps: any[]) => ps.map((x) => x.id.toText());
    expect(ids(await c(admin).getByZip("32801"))).toContain(pro.getPrincipal().toText());
    expect(ids(await c(admin).getByZip("99999"))).not.toContain(pro.getPrincipal().toText());

    const stats = (await c(stranger).getContractorStats(pro.getPrincipal()))[0];
    expect(stats.serviceZips).toEqual(["32801"]);
    expect(stats.jobsCompleted).toBe(0n);
    expect(await c(stranger).getContractorStats(stranger.getPrincipal())).toEqual([]);

    expect(await c(stranger).getCredentials(pro.getPrincipal())).toEqual([]);
    expect(
      errOf(await c(stranger).recordJobVerified(pro.getPrincipal(), "JOB_X", "Roofing", stranger.getPrincipal())),
    ).toBe("NotAuthorized");
    ok(await c(admin).recordJobVerified(pro.getPrincipal(), "JOB_X", "Roofing", stranger.getPrincipal()));
    const creds = await c(stranger).getCredentials(pro.getPrincipal());
    expect(creds.map((x: any) => x.jobId)).toEqual(["JOB_X"]);
    expect((await c(stranger).getContractorStats(pro.getPrincipal()))[0].jobsCompleted).toBe(1n);
    expect(await c(stranger).getCredentials(admin.getPrincipal())).toEqual([]);
  });

  it("OWE.6 quote: open requests for a non-contractor, no revealed bids yet", async () => {
    const owner = await proUser("quote");
    const pid = await home(owner);
    const req = ok<any>(
      await as("quote", owner).createQuoteRequest(
        pid,
        { Roofing: null },
        "Roof leak",
        { High: null },
        ["32801"],
        [],
        [],
        [],
        [],
      ),
    );
    const viewer = createIdentity(`owe-viewer-${++n}`);
    const open = await as("quote", viewer).getOpenRequestsForMe();
    expect(open.map((r: any) => r.id)).toContain(req.id);
    expect(await as("quote", owner).getRevealedBids(req.id)).toEqual([]);
    expect(await as("quote", stranger).getRevealedBids("NOPE")).toEqual([]);
  });

  it("OWE.7 getAllPricing matches the published tiers", async () => {
    const rows = await as("payment", stranger).getAllPricing();
    const byTier = Object.fromEntries(rows.map((r: any) => [Object.keys(r.tier)[0], r]));
    expect(byTier.Pro).toMatchObject({ priceUSD: 59n, periodDays: 365n, propertyLimit: 20n, photosPerJob: 30n });
    expect(byTier.ContractorPro).toMatchObject({ priceUSD: 40n, periodDays: 30n, photosPerJob: 50n });
    expect(byTier.ContractorFree).toMatchObject({ priceUSD: 0n, photosPerJob: 5n });
  });

  it("OWE.8 photos by phase and by room", async () => {
    const owner = await proUser("photo");
    const pid = await home(owner);
    const ph = (who: Identity) => as("photo", who);
    const up = async (jobId: string, phase: object) => {
      const bytes = new Uint8Array([1, 2, 3, ++n]);
      return ok<any>(await ph(owner).uploadPhoto(jobId, pid, phase, "", n.toString(16).padStart(64, "0"), bytes)).id;
    };
    const framing = await up("JOB_P", { Framing: null });
    const finishing = await up("JOB_P", { Finishing: null });
    const room = await up("ROOM_kitchen", { Finishing: null });

    const ids = (ps: any[]) => ps.map((x) => x.id);
    expect(ids(await ph(owner).getPhotosByPhase("JOB_P", { Framing: null }))).toEqual([framing]);
    expect(ids(await ph(owner).getPhotosByPhase("JOB_P", { Finishing: null }))).toEqual([finishing]);
    expect(ids(await ph(owner).getPhotosByRoom("kitchen"))).toEqual([room]);
    expect(await ph(stranger).getPhotosByPhase("JOB_P", { Framing: null })).toEqual([]);
    expect(await ph(stranger).getPhotosByRoom("kitchen")).toEqual([]);
  });

  it("OWE.9 monitoring registry, cycle checks, error stats and product metrics", async () => {
    const m = (who: Identity) => as("monitoring", who);
    const target = d.ids.job;
    expect(errOf(await m(stranger).registerCanister(target, "job"))).toBe("NotAuthorized");
    expect(errOf(await m(admin).registerCanister(target, ""))).toBe("InvalidInput");
    ok(await m(admin).registerCanister(target, "job"));
    ok(await m(admin).registerCanister(target, "job (renamed)"));
    const tracked = await m(admin).getTrackedCanisters();
    expect(tracked.filter((t: any) => t.id.toText() === target.toText()).map((t: any) => t.name)).toEqual([
      "job (renamed)",
    ]);
    expect(await m(stranger).getTrackedCanisters()).toEqual([]);

    expect(errOf(await m(stranger).setLowCycleThreshold(1n))).toBe("NotAuthorized");
    ok(await m(admin).setLowCycleThreshold(1_000_000_000_000n));
    expect(await m(stranger).checkCycleLevels()).toEqual([]);
    const levels = await m(admin).checkCycleLevels();
    expect(levels.map((l: any) => l.id.toText())).toContain(target.toText());

    expect(errOf(await m(stranger).unregisterCanister(target))).toBe("NotAuthorized");
    ok(await m(admin).unregisterCanister(target));
    expect((await m(admin).getTrackedCanisters()).map((t: any) => t.id.toText())).not.toContain(target.toText());

    expect(await m(stranger).getFrontendErrorStats()).toEqual({ total: 0n, unresolved: 0n, topFingerprints: [] });
    expect(typeof (await m(admin).getFrontendErrorStats()).total).toBe("bigint");

    expect(errOf(await m(stranger).getProductMetrics())).not.toBe("ok");
    const ids = [d.ids.property, d.ids.job, d.ids.quote, d.ids.payment].map((p) => p.toText());
    expect(errOf(await m(stranger).setProductCanisterIds(...ids))).toBe("NotAuthorized");
    ok(await m(admin).setProductCanisterIds(...ids));
    const metrics = ok<any>(await m(admin).getProductMetrics());
    expect(typeof metrics).toBe("object");
  });

  it("OWE.10 getNeighborhoodPublicKey returns the score key", async () => {
    const key = await as("market", stranger).getNeighborhoodPublicKey();
    expect((key as Uint8Array).length).toBeGreaterThan(0);
    expect(Array.from(await as("market", stranger).getNeighborhoodPublicKey())).toEqual(Array.from(key));
  });

  it("OWE.11 report score and attestation by share token; risk profile by token", async () => {
    const owner = await proUser("report");
    const pid = await home(owner);
    ok(await as("property", admin).verifyProperty(pid, { Basic: null }, []));
    // market scores only a property with job history.
    ok(
      await as("job", owner).createJob(
        pid,
        "Water heater",
        { Plumbing: null },
        "Replaced it.",
        [],
        0n,
        0n,
        [],
        [],
        true,
        [],
      ),
    );
    const r = (who: Identity) => as("report", who);
    const link = ok<any>(
      await r(owner).generateReport(
        pid,
        {
          address: "ignored",
          city: "",
          state: "",
          zipCode: "",
          propertyType: "",
          yearBuilt: 0n,
          squareFeet: 0n,
          verificationLevel: "Basic",
        },
        [],
        [],
        [],
        { Public: null },
        [],
        [],
        [],
        [],
        [],
        [],
      ),
    );
    const score = await r(stranger).getReportScore(link.token);
    expect(score.length).toBe(1);
    expect(await r(stranger).getReportScore("NOPE")).toEqual([]);
    const att = await r(stranger).getReportAttestation(link.token);
    expect(att.length).toBe(1);
    expect(att[0].signature.length).toBe(64);
    expect(JSON.parse(att[0].message).propertyId).toBe(pid);
    expect(await r(stranger).getReportAttestation("NOPE")).toEqual([]);

    expect(errOf(await r(stranger).getRiskProfile("NOPE"))).toBe("NotFound");
    const risk = ok<any>(await r(owner).generateRiskProfile(pid, [7n], "Basic"));
    expect(ok<any>(await r(stranger).getRiskProfile(risk.token)).propertyId).toBe(pid);
    await pic.advanceTime(8 * 24 * 3_600_000);
    await pic.tick();
    expect(errOf(await r(stranger).getRiskProfile(risk.token))).toBe("Expired");
  });

  it("OWE.12 listing comps, panoramas, bid progress, cancel and review eligibility", async () => {
    const l = (who: Identity) => as("listing", who);
    expect(errOf(await l(stranger).setCompsMedian("32801", 400_000_00n, 12n))).toBe("NotAuthorized");
    ok(await l(admin).setCompsMedian("32801", 400_000_00n, 12n));
    expect(await l(stranger).getCompsMedian("32801")).toEqual([{ medianCents: 400_000_00n, saleCount: 12n }]);
    expect(await l(stranger).getCompsMedian("00000")).toEqual([]);

    const owner = await proUser("listing");
    const pid = await home(owner);
    const listingPhoto = async () =>
      ok<any>(
        await as("photo", owner).uploadPhoto(
          `LISTING_${pid}`,
          pid,
          { Listing: null },
          "",
          (++n).toString(16).padStart(64, "0"),
          new Uint8Array([4, 5, n]),
        ),
      ).id;
    ok(await l(owner).addPanorama(pid, "Kitchen", await listingPhoto()));
    ok(await l(owner).addPanorama(pid, "Den", await listingPhoto()));
    expect((await l(stranger).getPanoramas(pid)).map((e: any) => e.roomLabel).sort()).toEqual(["Den", "Kitchen"]);
    expect(errOf(await l(stranger).removePanorama(pid, "Den"))).toBe("NotAuthorized");
    expect(errOf(await l(owner).removePanorama(pid, "Attic"))).toBe("NotFound");
    ok(await l(owner).removePanorama(pid, "Den"));
    expect((await l(stranger).getPanoramas(pid)).map((e: any) => e.roomLabel)).toEqual(["Kitchen"]);

    const deadline = BigInt(Date.now()) * 1_000_000n + 30n * DAY_NS;
    const req = ok<any>(
      await l(owner).createBidRequest(
        pid,
        "5 Bay Street",
        "Orlando",
        "Orange",
        "32801",
        "o@example.com",
        [3n],
        [2n],
        [1800n],
        deadline,
        [],
        "",
        { Seven: null },
      ),
    );
    expect(ok(await l(owner).getBidProgress(req.id))).toEqual({ count: 0n, sealed: true });
    expect(errOf(await l(stranger).getBidProgress(req.id))).toBe("NotAuthorized");
    expect(errOf(await l(owner).getBidProgress("NOPE"))).toBe("NotFound");

    expect(await l(stranger).getReviewEligibility("NOPE")).toEqual([]);
    expect(await l(admin).getReviewEligibility("NOPE")).toEqual([]);

    expect(errOf(await l(stranger).cancelBidRequest(req.id))).toBe("NotAuthorized");
    ok(await l(owner).cancelBidRequest(req.id));
    expect(errOf(await l(owner).cancelBidRequest(req.id))).toBe("AlreadyCancelled");
    expect(errOf(await l(owner).cancelBidRequest("NOPE"))).toBe("NotFound");
  });

  it("OWE.13 getProfilesByCounty lists that county's agents", async () => {
    const agent = createIdentity(`owe-agent-${++n}`);
    ok(
      await as("agent", agent).register({
        name: "Cora County",
        brokerage: "Sunshine Realty",
        licenseNumber: "BK9001",
        licenseState: "FL",
        county: "Seminole",
        serviceCities: ["sanford"],
        bio: "",
        phone: "+14075550100",
        email: "cora@example.com",
      }),
    );
    const ids = (ps: any[]) => ps.map((p) => p.id.toText());
    expect(ids(await as("agent", stranger).getProfilesByCounty("Seminole"))).toContain(agent.getPrincipal().toText());
    expect(ids(await as("agent", stranger).getProfilesByCounty("Volusia"))).not.toContain(
      agent.getPrincipal().toText(),
    );
  });

  it("OWE.14 getUsageTrend returns the property's usage for that bill type", async () => {
    const owner = await proUser("bills");
    const pid = await home(owner);
    const b = (who: Identity) => as("bills", who);
    const bill = (billType: object, usage: number) =>
      b(owner).addBill({
        propertyId: pid,
        billType,
        provider: "Duke",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        amountCents: 12_000n,
        usageAmount: [usage],
        usageUnit: ["kWh"],
      });
    ok(await bill({ Electric: null }, 900));
    ok(await bill({ Water: null }, 40));
    const trend = ok<any[]>(await b(owner).getUsageTrend(pid, { Electric: null }, 12n));
    expect(trend.map((t) => t.usageAmount)).toEqual([900]);
    expect(ok<any[]>(await b(stranger).getUsageTrend(pid, { Electric: null }, 12n))).toEqual([]);
    expect(errOf(await b(owner).getUsageTrend("NOPE", { Electric: null }, 12n))).toBe("NotFound");
  });

  it("OWE.15 attachContractDoc: the property's owner attaches, others can't", async () => {
    const owner = await proUser("recurring");
    const pid = await home(owner);
    const rc = (who: Identity) => as("recurring", who);
    const svc = ok<any>(
      await rc(owner).createRecurringService(
        pid,
        { LawnCare: null },
        "Green Co",
        [],
        [],
        { Monthly: null },
        "2026-01-01",
        [],
        [],
      ),
    );
    expect(errOf(await rc(owner).attachContractDoc(svc.id, ""))).toBe("InvalidInput");
    expect(errOf(await rc(stranger).attachContractDoc(svc.id, "PHOTO_C"))).toBe("NotAuthorized");
    expect(errOf(await rc(owner).attachContractDoc("NOPE", "PHOTO_C"))).toBe("NotFound");
    expect(ok<any>(await rc(owner).attachContractDoc(svc.id, "PHOTO_C")).contractDocPhotoId).toEqual(["PHOTO_C"]);
  });

  it("OWE.16 setTrustedCanisterName: admin only, trusted canisters only", async () => {
    const a = (who: Identity) => as("audit", who);
    expect(errOf(await a(stranger).setTrustedCanisterName(d.ids.job, "job"))).toBe("NotAuthorized");
    expect(errOf(await a(admin).setTrustedCanisterName(stranger.getPrincipal(), "x"))).toBe("InvalidInput");
    ok(await a(admin).addTrustedCanister(d.ids.job));
    expect(errOf(await a(admin).setTrustedCanisterName(d.ids.job, ""))).toBe("InvalidInput");
    ok(await a(admin).setTrustedCanisterName(d.ids.job, "job"));
  });

  it("OWE.17 referrals: admins only, codes, referrals and conversion credits", async () => {
    const rf = (who: Identity) => as("referrals", who);
    await expect(rf(stranger).getMyCode()).rejects.toThrow(/inspect_message/);
    await expect(rf(stranger).useReferralCode("X")).rejects.toThrow(/inspect_message/);
    await expect(rf(stranger).markConverted(stranger.getPrincipal())).rejects.toThrow(/inspect_message/);

    const second = createIdentity("owe-ref-second");
    ok(await rf(admin).addAdmin(second.getPrincipal(), "n"));
    const code = await rf(admin).getMyCode();
    expect(code.length).toBeGreaterThan(0);
    expect(await rf(admin).getMyCode()).toBe(code);
    expect(errOf(await rf(admin).useReferralCode(code))).toBe("SelfReferral");
    expect(errOf(await rf(second).useReferralCode("NOPE"))).toBe("CodeNotFound");
    ok(await rf(second).useReferralCode(code));
    expect(errOf(await rf(second).useReferralCode(code))).toBe("AlreadyReferred");
    expect((await rf(admin).getMyReferrals()).map((r: any) => r.referee)).toEqual([second.getPrincipal().toText()]);

    expect(await rf(admin).getCreditBalance()).toBe(0n);
    ok(await rf(admin).markConverted(second.getPrincipal()));
    expect(errOf(await rf(admin).markConverted(second.getPrincipal()))).toBe("AlreadyConverted");
    expect(await rf(admin).getCreditBalance()).toBeGreaterThan(0n);
    expect(await rf(second).getCreditBalance()).toBe(await rf(admin).getCreditBalance());
  });
});
