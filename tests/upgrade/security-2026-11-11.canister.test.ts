/**
 * Whole-codebase security review 2026-11-11
 * (/mnt/project-files/audits/security-whole-codebase-2026-11-11.md), on real
 * contractor, job, property and payment canisters wired as deploy.sh wires
 * them. X-1 and X-2 have their own suites (photo-migration, photo-sweep,
 * payment, payment-subscribe).
 *
 *  X-3 one account per licence number
 *   X3.1 the first account whose check matches DBPR's file holds the number
 *   X3.2 a second account claiming the same number and name is refused
 *        (#AlreadyExists) and shows no check
 *   X3.3 a check that doesn't match (wrong name, not found) is still recorded
 *        for the second account, since it shows a warning, not a badge
 *   X3.4 when the holder changes or drops the number, the hold lapses
 *   X3.5 an admin can move the hold (setLicenseHolder); nobody else can
 *
 *  X-4 lead-alert targets are for the notification relay
 *   X4.1 getLeadAlertTargets and getLeadAlertTargetsPage are empty for a
 *        signed-in stranger and for a contractor
 *   X4.2 the relay (a notifier) pages through every contractor, hidden ones
 *        included, with no gaps or repeats; the page size is capped at 200
 *
 *  X-5 OQL is no wider than the getters
 *   X5.1 a Viewer reads the policy, inventory and warranty plan with the
 *        policy number, serial numbers and contract number blanked; a
 *        Manager and the owner read them in full
 *   X5.2 property OQL blanks the same fields (and fixture serial numbers)
 *        for a Viewer, and not for a Manager
 *   X5.3 an unwired job canister (no property canister id) shows a signed-in
 *        caller only their own jobs, in execute and getJobsForProperties,
 *        instead of every job
 *
 * Run: cd tests/upgrade && npx vitest run security-2026-11-11.canister.test.ts
 * (needs .dfx/local/canisters/{contractor,job,property,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type Cell = { name: string; value: Record<string, unknown> };
const plain = (row: Cell[]) =>
  Object.fromEntries(
    row.map((c) => {
      const [k, v] = Object.entries(c.value)[0];
      return [c.name, k === "null" ? null : typeof v === "bigint" ? Number(v) : v];
    }),
  );

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const CANISTERS = ["contractor", "job", "property", "payment"] as const;
type Name = (typeof CANISTERS)[number];

describe("security review 2026-11-11", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;

  const admin = createIdentity("x11-admin");
  const relay = createIdentity("x11-relay");
  const notifier = createIdentity("x11-notifier");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      ids[name] = (await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));
    ok(await as("job", admin).setPropertyCanisterId(ids.property.toText()));
    ok(await as("job", admin).setContractorCanisterId(ids.contractor.toText()));
    ok(await as("job", admin).addTrustedCanister(ids.contractor));
    ok(await as("job", admin).addTrustedCanister(ids.property));
    ok(await as("contractor", admin).setJobCanisterId(ids.job.toText()));
    ok(await as("contractor", admin).addLicenseRelay(relay.getPrincipal()));
    ok(await as("contractor", admin).addNotifier(notifier.getPrincipal()));
  }, 180_000);

  afterAll(async () => { await pic?.tearDown(); });

  // ── X-3 ──────────────────────────────────────────────────────────────────
  describe("X-3 one account per licence number", () => {
    const real  = createIdentity("x3-real");
    const fake  = createIdentity("x3-fake");
    const other = createIdentity("x3-other");
    const LIC = "CGC1234567";
    const NAME = "Smith Roofing LLC";

    const profile = (name: string, licenseNumber: string | null) => ({
      name, specialties: [{ Roofing: null }], email: "x@example.com", phone: "+14075550123",
      bio: [], licenseNumber: licenseNumber ? [licenseNumber] : [], serviceArea: [], serviceZips: [],
    });
    const check = (over: Record<string, unknown> = {}) => ({
      licenseNumber: LIC, found: true, licenseeName: "SMITH, JOHN", dbaName: "SMITH ROOFING LLC",
      licenseType: "Certified General Contractor", status: "Current, Active", active: true,
      expiresOn: "2027-08-31", nameMatches: true, sourceDate: "2026-11-01", ...over,
    });
    const record = (who: Identity, over: Record<string, unknown> = {}) =>
      as("contractor", relay).relayRecordLicenseCheck(who.getPrincipal(), check(over));

    beforeAll(async () => {
      for (const who of [real, fake, other]) {
        ok(await as("contractor", who).register({ name: NAME, specialties: [{ Roofing: null }], email: "x@example.com", phone: "+14075550123" }));
        ok(await as("contractor", who).updateProfile(profile(NAME, LIC)));
      }
    });

    it("X3.1 the first account whose check matches holds the number", async () => {
      ok(await record(real));
      const c = await as("contractor", other).getLicenseCheck(real.getPrincipal());
      expect(c[0]?.nameMatches).toBe(true);
    });

    it("X3.2 a second account with the same number and name is refused and shows no check", async () => {
      expect(errKey(await record(fake))).toBe("AlreadyExists");
      expect(await as("contractor", other).getLicenseCheck(fake.getPrincipal())).toEqual([]);
    });

    it("X3.3 a check that only produces a warning is still recorded", async () => {
      ok(await record(fake, { nameMatches: false }));
      const c = await as("contractor", other).getLicenseCheck(fake.getPrincipal());
      expect(c[0]?.nameMatches).toBe(false);
      // The holder's check is untouched.
      expect((await as("contractor", other).getLicenseCheck(real.getPrincipal()))[0]?.nameMatches).toBe(true);
    });

    it("X3.4 the hold lapses when the holder changes the number", async () => {
      ok(await as("contractor", real).updateProfile(profile(NAME, "CGC7654321")));
      ok(await record(fake));
      expect((await as("contractor", other).getLicenseCheck(fake.getPrincipal()))[0]?.nameMatches).toBe(true);
      // The old holder taking the number back is now the second claimant.
      ok(await as("contractor", real).updateProfile(profile(NAME, LIC)));
      expect(errKey(await record(real))).toBe("AlreadyExists");
    });

    it("X3.5 an admin can move the hold; nobody else can", async () => {
      for (const who of [real, fake, relay]) {
        expect(errKey(await as("contractor", who).setLicenseHolder(LIC, [real.getPrincipal()]))).toBe("NotAuthorized");
      }
      ok(await as("contractor", admin).setLicenseHolder("cgc-123 4567", [real.getPrincipal()]));
      ok(await record(real));
      // The account that lost the hold no longer shows a matching check.
      expect(await as("contractor", other).getLicenseCheck(fake.getPrincipal())).toEqual([]);
      expect(errKey(await record(fake))).toBe("AlreadyExists");
      // Clearing the hold lets the next matching check take it.
      ok(await as("contractor", admin).setLicenseHolder(LIC, []));
      ok(await record(fake));
      expect(errKey(await record(real))).toBe("AlreadyExists");
    });
  });

  // ── X-4 ──────────────────────────────────────────────────────────────────
  describe("X-4 lead-alert targets are for the notification relay", () => {
    const crew = Array.from({ length: 5 }, (_, i) => createIdentity(`x4-c${i}`));
    const stranger = createIdentity("x4-stranger");

    beforeAll(async () => {
      for (const c of crew) {
        ok(await as("contractor", c).register({ name: "Crew", specialties: [{ Plumbing: null }], email: "c@example.com", phone: "+14075550123" }));
      }
      ok(await as("contractor", crew[0]).setProfilePrivacy({ listed: false, showTrustScore: false, showJobsCompleted: false }));
    });

    it("X4.1 strangers and contractors get nothing", async () => {
      for (const who of [stranger, crew[1]]) {
        expect(await as("contractor", who).getLeadAlertTargets()).toEqual([]);
        expect(await as("contractor", who).getLeadAlertTargetsPage([], 50n)).toEqual([]);
      }
    });

    it("X4.2 the relay pages through everyone, hidden profiles included", async () => {
      const total = (await as("contractor", notifier).getLeadAlertTargets()).length;
      expect(total).toBeGreaterThanOrEqual(crew.length);
      const seen: string[] = [];
      let after: [] | [any] = [];
      for (;;) {
        const page: any[] = await as("contractor", notifier).getLeadAlertTargetsPage(after, 2n);
        expect(page.length).toBeLessThanOrEqual(2);
        seen.push(...page.map((t: any) => t.id.toText()));
        if (page.length < 2) break;
        after = [page[page.length - 1].id];
      }
      expect(seen.length).toBe(total);
      expect(new Set(seen).size).toBe(total);
      for (const c of crew) expect(seen).toContain(c.getPrincipal().toText());
      expect((await as("contractor", admin).getLeadAlertTargetsPage([], 10_000n)).length).toBeLessThanOrEqual(200);
    });
  });

  // ── X-5 ──────────────────────────────────────────────────────────────────
  describe("X-5 OQL is no wider than the getters", () => {
    const owner   = createIdentity("x5-owner");
    const manager = createIdentity("x5-manager");
    const viewer  = createIdentity("x5-viewer");
    const outsider = createIdentity("x5-outsider");
    let home = "";

    const oql = async (who: Identity, q: object) =>
      ((await as("property", who).execute(JSON.stringify(q))).rows as Cell[][]).map(plain);

    beforeAll(async () => {
      ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
      home = ok<any>(await as("property", owner).registerProperty({
        address: "5 Secret Ln", city: "Orlando", state: "FL", zipCode: "32801",
        propertyType: { SingleFamily: null }, yearBuilt: 2001n, squareFeet: 1500n, tier: { Pro: null },
      })).id;
      for (const [who, role] of [[manager, "Manager"], [viewer, "Viewer"]] as const) {
        const invite = ok<any>(await as("property", owner).inviteManager(home, { [role]: null }, role, []));
        ok(await as("property", who).claimManagerRole(invite.token));
      }
      ok(await as("property", owner).setInsurancePolicy(home, [{
        carrier: "Citizens", policyNumber: "HO3-999", renewalDate: "2027-06-01",
        coverageACents: [35_000_000n], hurricaneDeductible: [],
      }]));
      ok(await as("property", owner).addInventoryItem(home, {
        roomId: [], name: "TV", category: "Electronics", quantity: 1n, valueCents: [120_000n],
        purchaseDate: "", serialNumber: "SN-TV-1", notes: "",
      }));
      ok(await as("property", owner).setHomeWarrantyPlan(home, [{
        provider: "American Home Shield", planName: "ShieldGold", contractNumber: "AHS-123456",
        claimContact: "1-800-555-0100", serviceFeeCents: [12_500n], startDate: "2026-03-15",
        renewalDate: "2027-03-15", coverageNotes: "", exclusionNotes: "", contractDocId: [],
      }]));
      const room = ok<any>(await as("property", owner).createRoom({
        propertyId: home, name: "Kitchen", floorName: "First Floor", floorType: "Tile",
        paintColor: "", paintBrand: "", paintCode: "", notes: "",
      }));
      ok(await as("property", owner).addFixture(room.id, {
        brand: "Bosch", model: "SHX", serialNumber: "SN-DW-1", installedDate: "", warrantyExpiry: "", notes: "",
      }));
    });

    it("X5.1 a Viewer's getters blank the numbers; a Manager's don't", async () => {
      const read = async (who: Identity) => ({
        policy:   ok<any[]>(await as("property", who).getInsurancePolicy(home))[0].policyNumber,
        serial:   ok<any[]>(await as("property", who).getInventory(home))[0].serialNumber,
        contract: ok<any[]>(await as("property", who).getHomeWarrantyPlan(home))[0].contractNumber,
      });
      expect(await read(viewer)).toEqual({ policy: "", serial: "", contract: "" });
      for (const who of [manager, owner]) {
        expect(await read(who)).toEqual({ policy: "HO3-999", serial: "SN-TV-1", contract: "AHS-123456" });
      }
      // The rest of the record still reads.
      expect(ok<any[]>(await as("property", viewer).getInsurancePolicy(home))[0].carrier).toBe("Citizens");
    });

    it("X5.2 OQL blanks the same fields for a Viewer", async () => {
      const pin = { eq: { field: "propertyId", value: home } };
      const read = async (who: Identity) => ({
        policy:   (await oql(who, { start: "insurance_policies", where: pin, select: ["policyNumber"] }))[0]?.policyNumber,
        serial:   (await oql(who, { start: "inventory_items", where: pin, select: ["serialNumber"] }))[0]?.serialNumber,
        contract: (await oql(who, { start: "warranty_plans", where: pin, select: ["contractNumber"] }))[0]?.contractNumber,
        fixture:  (await oql(who, { start: "fixtures", where: pin, select: ["serialNumber"] }))[0]?.serialNumber,
      });
      expect(await read(viewer)).toEqual({ policy: "", serial: "", contract: "", fixture: "" });
      expect(await read(manager)).toEqual({ policy: "HO3-999", serial: "SN-TV-1", contract: "AHS-123456", fixture: "SN-DW-1" });
    });

    it("X5.3 an unwired job canister shows a caller only their own jobs", async () => {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath("job"));
      const svc = idlFactory({ IDL });
      const arg = new Uint8Array(IDL.encode(initArgs, initArgs.map(() => admin.getPrincipal())));
      const loose = (await pic.setupCanister({ idlFactory: (() => svc) as any, wasm: wasmPath("job"), arg })).canisterId;
      const job = (who: Identity) => {
        const a = pic.createActor<any>((() => svc) as any, loose);
        a.setIdentity(who);
        return a;
      };
      const PID = "unwired-home";
      ok(await job(owner).createJob(PID, "Roof", { Roofing: null }, "Roof work", ["Acme"], 500_000n,
        1_600_000_000_000_000_000n, [], [12n], false, []));

      expect((await job(owner).getJobsForProperties([PID])).length).toBe(1);
      expect(await job(outsider).getJobsForProperties([PID])).toEqual([]);
      const q = JSON.stringify({ start: "jobs", where: { eq: { field: "propertyId", value: PID } } });
      expect((await job(owner).execute(q)).rows.length).toBe(1);
      expect((await job(outsider).execute(q)).rows).toEqual([]);
    });
  });
});
