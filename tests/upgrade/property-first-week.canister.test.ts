/**
 * First-week homeowner experience on the property canister, on real property
 * and payment canisters.
 *
 *  FW.1 owners and managers save the year each main system was installed;
 *       anyone with a role reads it; bad input is refused
 *  FW.2 the years survive an upgrade
 *  FW.3 the relay reads each home's setup (added date, system years,
 *       whether the water shutoff is written down); notifiers and admins only
 *  FW.4 an owner's first home puts first_home_added in the outbox, later
 *       homes don't
 *  FW.5 an ownership review puts verification_approved or
 *       verification_rejected in the outbox for the owner
 *  FW.6 the years stay with the home when it's sold and go with deleteMyData
 *
 * Run: cd tests/upgrade && npx vitest run property-first-week.canister.test.ts
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

const guide = (over: Record<string, unknown> = {}) => ({
  wifiName: "",
  wifiPassword: "",
  alarm: "",
  trashDay: "",
  recyclingDay: "",
  waterShutoff: "",
  gasShutoff: "",
  electricPanel: "",
  contacts: [],
  notes: "",
  photoIds: [],
  ...over,
});

describe("first week on the property canister", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";

  const admin = createIdentity("fw-admin");
  const relay = createIdentity("fw-relay");
  const owner = createIdentity("fw-owner");
  const buyer = createIdentity("fw-buyer");
  const manager = createIdentity("fw-manager");
  const viewer = createIdentity("fw-viewer");
  const stranger = createIdentity("fw-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const prop = (who: Identity) => as("property", who);
  const nextMinute = async () => {
    await pic.advanceTime(61_000);
    await pic.tick();
  };
  const register = async (who: Identity, address: string) =>
    ok<any>(
      await prop(who).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 1990n,
        squareFeet: 1800n,
        tier: { Pro: null },
      }),
    ).id as string;
  const events = async () => ok<any>(await prop(relay).getNotificationEvents(0n, 200n)).events as any[];
  const yearsOf = async (who: Identity, pid: string) => ok<any[]>(await prop(who).getSystemYears(pid));
  const thisYear = BigInt(new Date().getUTCFullYear());

  beforeAll(async () => {
    pic = await createPic();
    // PocketIC starts its clock at a fixed date; move it to now so "this year" matches.
    await pic.setTime(Date.now());
    await pic.tick();
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
    ok(await prop(admin).addNotifier(relay.getPrincipal()));
    for (const who of [owner, buyer]) {
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));
    }
    home = await register(owner, "50 Pine St");
    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await prop(owner).inviteManager(home, { [role]: null }, role, []));
      ok(await prop(who).claimManagerRole(invite.token));
    }
    await nextMinute();
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("FW.1 saves system install years for people with write access", async () => {
    expect(await yearsOf(owner, home)).toEqual([]);
    const saved = ok<any[]>(
      await prop(owner).setSystemYears(home, [
        { name: "HVAC", installYear: 2019n },
        { name: "Roofing", installYear: 2012n },
        { name: "Water Heater", installYear: thisYear },
      ]),
    );
    expect(saved.map((y) => y.name)).toEqual(["HVAC", "Roofing", "Water Heater"]);
    expect(await yearsOf(viewer, home)).toEqual(saved);

    // A save replaces the whole set; a manager can write it.
    ok(await prop(manager).setSystemYears(home, [{ name: "HVAC", installYear: 2020n }]));
    expect(await yearsOf(owner, home)).toEqual([{ name: "HVAC", installYear: 2020n }]);

    const bad = [
      [{ name: "Hot tub", installYear: 2020n }],
      [{ name: "HVAC", installYear: 1989n }], // before the house was built
      [{ name: "HVAC", installYear: thisYear + 1n }],
      [
        { name: "HVAC", installYear: 2020n },
        { name: "HVAC", installYear: 2021n },
      ],
    ];
    for (const b of bad) expect(errKey(await prop(owner).setSystemYears(home, b))).toBe("InvalidInput");
    expect(errKey(await prop(viewer).setSystemYears(home, []))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).setSystemYears(home, []))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getSystemYears(home))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).getSystemYears("no-such-home"))).toBe("NotFound");
    expect(errKey(await prop(owner).setSystemYears("no-such-home", []))).toBe("NotFound");
    await nextMinute();
  });

  it("FW.2 keeps the years across an upgrade", async () => {
    const before = await yearsOf(owner, home);
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect(await yearsOf(owner, home)).toEqual(before);
  });

  it("FW.3 gives the relay each home's setup", async () => {
    let setup = ok<any[]>(await prop(relay).getPulseSetup(owner.getPrincipal()));
    expect(setup).toHaveLength(1);
    expect(setup[0].propertyId).toBe(home);
    expect(setup[0].addedAt).toBeGreaterThan(0n);
    expect(setup[0].systemYears).toEqual([{ name: "HVAC", installYear: 2020n }]);
    expect(setup[0].hasShutoffs).toBe(false);

    ok(await prop(owner).setHouseGuide(home, [guide({ waterShutoff: "Left of the water heater" })]));
    setup = ok<any[]>(await prop(relay).getPulseSetup(owner.getPrincipal()));
    expect(setup[0].hasShutoffs).toBe(true);

    expect(errKey(await prop(owner).getPulseSetup(owner.getPrincipal()))).toBe("NotAuthorized");
    expect(ok<any[]>(await prop(admin).getPulseSetup(owner.getPrincipal()))).toHaveLength(1);
    await nextMinute();
  });

  it("FW.4 announces an owner's first home only", async () => {
    const first = (await events()).filter((e) => e.kind === "first_home_added");
    expect(first).toHaveLength(1);
    expect(first[0].recipient).toEqual([owner.getPrincipal()]);
    expect(first[0].refId).toBe(home);
    expect(first[0].summary).toBe("50 Pine St");

    await register(owner, "52 Pine St");
    expect((await events()).filter((e) => e.kind === "first_home_added")).toHaveLength(1);
    await nextMinute();
  });

  it("FW.5 tells the owner how an ownership review went", async () => {
    const second = await register(buyer, "60 Oak Ave");
    ok(await prop(buyer).submitVerification(second, "UtilityBill", "ab".repeat(32), []));
    ok(await prop(admin).verifyProperty(second, { Unverified: null }, []));
    ok(await prop(buyer).submitVerification(second, "UtilityBill", "cd".repeat(32), []));
    ok(await prop(admin).verifyProperty(second, { Basic: null }, []));

    const review = (await events()).filter((e) => e.kind.startsWith("verification_"));
    expect(review.map((e) => e.kind)).toEqual(["verification_rejected", "verification_approved"]);
    for (const e of review) {
      expect(e.recipient).toEqual([buyer.getPrincipal()]);
      expect(e.refId).toBe(second);
      expect(e.summary).toBe("60 Oak Ave");
    }

    // An admin setting a home that was never submitted to Unverified isn't a review.
    const third = await register(owner, "54 Pine St").catch(() => "");
    if (third) {
      ok(await prop(admin).verifyProperty(third, { Unverified: null }, []));
      expect((await events()).filter((e) => e.kind === "verification_rejected")).toHaveLength(1);
    }
    await nextMinute();
  });

  it("FW.6 keeps the years with the home on a sale and drops them with deleteMyData", async () => {
    const { token } = ok<any>(await prop(owner).initiateTransfer(home));
    ok(await prop(buyer).claimTransfer(token));
    expect(await yearsOf(buyer, home)).toEqual([{ name: "HVAC", installYear: 2020n }]);
    await nextMinute();
    ok(await prop(buyer).deleteMyData());
    // The home went with the buyer's data; its years must not linger.
    const setup = ok<any[]>(await prop(relay).getPulseSetup(buyer.getPrincipal()));
    expect(setup).toEqual([]);
    expect(errKey(await prop(buyer).getSystemYears(home))).toBe("NotFound");
  });
});
