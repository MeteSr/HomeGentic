/**
 * Insurance claim kit (issue #711, part 2): the household keeps a record of an
 * insurance claim on the home (property canister: createInsuranceClaim,
 * updateInsuranceClaim, addInsuranceClaimLog, deleteInsuranceClaim,
 * getInsuranceClaims), on real property and payment canisters wired as
 * deploy.sh wires them.
 *
 *  CL.1 owner and managers with write access can start and edit a claim;
 *       viewers and strangers can't
 *  CL.2 the household reads the home's claims, newest loss first; a stranger
 *       is NotAuthorized and an unknown home NotFound
 *  CL.3 bad input is refused: empty title, malformed date of loss, oversized
 *       text, an empty or oversized log note
 *  CL.4 the claim log keeps dated entries in the order they were added
 *  CL.5 deleting a claim removes it; unknown claims are NotFound
 *  CL.6 claims survive an upgrade (new stable side map)
 *  CL.7 a claimed transfer drops the seller's claims; deleteMyData drops the
 *       owner's
 *
 * Run: cd tests/upgrade && npx vitest run property-insurance-claims.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
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

const CANISTERS = ["property", "payment"] as const;
type Name = (typeof CANISTERS)[number];

const CLAIM = {
  title: "Kitchen ceiling leak",
  dateOfLoss: "2026-09-28",
  cause: "Water leak",
  description: "Water through the ceiling after the storm",
  claimNumber: "CLM-778",
  adjusterName: "Dana Ruiz",
  adjusterContact: "dana@example.com",
  status: { Open: null },
};

describe("insurance claim kit", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let otherHome = "";
  let leak = "";

  const admin = createIdentity("cl-admin");
  const owner = createIdentity("cl-owner");
  const manager = createIdentity("cl-manager");
  const viewer = createIdentity("cl-viewer");
  const stranger = createIdentity("cl-stranger");
  const buyer = createIdentity("cl-buyer");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const prop = (who: Identity) => as("property", who);
  // The canister allows 30 update calls a minute per caller; move past the window.
  const nextMinute = async () => {
    await pic.advanceTime(61_000);
    await pic.tick();
  };
  const claims = async (who: Identity, id = home) => ok<any[]>(await prop(who).getInsuranceClaims(id));
  const register = async (address: string) =>
    ok<any>(
      await prop(owner).registerProperty({
        address,
        city: "Tampa",
        state: "FL",
        zipCode: "33602",
        propertyType: { SingleFamily: null },
        yearBuilt: 1998n,
        squareFeet: 1600n,
        tier: { Pro: null },
      }),
    ).id as string;

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      ids[name] = (
        await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })
      ).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    ok(await prop(admin).setPaymentCanisterId(ids.payment));
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));

    home = await register("3 Claim Court");
    otherHome = await register("5 Claim Court");
    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await prop(owner).inviteManager(home, { [role]: null }, role, []));
      ok(await prop(who).claimManagerRole(invite.token));
    }
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("CL.1 lets the owner and managers start and edit a claim, not viewers or strangers", async () => {
    const created = ok<any>(await prop(owner).createInsuranceClaim(home, CLAIM));
    leak = created.id;
    expect(leak).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.propertyId).toBe(home);
    expect(created.log).toEqual([]);

    const edited = ok<any>(
      await prop(manager).updateInsuranceClaim(leak, { ...CLAIM, claimNumber: "CLM-779", status: { Closed: null } }),
    );
    expect(edited.claimNumber).toBe("CLM-779");
    expect(edited.status).toEqual({ Closed: null });
    expect(edited.createdAt).toBe(created.createdAt);

    expect(errKey(await prop(viewer).createInsuranceClaim(home, CLAIM))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).createInsuranceClaim(home, CLAIM))).toBe("NotAuthorized");
    expect(errKey(await prop(viewer).updateInsuranceClaim(leak, CLAIM))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).addInsuranceClaimLog(leak, "2026-10-01", "hi"))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).deleteInsuranceClaim(leak))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).createInsuranceClaim("no-such-home", CLAIM))).toBe("NotFound");
  });

  it("CL.2 shows the home's claims to the household only, newest loss first", async () => {
    const roof = ok<any>(
      await prop(owner).createInsuranceClaim(home, { ...CLAIM, title: "Roof shingles", dateOfLoss: "2026-10-10" }),
    );
    const list = await claims(owner);
    expect(list.map((c) => c.id)).toEqual([roof.id, leak]);
    expect((await claims(viewer)).map((c) => c.id)).toEqual([roof.id, leak]);
    expect(errKey(await prop(stranger).getInsuranceClaims(home))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).getInsuranceClaims("no-such-home"))).toBe("NotFound");
    expect(await claims(owner, otherHome)).toEqual([]);
    ok(await prop(owner).deleteInsuranceClaim(roof.id));
  });

  it("CL.3 refuses bad input", async () => {
    const bad = [
      { ...CLAIM, title: "  " },
      { ...CLAIM, title: "x".repeat(101) },
      { ...CLAIM, dateOfLoss: "2026-02-30" },
      { ...CLAIM, dateOfLoss: "28/09/2026" },
      { ...CLAIM, cause: "x".repeat(61) },
      { ...CLAIM, description: "x".repeat(2001) },
      { ...CLAIM, claimNumber: "x".repeat(61) },
      { ...CLAIM, adjusterName: "x".repeat(101) },
      { ...CLAIM, adjusterContact: "x".repeat(201) },
    ];
    for (const c of bad) {
      expect(errKey(await prop(owner).createInsuranceClaim(home, c))).toBe("InvalidInput");
      expect(errKey(await prop(owner).updateInsuranceClaim(leak, c))).toBe("InvalidInput");
    }
    expect(errKey(await prop(owner).addInsuranceClaimLog(leak, "2026-10-01", "   "))).toBe("InvalidInput");
    expect(errKey(await prop(owner).addInsuranceClaimLog(leak, "2026-10-01", "x".repeat(1001)))).toBe("InvalidInput");
    expect(errKey(await prop(owner).addInsuranceClaimLog(leak, "yesterday", "Called"))).toBe("InvalidInput");
  });

  it("CL.4 keeps dated log entries in the order they were added", async () => {
    await nextMinute();
    ok(await prop(owner).addInsuranceClaimLog(leak, "2026-09-29", "Reported to the insurer by phone"));
    const after = ok<any>(await prop(manager).addInsuranceClaimLog(leak, "2026-10-02", "Adjuster visited"));
    expect(after.log.map((e: any) => [e.date, e.note])).toEqual([
      ["2026-09-29", "Reported to the insurer by phone"],
      ["2026-10-02", "Adjuster visited"],
    ]);
    expect(after.log[1].addedAt).toBeGreaterThan(0n);
    expect(errKey(await prop(owner).addInsuranceClaimLog("no-such-claim", "2026-10-02", "x"))).toBe("NotFound");
  });

  it("CL.5 deletes a claim; unknown claims are NotFound", async () => {
    const extra = ok<any>(await prop(owner).createInsuranceClaim(home, { ...CLAIM, title: "Fence" }));
    ok(await prop(manager).deleteInsuranceClaim(extra.id));
    expect((await claims(owner)).map((c) => c.id)).toEqual([leak]);
    expect(errKey(await prop(owner).deleteInsuranceClaim(extra.id))).toBe("NotFound");
    expect(errKey(await prop(owner).updateInsuranceClaim("no-such-claim", CLAIM))).toBe("NotFound");
  });

  it("CL.6 keeps claims across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    const [c] = await claims(owner);
    expect(c.id).toBe(leak);
    expect(c.log).toHaveLength(2);
  });

  it("CL.7 drops the seller's claims on a claimed transfer and the owner's on deleteMyData", async () => {
    ok(await prop(owner).createInsuranceClaim(otherHome, CLAIM));
    const { token } = ok<any>(await prop(owner).initiateTransfer(home));
    ok(await prop(buyer).claimTransfer(token));
    expect(await claims(buyer)).toEqual([]);
    expect(errKey(await prop(buyer).updateInsuranceClaim(leak, CLAIM))).toBe("NotFound");

    const [kept] = await claims(owner, otherHome);
    ok(await prop(owner).deleteMyData());
    expect(errKey(await prop(admin).updateInsuranceClaim(kept.id, CLAIM))).toBe("NotFound");
  });
});
