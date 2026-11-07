/**
 * Contents inventory (issue #711, part 3): the household lists what's in the
 * home, room by room, with value, for an insurance claim (property canister:
 * addInventoryItem, updateInventoryItem, deleteInventoryItem, getInventory),
 * on real property and payment canisters wired as deploy.sh wires them.
 *
 *  INV.1 owner and managers with write access can add and edit items;
 *        viewers and strangers can't
 *  INV.2 the household reads the home's inventory; a stranger is
 *        NotAuthorized and an unknown home NotFound
 *  INV.3 bad input is refused: empty name, zero or huge quantity, oversized
 *        value or text, a malformed purchase date, a room on another home
 *  INV.4 an item can be moved to another room or left without one
 *  INV.5 deleting an item removes it; unknown items are NotFound
 *  INV.6 items survive an upgrade (new stable side map)
 *  INV.7 a claimed transfer drops the seller's inventory; deleteMyData drops
 *        the owner's
 *
 * Run: cd tests/upgrade && npx vitest run property-inventory.canister.test.ts
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

describe("contents inventory", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let otherHome = "";
  let livingRoom = "";
  let bedroom = "";
  let otherHomesRoom = "";
  let tv = "";

  const admin = createIdentity("inv-admin");
  const owner = createIdentity("inv-owner");
  const manager = createIdentity("inv-manager");
  const viewer = createIdentity("inv-viewer");
  const stranger = createIdentity("inv-stranger");
  const buyer = createIdentity("inv-buyer");

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
  const item = (over: Record<string, unknown> = {}) => ({
    roomId: [livingRoom],
    name: "65-inch TV",
    category: "Electronics",
    quantity: 1n,
    valueCents: [129_900n],
    purchaseDate: "2024-11-29",
    serialNumber: "SN-123",
    notes: "Wall mounted",
    ...over,
  });
  const inventory = async (who: Identity, id = home) => ok<any[]>(await prop(who).getInventory(id));
  const register = async (address: string) =>
    ok<any>(
      await prop(owner).registerProperty({
        address,
        city: "Miami",
        state: "FL",
        zipCode: "33101",
        propertyType: { SingleFamily: null },
        yearBuilt: 2010n,
        squareFeet: 2100n,
        tier: { Pro: null },
      }),
    ).id as string;
  const room = async (propertyId: string, name: string) =>
    ok<any>(
      await prop(owner).createRoom({
        propertyId,
        name,
        floorName: "1",
        floorType: "",
        paintColor: "",
        paintBrand: "",
        paintCode: "",
        notes: "",
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

    home = await register("8 Inventory Ave");
    otherHome = await register("10 Inventory Ave");
    livingRoom = await room(home, "Living room");
    bedroom = await room(home, "Bedroom");
    otherHomesRoom = await room(otherHome, "Garage");
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

  it("INV.1 lets the owner and managers add and edit items, not viewers or strangers", async () => {
    const added = ok<any>(await prop(owner).addInventoryItem(home, item()));
    tv = added.id;
    expect(tv).toMatch(/^[0-9a-f-]{36}$/);
    expect(added).toMatchObject({ propertyId: home, roomId: [livingRoom], name: "65-inch TV", quantity: 1n });

    const edited = ok<any>(await prop(manager).updateInventoryItem(tv, item({ valueCents: [119_900n] })));
    expect(edited.valueCents).toEqual([119_900n]);
    expect(edited.createdAt).toBe(added.createdAt);

    expect(errKey(await prop(viewer).addInventoryItem(home, item()))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).addInventoryItem(home, item()))).toBe("NotAuthorized");
    expect(errKey(await prop(viewer).updateInventoryItem(tv, item()))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).deleteInventoryItem(tv))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).addInventoryItem("no-such-home", item()))).toBe("NotFound");
  });

  it("INV.2 shows the inventory to the household only", async () => {
    ok(await prop(owner).addInventoryItem(home, item({ roomId: [bedroom], name: "Dresser", category: "Furniture" })));
    const names = (await inventory(owner)).map((i) => i.name).sort();
    expect(names).toEqual(["65-inch TV", "Dresser"]);
    expect((await inventory(viewer)).map((i) => i.name).sort()).toEqual(names);
    expect(errKey(await prop(stranger).getInventory(home))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).getInventory("no-such-home"))).toBe("NotFound");
    expect(await inventory(owner, otherHome)).toEqual([]);
  });

  it("INV.3 refuses bad input", async () => {
    await nextMinute();
    const bad = [
      item({ name: "  " }),
      item({ name: "x".repeat(101) }),
      item({ category: "x".repeat(41) }),
      item({ quantity: 0n }),
      item({ quantity: 1000n }),
      item({ valueCents: [10_000_000_001n] }),
      item({ purchaseDate: "11/29/2024" }),
      item({ purchaseDate: "1899-12-31" }),
      item({ purchaseDate: "2024-02-30" }),
      item({ serialNumber: "x".repeat(101) }),
      item({ notes: "x".repeat(501) }),
      item({ roomId: [otherHomesRoom] }),
      item({ roomId: ["no-such-room"] }),
    ];
    for (const i of bad) {
      expect(errKey(await prop(owner).addInventoryItem(home, i))).toBe("InvalidInput");
    }
    await nextMinute();
    for (const i of bad) {
      expect(errKey(await prop(owner).updateInventoryItem(tv, i))).toBe("InvalidInput");
    }
    // No purchase date and no value are fine, and so is an heirloom bought before 2000.
    await nextMinute();
    ok(await prop(owner).addInventoryItem(home, item({ name: "Rug", purchaseDate: "", valueCents: [] })));
    ok(await prop(owner).updateInventoryItem(tv, item({ purchaseDate: "1987-06-01" })));
  });

  it("INV.4 moves an item to another room or leaves it without one", async () => {
    expect(ok<any>(await prop(owner).updateInventoryItem(tv, item({ roomId: [bedroom] }))).roomId).toEqual([bedroom]);
    expect(ok<any>(await prop(owner).updateInventoryItem(tv, item({ roomId: [] }))).roomId).toEqual([]);
  });

  it("INV.5 deletes an item; unknown items are NotFound", async () => {
    const rug = (await inventory(owner)).find((i) => i.name === "Rug");
    ok(await prop(manager).deleteInventoryItem(rug.id));
    expect((await inventory(owner)).some((i) => i.name === "Rug")).toBe(false);
    expect(errKey(await prop(owner).deleteInventoryItem(rug.id))).toBe("NotFound");
    expect(errKey(await prop(owner).updateInventoryItem("no-such-item", item()))).toBe("NotFound");
  });

  it("INV.6 keeps the inventory across an upgrade", async () => {
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect((await inventory(owner)).map((i) => i.name).sort()).toEqual(["65-inch TV", "Dresser"]);
  });

  it("INV.7 drops the seller's inventory on a claimed transfer and the owner's on deleteMyData", async () => {
    await nextMinute();
    const kept = ok<any>(
      await prop(owner).addInventoryItem(otherHome, item({ roomId: [otherHomesRoom], name: "Bike" })),
    );
    const { token } = ok<any>(await prop(owner).initiateTransfer(home));
    ok(await prop(buyer).claimTransfer(token));
    expect(await inventory(buyer)).toEqual([]);
    expect(errKey(await prop(buyer).updateInventoryItem(tv, item({ roomId: [] })))).toBe("NotFound");

    ok(await prop(owner).deleteMyData());
    expect(errKey(await prop(admin).updateInventoryItem(kept.id, item({ roomId: [] })))).toBe("NotFound");
  });
});
