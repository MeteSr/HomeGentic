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
 * Run: cd tests/upgrade && npx vitest run security-2026-11-11.canister.test.ts
 * (needs .dfx/local/canisters/{contractor,job,property,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

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
});
