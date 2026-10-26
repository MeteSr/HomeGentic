/**
 * Report and job canisters, wired to a real property canister.
 *
 * job.updateJob: owner only, and only until someone signs the record.
 * report: reports need a verified property and read the jobs from the job
 * canister; the buyer lookup (findPublicReport) only finds active, unexpired,
 * public links; links expire, can be revoked, follow the owner's "public
 * reports" setting, and go away with the owner's account.
 *
 * Run: cd tests/upgrade && npx vitest run report-job.canister.test.ts
 * (needs .dfx/local/canisters/{property,job,report}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, withMethods, unitResult } from "./__helpers__/setup";
import { idlFactory as propertyIdl } from "../../packages/shared/src/declarations/property";
import { idlFactory as jobIdl }      from "../../packages/shared/src/declarations/job";
import { idlFactory as reportIdl }   from "../../packages/shared/src/declarations/report";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => {
  if (!("err" in r)) throw new Error("Expected err, got ok");
  return Object.keys(r.err)[0];
};

const bootstrap = (I: any) => ({
  setBootstrapNonce: I.Func([I.Text], [], []),
  addAdmin:          I.Func([I.Principal, I.Text], [unitResult(I)], []),
});

const DAY_MS = 24 * 60 * 60 * 1000;
const ADDRESS = "12 Elm Street";

describe("report and job canisters", () => {
  let pic: PocketIc;
  let property: any;
  let job: any;
  let report: any;
  let propertyId = "";
  let jobId = "";

  const admin    = createIdentity("rj-admin");
  const alice    = createIdentity("rj-owner");
  const mallory  = createIdentity("rj-stranger");
  const buyer    = createIdentity("rj-buyer");

  async function bootstrapAdmin(actor: any) {
    await actor.setBootstrapNonce("n");   // as the controller
    actor.setIdentity(admin);
    ok(await actor.addAdmin(admin.getPrincipal(), "n"));
  }

  const generate = (expiryDays: [] | [bigint], visibility: object) => report.generateReport(
    propertyId,
    { address: "ignored", city: "", state: "", zipCode: "", propertyType: "", yearBuilt: 0n, squareFeet: 0n, verificationLevel: "Premium" },
    [], [], expiryDays, visibility, [], [], [], [], [], [],
  );

  beforeAll(async () => {
    pic = await createPic();
    const p = await pic.setupCanister({
      idlFactory: withMethods(propertyIdl, (I) => ({ ...bootstrap(I), addTrustedCanister: I.Func([I.Principal], [unitResult(I)], []) })) as any,
      wasm: wasmPath("property"),
    });
    const j = await pic.setupCanister({
      idlFactory: withMethods(jobIdl, (I) => ({ ...bootstrap(I), addTrustedCanister: I.Func([I.Principal], [unitResult(I)], []) })) as any,
      wasm: wasmPath("job"),
    });
    const r = await pic.setupCanister({
      idlFactory: withMethods(reportIdl, (I) => ({
        ...bootstrap(I),
        setPropertyCanisterId: I.Func([I.Text], [unitResult(I)], []),
        setRiskJobCanisterId:  I.Func([I.Text], [unitResult(I)], []),
      })) as any,
      wasm: wasmPath("report"),
    });
    property = p.actor; job = j.actor; report = r.actor;

    await bootstrapAdmin(property);
    await bootstrapAdmin(job);
    await bootstrapAdmin(report);
    ok(await job.setPropertyCanisterId(p.canisterId.toText()));
    ok(await job.addTrustedCanister(r.canisterId));
    ok(await property.addTrustedCanister(r.canisterId));   // as deploy.sh does: reports show the street address
    ok(await report.setPropertyCanisterId(p.canisterId.toText()));
    ok(await report.setRiskJobCanisterId(j.canisterId.toText()));

    property.setIdentity(alice);
    propertyId = ok<any>(await property.registerProperty({
      address: ADDRESS, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
    })).id;
  });

  afterAll(async () => { await pic?.tearDown(); });

  describe("job.updateJob", () => {
    const args = (title: string) => [title, { Plumbing: null }, "Replaced the water heater.", [], 0n, 0n, [], [], true] as const;

    beforeAll(async () => {
      job.setIdentity(alice);
      jobId = ok<any>(await job.createJob(propertyId, "Water heater", { Plumbing: null }, "Replaced the water heater.", [], 0n, 0n, [], [], true, [])).id;
    });

    it("lets the owner correct an unsigned record", async () => {
      job.setIdentity(alice);
      const updated = ok<any>(await job.updateJob(jobId, ...args("Water heater (50 gal)")));
      expect(updated.title).toBe("Water heater (50 gal)");
      expect(updated.id).toBe(jobId);
      expect(updated.propertyId).toBe(propertyId);
    });

    it("refuses anyone who can't write to the property", async () => {
      job.setIdentity(mallory);
      expect(errKey(await job.updateJob(jobId, ...args("Mine now")))).toBe("NotAuthorized");
      expect(errKey(await job.updateJob("no-such-job", ...args("x")))).toBe("NotFound");
    });

    it("validates like createJob", async () => {
      job.setIdentity(alice);
      expect(errKey(await job.updateJob(jobId, ...args("")))).toBe("InvalidInput");
      const future = BigInt(await pic.getTime() + DAY_MS) * 1_000_000n;
      expect(errKey(await job.updateJob(jobId, "x", { Plumbing: null }, "y", [], 0n, future, [], [], true))).toBe("InvalidInput");
      expect(errKey(await job.updateJob(jobId, "x", { Plumbing: null }, "y", [], 0n, 0n, [], [], false))).toBe("InvalidInput"); // contractor job needs an amount
    });

    it("can't change a record once it is signed", async () => {
      job.setIdentity(alice);
      ok(await job.verifyJob(jobId));
      expect(errKey(await job.updateJob(jobId, ...args("Rewritten")))).toBe("AlreadyVerified");
      expect(ok<any>(await job.getJob(jobId)).title).toBe("Water heater (50 gal)");
    });
  });

  describe("reports", () => {
    let expiring = "";
    let lasting = "";

    it("needs the owner and a verified property", async () => {
      report.setIdentity(mallory);
      expect(errKey(await generate([], { Public: null }))).toBe("NotAuthorized");
      report.setIdentity(alice);
      expect(errKey(await generate([], { Public: null }))).toBe("UnverifiedProperty");
      property.setIdentity(admin);
      ok(await property.verifyProperty(propertyId, { Basic: null }, []));
    });

    it("builds the report from the canisters, not from what the caller sends", async () => {
      report.setIdentity(alice);
      expiring = ok<any>(await generate([1n], { Public: null })).token;
      report.setIdentity(buyer);
      const [, snap] = ok<any>(await report.getReport(expiring));
      expect(snap.address).toBe(ADDRESS);
      expect(snap.verificationLevel).toBe("Basic");
      expect(snap.jobs).toHaveLength(1);
      expect(snap.jobs[0].isVerified).toBe(true);
      expect(snap.verifiedJobCount).toBe(1n);
    });

    it("finds the public report by street address, with or without the rest", async () => {
      expect((await report.findPublicReport(ADDRESS))[0].token).toBe(expiring);
      expect((await report.findPublicReport("12 elm street, Orlando, FL 32801"))[0].token).toBe(expiring);
      expect(await report.findPublicReport("12 Elm Street, Orlando FL 99999")).toEqual([]);   // different ZIP
      expect(await report.findPublicReport("12 Elm")).toEqual([]);
      expect(await report.findPublicReport("14 Elm Street")).toEqual([]);
      expect(await report.findPublicReport("")).toEqual([]);
      expect(await report.hasActivePublicShareLink(propertyId)).toBe(true);
    });

    it("never offers a buyer-only link to the lookup, and prefers the newest public one", async () => {
      report.setIdentity(alice);
      ok(await generate([], { BuyerOnly: null }));
      expect((await report.findPublicReport(ADDRESS))[0].token).toBe(expiring);
      lasting = ok<any>(await generate([], { Public: null })).token;
      expect((await report.findPublicReport(ADDRESS))[0].token).toBe(lasting);
    });

    it("follows the owner's public-reports setting", async () => {
      report.setIdentity(alice);
      ok(await report.setAllowPublicReports(false));
      expect(await report.findPublicReport(ADDRESS)).toEqual([]);
      expect(await report.hasActivePublicShareLink(propertyId)).toBe(false);
      ok(await report.setAllowPublicReports(true));
      expect((await report.findPublicReport(ADDRESS))[0].token).toBe(lasting);
    });

    it("expires a link after its days run out", async () => {
      await pic.advanceTime(DAY_MS + 1000);
      await pic.tick();
      report.setIdentity(buyer);
      expect(errKey(await report.getReport(expiring))).toBe("Expired");
      ok(await report.getReport(lasting));
    });

    it("drops a revoked link from the lookup; only its creator can revoke", async () => {
      report.setIdentity(mallory);
      expect(errKey(await report.revokeShareLink(lasting))).toBe("NotAuthorized");
      report.setIdentity(alice);
      ok(await report.revokeShareLink(lasting));
      expect(await report.findPublicReport(ADDRESS)).toEqual([]);
      expect(await report.hasActivePublicShareLink(propertyId)).toBe(false);
      report.setIdentity(buyer);
      expect(errKey(await report.getReport(lasting))).toBe("Revoked");
    });

    it("removes the owner's reports and links when they delete their account", async () => {
      report.setIdentity(alice);
      const fresh = ok<any>(await generate([], { Public: null })).token;
      expect(await report.listShareLinks(propertyId)).toHaveLength(4);
      expect(Number(ok(await report.deleteMyData()))).toBeGreaterThanOrEqual(8);   // 4 snapshots + 4 links
      expect(await report.listShareLinks(propertyId)).toEqual([]);
      report.setIdentity(buyer);
      expect(errKey(await report.getReport(fresh))).toBe("NotFound");
      expect(await report.findPublicReport(ADDRESS)).toEqual([]);
    });
  });
});
