/**
 * House guide for sitters and guests (issue #725): the household writes down
 * Wi-Fi, alarm, trash days, shutoffs and contacts (property canister,
 * setHouseGuide / getHouseGuide) and shares only that guide through an
 * expiring, revocable link (createHouseGuideLink, listHouseGuideLinks,
 * revokeHouseGuideLink, getSharedHouseGuide). Shutoff photos the owner picks
 * are readable through the link (guideSharesPhoto on property; photo canister
 * getGuidePhotoData and guidePhotoAccess), on real property, payment and photo
 * canisters wired as deploy.sh wires them.
 *
 *  HG.1 owner and managers with write access can save the guide; viewers and
 *       strangers can't; the household reads it, a stranger can't
 *  HG.2 bad input is refused
 *  HG.3 links: write access only, need a saved guide, expire in 1 to 90
 *       days, at most 10 live per home; anyone with the token reads only the
 *       guide and address; revoked and expired links read as NotFound
 *  HG.4 a link exposes only the photos the guide lists, from that home
 *  HG.5 the photo canister serves a listed photo to anyone with the link and
 *       nothing else; guidePhotoAccess is for photo relays only
 *  HG.6 the guide and links survive an upgrade; clearing the guide ends its links
 *  HG.7 a claimed transfer drops the seller's guide and links; deleteMyData
 *       drops the owner's
 *  HG.8 dead (revoked or expired) links are pruned, so storage per home stays
 *       bounded however many links are made and turned off
 *
 * Run: cd tests/upgrade && npx vitest run property-house-guide.canister.test.ts
 * (needs .dfx/local/canisters/{property,payment,photo}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { createHash } from "crypto";
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

const CANISTERS = ["property", "payment", "photo"] as const;
type Name = (typeof CANISTERS)[number];
const DAY_MS = 86_400_000;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const image = (seed: number) => new Uint8Array(Array.from({ length: 512 }, (_, i) => (i * seed + 7) & 0xff));

describe("house guide", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let home = "";
  let otherHome = "";
  let shutoffPhoto = "";
  let panelPhoto = "";
  let otherHomesPhoto = "";
  let liveToken = "";

  const admin = createIdentity("hg-admin");
  const owner = createIdentity("hg-owner");
  const manager = createIdentity("hg-manager");
  const viewer = createIdentity("hg-viewer");
  const stranger = createIdentity("hg-stranger");
  const buyer = createIdentity("hg-buyer");
  const relay = createIdentity("hg-relay");

  const as = (name: Name, who: Identity | null) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    if (who) a.setIdentity(who);
    return a;
  };
  const prop = (who: Identity | null) => as("property", who);
  const photo = (who: Identity | null) => as("photo", who);
  const nextMinute = async () => {
    await pic.advanceTime(61_000);
    await pic.tick();
  };
  const guide = (over: Record<string, unknown> = {}) => ({
    wifiName: "Lake House",
    wifiPassword: "correct horse",
    alarm: "Panel by the garage door. Code 4821, then OFF.",
    trashDay: "Tuesday night, out by the curb",
    recyclingDay: "Every other Friday",
    waterShutoff: "Garage, left wall, red handle",
    gasShutoff: "",
    electricPanel: "Hall closet",
    contacts: [{ name: "Ana (neighbour)", role: "Spare key", phone: "407-555-0142" }],
    notes: "Feed the cat at 7am and 6pm.",
    photoIds: [] as string[],
    ...over,
  });
  const register = async (address: string) =>
    ok<any>(
      await prop(owner).registerProperty({
        address,
        city: "Orlando",
        state: "FL",
        zipCode: "32801",
        propertyType: { SingleFamily: null },
        yearBuilt: 2004n,
        squareFeet: 1800n,
        tier: { Pro: null },
      }),
    ).id as string;
  const upload = async (propertyId: string, seed: number, description: string) => {
    const bytes = image(seed);
    return ok<any>(
      await photo(owner).uploadPhoto(
        `baseline_${propertyId}`,
        propertyId,
        { PostConstruction: null },
        description,
        sha256(bytes),
        bytes,
      ),
    ).id as string;
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
    ok(await prop(admin).setPaymentCanisterId(ids.payment));
    ok(await photo(admin).setPropertyCanisterId(ids.property));
    ok(await photo(admin).setPaymentCanisterId(ids.payment));
    ok(await photo(admin).addPhotoRelay(relay.getPrincipal()));
    ok(await prop(admin).addTrustedCanister(ids.photo));
    ok(await as("payment", admin).adminActivateStripeSubscription(owner.getPrincipal(), { Pro: null }, 12n));

    home = await register("12 Guide Lane");
    otherHome = await register("14 Guide Lane");
    for (const [who, role] of [
      [manager, "Manager"],
      [viewer, "Viewer"],
    ] as const) {
      const invite = ok<any>(await prop(owner).inviteManager(home, { [role]: null }, role, []));
      ok(await prop(who).claimManagerRole(invite.token));
    }
    shutoffPhoto = await upload(home, 3, "shutoff");
    panelPhoto = await upload(home, 5, "electrical");
    otherHomesPhoto = await upload(otherHome, 11, "shutoff");
    await nextMinute();
  }, 180_000);

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("HG.1 lets the owner and managers save the guide, and shows it to the household only", async () => {
    expect(ok<any>(await prop(owner).getHouseGuide(home))).toEqual([]);
    ok(await prop(owner).setHouseGuide(home, [guide()]));
    ok(await prop(manager).setHouseGuide(home, [guide({ notes: "Feed the cat twice a day." })]));

    const saved = ok<any[]>(await prop(viewer).getHouseGuide(home))[0];
    expect(saved).toMatchObject({ wifiName: "Lake House", notes: "Feed the cat twice a day." });
    expect(saved.contacts).toEqual([{ name: "Ana (neighbour)", role: "Spare key", phone: "407-555-0142" }]);
    expect(typeof saved.updatedAt).toBe("bigint");

    expect(errKey(await prop(viewer).setHouseGuide(home, [guide()]))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).setHouseGuide(home, [guide()]))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).getHouseGuide(home))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).getHouseGuide("no-such-home"))).toBe("NotFound");
    expect(errKey(await prop(owner).setHouseGuide("no-such-home", [guide()]))).toBe("NotFound");
  });

  it("HG.2 refuses bad input", async () => {
    await nextMinute();
    const contact = { name: "Ana", role: "", phone: "" };
    const bad = [
      guide({ wifiName: "x".repeat(101) }),
      guide({ wifiPassword: "x".repeat(101) }),
      guide({ alarm: "x".repeat(501) }),
      guide({ trashDay: "x".repeat(201) }),
      guide({ waterShutoff: "x".repeat(501) }),
      guide({ notes: "x".repeat(4001) }),
      guide({ contacts: Array.from({ length: 11 }, () => contact) }),
      guide({ contacts: [{ ...contact, name: "  " }] }),
      guide({ contacts: [{ ...contact, phone: "x".repeat(41) }] }),
      guide({ photoIds: Array.from({ length: 7 }, (_, i) => `p${i}`) }),
      guide({ photoIds: ["bad id!"] }),
    ];
    for (const g of bad) {
      expect(errKey(await prop(owner).setHouseGuide(home, [g]))).toBe("InvalidInput");
    }
    // An empty guide has nothing to share.
    const empty = guide({
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
    });
    expect(errKey(await prop(owner).setHouseGuide(home, [empty]))).toBe("InvalidInput");
  });

  it("HG.3 shares the guide through expiring, revocable links", async () => {
    await nextMinute();
    // No guide yet on the other home: nothing to share.
    expect(errKey(await prop(owner).createHouseGuideLink(otherHome, "Sitter", 7n))).toBe("InvalidInput");
    expect(errKey(await prop(viewer).createHouseGuideLink(home, "Sitter", 7n))).toBe("NotAuthorized");
    expect(errKey(await prop(owner).createHouseGuideLink(home, "Sitter", 0n))).toBe("InvalidInput");
    expect(errKey(await prop(owner).createHouseGuideLink(home, "Sitter", 91n))).toBe("InvalidInput");
    expect(errKey(await prop(owner).createHouseGuideLink(home, "x".repeat(61), 7n))).toBe("InvalidInput");

    const link = ok<any>(await prop(manager).createHouseGuideLink(home, "  Cat sitter  ", 7n));
    expect(link.token).toMatch(/^[0-9a-f]{64}$/);
    expect(link).toMatchObject({ propertyId: home, name: "Cat sitter", revoked: false });
    const now = BigInt(await pic.getTime()) * 1_000_000n;
    expect(link.expiresAt - now).toBeGreaterThan(BigInt(7 * DAY_MS - 60_000) * 1_000_000n);
    liveToken = link.token;

    // Anyone, signed in or not, reads only the guide and the address.
    const shared = ok<any>(await prop(null).getSharedHouseGuide(liveToken));
    expect(Object.keys(shared).sort()).toEqual(["address", "city", "expiresAt", "guide", "state", "zipCode"]);
    expect(shared).toMatchObject({ address: "12 Guide Lane", city: "Orlando", state: "FL" });
    expect(shared.guide.wifiPassword).toBe("correct horse");
    expect(errKey(await prop(null).getSharedHouseGuide("f".repeat(64)))).toBe("NotFound");

    // Links are bearer tokens: viewers and strangers don't see them.
    expect(ok<any[]>(await prop(owner).listHouseGuideLinks(home)).map((l) => l.token)).toEqual([liveToken]);
    expect(errKey(await prop(viewer).listHouseGuideLinks(home))).toBe("NotAuthorized");
    expect(errKey(await prop(stranger).listHouseGuideLinks(home))).toBe("NotAuthorized");

    // Revoking ends it at once.
    const second = ok<any>(await prop(owner).createHouseGuideLink(home, "Cleaner", 1n));
    expect(errKey(await prop(viewer).revokeHouseGuideLink(second.token))).toBe("NotAuthorized");
    ok(await prop(owner).revokeHouseGuideLink(second.token));
    expect(errKey(await prop(null).getSharedHouseGuide(second.token))).toBe("NotFound");
    expect(errKey(await prop(owner).revokeHouseGuideLink("f".repeat(64)))).toBe("NotFound");

    // A 1-day link stops working after a day.
    const shortLink = ok<any>(await prop(owner).createHouseGuideLink(home, "Weekend guest", 1n));
    ok(await prop(null).getSharedHouseGuide(shortLink.token));
    await pic.advanceTime(DAY_MS + 1000);
    await pic.tick();
    expect(errKey(await prop(null).getSharedHouseGuide(shortLink.token))).toBe("NotFound");
    ok(await prop(null).getSharedHouseGuide(liveToken));

    // At most 10 live links per home; revoked and expired ones don't count.
    await nextMinute();
    for (let i = 0; i < 9; i++) ok(await prop(owner).createHouseGuideLink(home, `Guest ${i}`, 30n));
    expect(errKey(await prop(owner).createHouseGuideLink(home, "One too many", 30n))).toBe("InvalidInput");
  });

  it("HG.4 exposes only the photos the guide lists, from that home", async () => {
    await nextMinute();
    ok(await prop(owner).setHouseGuide(home, [guide({ photoIds: [shutoffPhoto] })]));
    expect(await prop(null).guideSharesPhoto(liveToken, home, shutoffPhoto)).toBe(true);
    expect(await prop(null).guideSharesPhoto(liveToken, home, panelPhoto)).toBe(false);
    // The photo must be on the guide's own home.
    expect(await prop(null).guideSharesPhoto(liveToken, otherHome, shutoffPhoto)).toBe(false);
    expect(await prop(null).guideSharesPhoto("f".repeat(64), home, shutoffPhoto)).toBe(false);
  });

  it("HG.5 serves a listed photo to anyone with the link, and nothing else", async () => {
    const bytes = ok<any>(await photo(null).getGuidePhotoData(liveToken, shutoffPhoto));
    expect(sha256(new Uint8Array(bytes))).toBe(sha256(image(3)));
    expect(errKey(await photo(null).getGuidePhotoData(liveToken, panelPhoto))).toBe("NotFound");
    expect(errKey(await photo(null).getGuidePhotoData(liveToken, otherHomesPhoto))).toBe("NotFound");
    expect(errKey(await photo(null).getGuidePhotoData("f".repeat(64), shutoffPhoto))).toBe("NotFound");
    expect(errKey(await photo(null).getGuidePhotoData(liveToken, "no-such-photo"))).toBe("NotFound");

    // The Worker's check for off-chain bytes: relays only.
    const access = await photo(relay).guidePhotoAccess(shutoffPhoto, liveToken);
    expect(access[0]).toMatchObject({ canRead: true, isPublic: false, offChain: false });
    expect((await photo(relay).guidePhotoAccess(panelPhoto, liveToken))[0].canRead).toBe(false);
    expect(await photo(stranger).guidePhotoAccess(shutoffPhoto, liveToken)).toEqual([]);
  });

  it("HG.8 prunes dead links so a home's link list stays bounded", async () => {
    await nextMinute();
    const others = ok<any[]>(await prop(owner).listHouseGuideLinks(home)).filter(
      (l) => l.token !== liveToken && !l.revoked,
    );
    for (const l of others) ok(await prop(owner).revokeHouseGuideLink(l.token));
    for (let i = 0; i < 25; i++) {
      if (i % 10 === 0) await nextMinute();
      const l = ok<any>(await prop(owner).createHouseGuideLink(home, `Churn ${i}`, 1n));
      ok(await prop(owner).revokeHouseGuideLink(l.token));
    }
    const left = ok<any[]>(await prop(owner).listHouseGuideLinks(home));
    // At most 19 dead links survive a create, plus the one just turned off.
    expect(left.filter((l) => l.revoked).length).toBeLessThanOrEqual(20);
    expect(left.length).toBeLessThanOrEqual(30);
    expect(left.some((l) => l.token === liveToken && !l.revoked)).toBe(true);
    // The newest dead links are the ones kept.
    expect(left.some((l) => l.name === "Churn 24")).toBe(true);
    expect(left.some((l) => l.name === "Churn 0")).toBe(false);
  });

  it("HG.6 keeps the guide and links across an upgrade; clearing the guide ends its links", async () => {
    await pic.upgradeCanister({ canisterId: ids.property, wasm: readFileSync(wasmPath("property")) });
    expect(ok<any[]>(await prop(owner).getHouseGuide(home))[0].wifiName).toBe("Lake House");
    ok(await prop(null).getSharedHouseGuide(liveToken));

    await nextMinute();
    ok(await prop(owner).setHouseGuide(home, []));
    expect(ok<any>(await prop(owner).getHouseGuide(home))).toEqual([]);
    expect(errKey(await prop(null).getSharedHouseGuide(liveToken))).toBe("NotFound");
    expect(ok<any[]>(await prop(owner).listHouseGuideLinks(home))).toEqual([]);
  });

  it("HG.7 drops the seller's guide on a claimed transfer and the owner's on deleteMyData", async () => {
    await nextMinute();
    ok(await prop(owner).setHouseGuide(home, [guide()]));
    const sellersLink = ok<any>(await prop(owner).createHouseGuideLink(home, "Sitter", 7n));
    ok(await prop(owner).setHouseGuide(otherHome, [guide({ wifiName: "Other" })]));
    const otherLink = ok<any>(await prop(owner).createHouseGuideLink(otherHome, "Sitter", 7n));

    const { token } = ok<any>(await prop(owner).initiateTransfer(home));
    ok(await prop(buyer).claimTransfer(token));
    expect(ok<any>(await prop(buyer).getHouseGuide(home))).toEqual([]);
    expect(errKey(await prop(null).getSharedHouseGuide(sellersLink.token))).toBe("NotFound");
    expect(ok<any[]>(await prop(buyer).listHouseGuideLinks(home))).toEqual([]);

    ok(await prop(owner).deleteMyData());
    expect(errKey(await prop(null).getSharedHouseGuide(otherLink.token))).toBe("NotFound");
  });
});
