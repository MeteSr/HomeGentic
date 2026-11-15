/**
 * Recall alerts in the weekly Home Pulse email: the notification relay reads
 * the brand and model of each appliance on an owner's homes
 * (getPulseAppliances) and checks them against CPSC recalls itself, so a
 * possible recall reaches the owner even if they never open the dashboard.
 *
 *  PA.1 notifiers and admins only; the owner, a manager and a stranger are NotAuthorized
 *  PA.2 lists every fixture with both a brand and a model on the owner's active
 *       homes, with the room name; blanks are left out, duplicates kept once per home
 *  PA.3 nothing else from the fixture (serial number, notes) is returned
 *  PA.4 an owner with no homes gets an empty list
 *
 * Run: cd tests/upgrade && npx vitest run property-pulse-appliances.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment}/*.wasm)
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

const CANISTERS = ["property", "payment"] as const;
type Name = (typeof CANISTERS)[number];

const fixture = (brand: string, model: string, serialNumber = "") => ({
  brand,
  model,
  serialNumber,
  installedDate: "",
  warrantyExpiry: "",
  notes: "private note",
});

describe("getPulseAppliances (recall alerts in Home Pulse)", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";

  const admin = createIdentity("pa-admin");
  const owner = createIdentity("pa-owner");
  const manager = createIdentity("pa-manager");
  const stranger = createIdentity("pa-stranger");
  const notifier = createIdentity("pa-notifier");

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
    ok(await as("property", admin).setPaymentCanisterId(ids.payment));
    ok(await as("property", admin).addNotifier(notifier.getPrincipal()));
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));

    home = ok<any>(
      await as("property", owner).registerProperty({
        address: "3 Recall Row",
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2004n,
        squareFeet: 1800n,
        tier: { Pro: null },
      }),
    ).id as string;
    const invite = ok<any>(await as("property", owner).inviteManager(home, { Manager: null }, "Manager", []));
    ok(await as("property", manager).claimManagerRole(invite.token));

    const room = (name: string) =>
      as("property", owner).createRoom({
        propertyId: home,
        name,
        floorName: "",
        floorType: "",
        paintColor: "",
        paintBrand: "",
        paintCode: "",
        notes: "",
      });
    const kitchen = ok<any>(await room("Kitchen")).id as string;
    const garage = ok<any>(await room("Garage")).id as string;
    ok(await as("property", owner).addFixture(kitchen, fixture("Whirlpool", "WRF555SDFZ", "SN-1")));
    ok(await as("property", owner).addFixture(kitchen, fixture("GE", "")));
    ok(await as("property", owner).addFixture(kitchen, fixture("", "ABC123")));
    ok(await as("property", owner).addFixture(garage, fixture("Rheem", "XE50T10H45U0")));
    ok(await as("property", owner).addFixture(garage, fixture("rheem", "XE50T10H45U0")));
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("PA.1 is for notifiers and admins only", async () => {
    expect(errKey(await as("property", owner).getPulseAppliances(owner.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await as("property", manager).getPulseAppliances(owner.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await as("property", stranger).getPulseAppliances(owner.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await as("property", admin).getPulseAppliances(owner.getPrincipal()))).toBe("ok");
  });

  it("PA.2 lists appliances with a brand and a model, once per home", async () => {
    const list = ok<any[]>(await as("property", notifier).getPulseAppliances(owner.getPrincipal()));
    const rows = list.map((a) => `${a.propertyId}|${a.room}|${a.brand}|${a.model}`).sort();
    expect(rows).toEqual([`${home}|Garage|Rheem|XE50T10H45U0`, `${home}|Kitchen|Whirlpool|WRF555SDFZ`]);
  });

  it("PA.3 returns only property, room, brand and model", async () => {
    const [first] = ok<any[]>(await as("property", notifier).getPulseAppliances(owner.getPrincipal()));
    expect(Object.keys(first).sort()).toEqual(["brand", "model", "propertyId", "room"]);
  });

  it("PA.4 an owner with no homes gets an empty list", async () => {
    expect(ok<any[]>(await as("property", notifier).getPulseAppliances(stranger.getPrincipal()))).toEqual([]);
  });
});
