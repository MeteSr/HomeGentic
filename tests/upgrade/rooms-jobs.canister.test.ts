/**
 * Rooms and fixtures (property canister), builder job imports and the
 * contractor-attestation refresh (job canister), on real property, payment,
 * job and contractor canisters wired as deploy.sh wires them.
 *
 * Rooms follow the caller's current access to the property: managers with
 * write access edit, viewers read, strangers get nothing, and a removed
 * manager loses access at once. Builder imports are admin-only, since they
 * write pre-signed records. A job signed by an unverified contractor stops
 * counting as verified until an admin verifies the contractor, then counts.
 *
 * Run: cd tests/upgrade && npx vitest run rooms-jobs.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,job,contractor}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");

const CANISTERS = ["property", "payment", "job", "contractor"] as const;
type Name = typeof CANISTERS[number];
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

describe("rooms, builder imports and contractor attestation", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let propertyId = "";

  const admin    = createIdentity("rj2-admin");
  const owner    = createIdentity("rj2-owner");
  const manager  = createIdentity("rj2-manager");
  const viewer   = createIdentity("rj2-viewer");
  const stranger = createIdentity("rj2-stranger");
  const builder  = createIdentity("rj2-builder");
  const pro      = createIdentity("rj2-contractor");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const room = (name: string) => ({ propertyId, name, floorName: "First Floor", floorType: "Oak", paintColor: "White", paintBrand: "", paintCode: "", notes: "" });
  const fixture = (serialNumber: string) => ({ brand: "Rheem", model: "XE50", serialNumber, installedDate: "2024-03-01", warrantyExpiry: "2030-03-01", notes: "" });

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
    ok(await as("contractor", admin).setJobCanisterId(ids.job.toText()));
    ok(await as("job", admin).addTrustedCanister(ids.contractor));
    ok(await as("job", admin).addTrustedCanister(ids.property));

    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));
    propertyId = ok<any>(await as("property", owner).registerProperty({
      address: "3 Cedar Way", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 2010n, squareFeet: 2000n, tier: { Pro: null },
    })).id;
    for (const [who, role] of [[manager, "Manager"], [viewer, "Viewer"]] as const) {
      const invite = ok<any>(await as("property", owner).inviteManager(propertyId, { [role]: null }, role, []));
      ok(await as("property", who).claimManagerRole(invite.token));
    }
  }, 180_000);

  afterAll(async () => { await pic?.tearDown(); });

  describe("rooms and fixtures", () => {
    let roomId = "";
    let fixtureId = "";

    it("lets people with write access create and edit rooms", async () => {
      expect(errKey(await as("property", stranger).createRoom(room("Den")))).toBe("NotAuthorized");
      expect(errKey(await as("property", viewer).createRoom(room("Den")))).toBe("NotAuthorized");
      expect(errKey(await as("property", owner).createRoom(room("")))).toBe("InvalidInput");
      roomId = ok<any>(await as("property", owner).createRoom(room("Kitchen"))).id;
      const updated = ok<any>(await as("property", manager).updateRoom(roomId, { ...room("Kitchen"), paintColor: "Sage" }));
      expect(updated.paintColor).toBe("Sage");
      expect(errKey(await as("property", viewer).updateRoom(roomId, room("Mine")))).toBe("NotAuthorized");
    });

    it("keeps fixtures, with their serial numbers, inside the household", async () => {
      fixtureId = ok<any>(await as("property", manager).addFixture(roomId, fixture("SN-1"))).fixtures[0].id;
      expect(errKey(await as("property", stranger).addFixture(roomId, fixture("SN-X")))).toBe("NotAuthorized");
      expect(errKey(await as("property", viewer).addFixture(roomId, fixture("SN-X")))).toBe("NotAuthorized");
      expect(ok<any>(await as("property", viewer).getRoom(roomId)).fixtures.map((f: any) => f.serialNumber)).toEqual(["SN-1"]);
      expect(errKey(await as("property", stranger).getRoom(roomId))).toBe("NotAuthorized");
      expect(await as("property", stranger).getRoomsByProperty(propertyId)).toEqual([]);

      const edited = ok<any>(await as("property", owner).updateFixture(roomId, fixtureId, fixture("SN-2")));
      expect(edited.fixtures.map((f: any) => [f.id, f.serialNumber])).toEqual([[fixtureId, "SN-2"]]);
      expect(errKey(await as("property", owner).updateFixture(roomId, "FIX_none", fixture("x")))).toBe("NotFound");
      expect(errKey(await as("property", stranger).removeFixture(roomId, fixtureId))).toBe("NotAuthorized");
      expect(ok<any>(await as("property", owner).removeFixture(roomId, fixtureId)).fixtures).toEqual([]);
    });

    it("takes a removed manager's access away at once", async () => {
      ok(await as("property", owner).removeManager(propertyId, manager.getPrincipal()));
      expect(errKey(await as("property", manager).updateRoom(roomId, room("Kitchen")))).toBe("NotAuthorized");
      expect(errKey(await as("property", manager).getRoom(roomId))).toBe("NotAuthorized");
      expect(errKey(await as("property", manager).deleteRoom(roomId))).toBe("NotAuthorized");
    });

    it("deletes a room for the owner", async () => {
      ok(await as("property", owner).deleteRoom(roomId));
      expect(errKey(await as("property", owner).getRoom(roomId))).toBe("NotFound");
      expect(await as("property", owner).getRoomsByProperty(propertyId)).toEqual([]);
    });
  });

  describe("builder imports", () => {
    const done = () => pic.getTime().then((t) => BigInt(t - YEAR_MS) * 1_000_000n);
    const importJob = async (who: Identity) => as("job", who).builderImportJob(
      propertyId, { Roofing: null }, "Top Roofing LLC", 18_000_00n, await done(), "Roof at construction.", [], [120n],
    );

    it("refuses everyone but admins, since the records come pre-signed", async () => {
      expect(errKey(await importJob(builder))).toBe("NotAuthorized");
      expect(errKey(await importJob(owner))).toBe("NotAuthorized");
    });

    it("files an admin's import as a verified job owned by the property's owner", async () => {
      const job = ok<any>(await importJob(admin));
      expect([job.verified, job.homeownerSigned, job.contractorSigned, job.homeowner.toText()])
        .toEqual([true, true, true, owner.getPrincipal().toText()]);
      expect(ok<any>(await as("job", owner).getJob(job.id)).contractorName).toEqual(["Top Roofing LLC"]);
      expect(errKey(await as("job", admin).builderImportJob("PROP_none", { Roofing: null }, "X", 1n, await done(), "x", [], []))).toBe("NotFound");
    });
  });

  describe("contractor attestation", () => {
    it("counts a contractor's signature once an admin verifies the contractor", async () => {
      ok(await as("contractor", pro).register({ name: "Pat Plumbing", specialties: [{ Plumbing: null }], email: "pat@example.com", phone: "+14075550123" }));
      const before = (await as("job", owner).getCertificationData(propertyId)).verifiedJobCount;

      const t = BigInt(await pic.getTime() - YEAR_MS / 4) * 1_000_000n;
      const proposal = ok<any>(await as("job", pro).createJobProposal(propertyId, "Repipe", { Plumbing: null }, "Whole-house PEX repipe.", ["Pat Plumbing"], 9_500_00n, t, [], []));
      // Approving takes the proposal into the normal lifecycle; the owner's
      // signature then completes the record.
      expect(ok<any>(await as("job", owner).approveJobProposal(proposal.id)).verified).toBe(false);
      expect(ok<any>(await as("job", owner).verifyJob(proposal.id)).verified).toBe(true);
      // Signed, but by an unverified contractor: it doesn't count yet.
      expect((await as("job", owner).getCertificationData(propertyId)).verifiedJobCount).toBe(before);

      expect(errKey(await as("job", pro).refreshContractorAttestation(pro.getPrincipal(), true))).toBe("NotAuthorized");
      ok(await as("contractor", admin).verifyContractor(pro.getPrincipal()));
      const after = await as("job", owner).getCertificationData(propertyId);
      expect(after.verifiedJobCount).toBe(before + 1n);
      expect(after.verifiedKeySystems).toContain("Plumbing");
    });
  });
});
