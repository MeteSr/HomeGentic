/**
 * Move-in plan for new owners (#712) on the property canister, on real
 * property and payment canisters.
 *
 *  MI.1 a buyer who claims a home gets a fresh move-in plan; the seller's
 *       plan (if any) doesn't come with it
 *  MI.2 an owner who didn't arrive by transfer can start one; starting again
 *       returns the same plan
 *  MI.3 write access ticks steps off and on; readers see the plan; viewers
 *       and strangers can't change it; bad step ids are refused
 *  MI.4 tasks from the purchase inspection: added in a batch, validated,
 *       capped, deleted (with their tick)
 *  MI.5 ending the plan removes it
 *  MI.6 the plan survives an upgrade
 *  MI.7 deleteMyData drops the owner's plans
 *
 * Run: cd tests/upgrade && npx vitest run property-move-in.canister.test.ts
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

const task = (over: Record<string, unknown> = {}) => ({
  title: "Replace cracked GFCI outlet in the kitchen",
  detail: "Inspector noted the outlet left of the sink doesn't trip.",
  area: "Electrical",
  urgency: { Safety: null },
  ...over,
});

describe("move-in plan", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let second = "";

  const admin = createIdentity("mi-admin");
  const seller = createIdentity("mi-seller");
  const buyer = createIdentity("mi-buyer");
  const manager = createIdentity("mi-manager");
  const viewer = createIdentity("mi-viewer");
  const stranger = createIdentity("mi-stranger");

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
        yearBuilt: 1998n,
        squareFeet: 1800n,
        tier: { Pro: null },
      }),
    ).id as string;
  const planOf = async (who: Identity, pid: string) => ok<any[]>(await prop(who).getMoveInPlan(pid))[0];

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
    for (const who of [seller, buyer]) {
      ok(await as("payment", admin).adminActivateStripeSubscription(who.getPrincipal(), { Pro: null }, 12n));
    }
    home = await register(seller, "40 Lake Dr");
    // The seller keeps a plan of their own on the home; it must not reach the buyer.
    ok(await prop(seller).startMoveInPlan(home));
    ok(await prop(seller).setMoveInStep(home, "locks", true));
    ok(await prop(seller).addMoveInTasks(home, [task({ title: "Seller's own task" })]));
    await nextMinute();
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("MI.1 gives the buyer a fresh plan when they claim the home", async () => {
    const { token } = ok<any>(await prop(seller).initiateTransfer(home));
    ok(await prop(buyer).claimTransfer(token));
    const plan = await planOf(buyer, home);
    expect(plan).toBeDefined();
    expect(plan.doneSteps).toEqual([]);
    expect(plan.tasks).toEqual([]);
    expect(typeof plan.startedAt).toBe("bigint");
    expect(plan.startedAt).toBeGreaterThan(0n);
    // The seller no longer has a role on the home.
    expect(errKey(await prop(seller).getMoveInPlan(home))).toBe("NotAuthorized");

    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await prop(buyer).inviteManager(home, { [role]: null }, role, []));
      ok(await prop(who).claimManagerRole(invite.token));
    }
    await nextMinute();
  });

  it("MI.2 lets an owner start a plan on a home they registered, once", async () => {
    second = await register(buyer, "41 Lake Dr");
    expect(ok<any>(await prop(buyer).getMoveInPlan(second))).toEqual([]);
    const first = ok<any>(await prop(buyer).startMoveInPlan(second));
    const again = ok<any>(await prop(buyer).startMoveInPlan(second));
    expect(again.startedAt).toEqual(first.startedAt);
    expect(errKey(await prop(stranger).startMoveInPlan(second))).toBe("NotAuthorized");
    expect(errKey(await prop(buyer).startMoveInPlan("no-such-home"))).toBe("NotFound");
    await nextMinute();
  });

  it("MI.3 ticks steps for people with write access", async () => {
    ok(await prop(buyer).setMoveInStep(home, "locks", true));
    ok(await prop(manager).setMoveInStep(home, "shutoffs", true));
    ok(await prop(buyer).setMoveInStep(home, "locks", true)); // twice is still once
    expect((await planOf(viewer, home)).doneSteps).toEqual(["locks", "shutoffs"]);

    const after = ok<any>(await prop(buyer).setMoveInStep(home, "locks", false));
    expect(after.doneSteps).toEqual(["shutoffs"]);

    expect(errKey(await prop(viewer).setMoveInStep(home, "locks", true))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).setMoveInStep(home, "locks", true))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getMoveInPlan(home))).toBe("NotAuthorized");
    for (const bad of ["", "has space", "x".repeat(65), "semi;colon"]) {
      expect(errKey(await prop(buyer).setMoveInStep(home, bad, true))).toBe("InvalidInput");
    }
    await nextMinute();
  });

  it("MI.4 keeps the inspection tasks the owner reviewed", async () => {
    const plan = ok<any>(
      await prop(buyer).addMoveInTasks(home, [
        task({ title: "  Replace cracked GFCI outlet in the kitchen  " }),
        task({ title: "Clean dryer vent", area: "Appliances", urgency: { Repair: null }, detail: "" }),
        task({ title: "Watch the stain on the garage ceiling", area: "Roof", urgency: { Monitor: null } }),
      ]),
    );
    expect(plan.tasks.map((t: any) => t.title)).toEqual([
      "Replace cracked GFCI outlet in the kitchen",
      "Clean dryer vent",
      "Watch the stain on the garage ceiling",
    ]);
    const ids = plan.tasks.map((t: any) => t.id as string);
    expect(new Set(ids).size).toBe(3);
    expect(plan.tasks[2].urgency).toEqual({ Monitor: null });

    // A task's tick uses its id.
    ok(await prop(buyer).setMoveInStep(home, ids[1], true));
    expect((await planOf(buyer, home)).doneSteps).toContain(ids[1]);

    const bad = [
      [],
      [task({ title: " " })],
      [task({ title: "x".repeat(121) })],
      [task({ detail: "x".repeat(501) })],
      [task({ area: "x".repeat(41) })],
      Array.from({ length: 26 }, (_, i) => task({ title: `Task ${i}` })),
    ];
    for (const b of bad) expect(errKey(await prop(buyer).addMoveInTasks(home, b))).toBe("InvalidInput");
    expect(errKey(await prop(viewer).addMoveInTasks(home, [task()]))).toBe("NotAuthorized");
    await nextMinute();

    // At most 60 tasks on a plan.
    ok(
      await prop(buyer).addMoveInTasks(
        home,
        Array.from({ length: 25 }, (_, i) => task({ title: `A${i}` })),
      ),
    );
    ok(
      await prop(buyer).addMoveInTasks(
        home,
        Array.from({ length: 25 }, (_, i) => task({ title: `B${i}` })),
      ),
    );
    expect(
      errKey(
        await prop(buyer).addMoveInTasks(
          home,
          Array.from({ length: 8 }, () => task()),
        ),
      ),
    ).toBe("InvalidInput");
    await nextMinute();

    // Deleting a task drops its tick too.
    const left = ok<any>(await prop(buyer).deleteMoveInTask(home, ids[1]));
    expect(left.tasks.map((t: any) => t.id)).not.toContain(ids[1]);
    expect(left.doneSteps).not.toContain(ids[1]);
    expect(errKey(await prop(buyer).deleteMoveInTask(home, ids[1]))).toBe("NotFound");
    expect(errKey(await prop(viewer).deleteMoveInTask(home, ids[0]))).toBe("NotAuthorized");

    // Tasks and ticks need a plan.
    const third = await register(buyer, "42 Lake Dr");
    expect(errKey(await prop(buyer).setMoveInStep(third, "locks", true))).toBe("NotFound");
    expect(errKey(await prop(buyer).addMoveInTasks(third, [task()]))).toBe("NotFound");
    await nextMinute();
  });

  it("MI.5 removes the plan when the household ends it", async () => {
    ok(await prop(buyer).endMoveInPlan(second));
    expect(ok<any>(await prop(buyer).getMoveInPlan(second))).toEqual([]);
    expect(errKey(await prop(viewer).endMoveInPlan(home))).toBe("NotAuthorized");
  });

  it("MI.6 keeps the plan across an upgrade", async () => {
    const before = await planOf(buyer, home);
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect(await planOf(buyer, home)).toEqual(before);
  });

  it("MI.7 drops the owner's plans with deleteMyData", async () => {
    await nextMinute();
    ok(await prop(buyer).deleteMyData());
    expect(errKey(await prop(buyer).getMoveInPlan(home))).toBe("NotFound");
  });
});
