/**
 * Canister-level checks for the 2026-10-28 security re-audit fixes, on real
 * property, listing, photo, job and report canisters wired together.
 *
 *   H-1 photo: a listing photo can only be filed under its own property
 *   H-2 job:   relayCheckInboxToken answers only the inbox relay, and says
 *              "full" once an inbox can't take more drafts today
 *   M-3 report: no signed certificate for an unverified home
 *   M-6 property: a transfer drops the seller's ID check and takes down the
 *              seller's live FSBO listing
 *   L-1 photo: getMyOffChainPhotoIds lists only the caller's off-chain photos
 *
 * Run: cd tests/upgrade && npx vitest run security-2026-10-28.canister.test.ts
 * (needs .dfx/local/canisters/{property,listing,photo,job,report}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath, withMethods, unitResult } from "./__helpers__/setup";
import { idlFactory as propertyIdl } from "../../packages/shared/src/declarations/property";
import { idlFactory as listingIdl }  from "../../packages/shared/src/declarations/listing";
import { idlFactory as photoIdl }    from "../../packages/shared/src/declarations/photo";
import { idlFactory as jobIdl }      from "../../packages/shared/src/declarations/job";
import { idlFactory as reportIdl }   from "../../packages/shared/src/declarations/report";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => typeof v === "bigint" ? v.toString() : v)}`);
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

const hash = (c: string) => c.repeat(64);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

describe("2026-10-28 security fixes", () => {
  let pic: PocketIc;
  let property: any;
  let listing: any;
  let photo: any;
  let job: any;
  let report: any;
  let homeA = "";   // alice's
  let homeB = "";   // mallory's

  const admin   = createIdentity("sec28-admin");
  const alice   = createIdentity("sec28-seller");
  const mallory = createIdentity("sec28-other");
  const bob     = createIdentity("sec28-buyer");
  const relay   = createIdentity("sec28-relay");

  async function bootstrapAdmin(actor: any) {
    await actor.setBootstrapNonce("n");   // as the controller
    actor.setIdentity(admin);
    ok(await actor.addAdmin(admin.getPrincipal(), "n"));
  }

  async function register(who: any, address: string) {
    property.setIdentity(who);
    return ok<any>(await property.registerProperty({
      address, city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
    })).id as string;
  }

  beforeAll(async () => {
    pic = await createPic();
    const p = await pic.setupCanister({
      idlFactory: withMethods(propertyIdl, (I) => ({
        ...bootstrap(I),
        addTrustedCanister:   I.Func([I.Principal], [unitResult(I)], []),
        addIdentityRelay:     I.Func([I.Principal], [unitResult(I)], []),
        setListingCanisterId: I.Func([I.Principal], [unitResult(I)], []),
      })) as any,
      wasm: wasmPath("property"),
    });
    const l = await pic.setupCanister({ idlFactory: withMethods(listingIdl, bootstrap) as any, wasm: wasmPath("listing") });
    const ph = await pic.setupCanister({ idlFactory: withMethods(photoIdl, bootstrap) as any, wasm: wasmPath("photo") });
    const j = await pic.setupCanister({ idlFactory: withMethods(jobIdl, bootstrap) as any, wasm: wasmPath("job") });
    const r = await pic.setupCanister({
      idlFactory: withMethods(reportIdl, (I) => ({
        ...bootstrap(I),
        setPropertyCanisterId: I.Func([I.Text], [unitResult(I)], []),
        issueCert: I.Func([I.Text, I.Text], [I.Variant({
          ok: I.Text,
          err: I.Variant({
            NotFound: I.Null, Expired: I.Null, Revoked: I.Null, NotAuthorized: I.Null,
            InvalidInput: I.Text, UnverifiedProperty: I.Null,
          }),
        })], []),
      })) as any,
      wasm: wasmPath("report"),
    });
    property = p.actor; listing = l.actor; photo = ph.actor; job = j.actor; report = r.actor;

    for (const a of [property, listing, photo, job, report]) await bootstrapAdmin(a);
    ok(await property.addTrustedCanister(r.canisterId));
    ok(await property.addIdentityRelay(relay.getPrincipal()));
    ok(await property.setListingCanisterId(l.canisterId));
    ok(await listing.setPropertyCanisterId(p.canisterId.toText()));
    ok(await photo.setPropertyCanisterId(p.canisterId));
    ok(await job.setPropertyCanisterId(p.canisterId.toText()));
    ok(await job.addInboxRelay(relay.getPrincipal()));
    ok(await report.setPropertyCanisterId(p.canisterId.toText()));

    homeA = await register(alice, "12 Elm Street");
    homeB = await register(mallory, "99 Oak Avenue");
  });

  afterAll(async () => { await pic?.tearDown(); });

  describe("H-1 listing photos", () => {
    it("refuses a photo filed under another property's listing", async () => {
      photo.setIdentity(mallory);
      const r = await photo.uploadPhoto(`LISTING_${homeA}`, homeB, { Listing: null }, "", hash("a"), PNG);
      expect(errKey(r)).toBe("InvalidInput");
      expect(JSON.stringify(r.err)).toMatch(/their own property/);
      // Nor under the other property itself: mallory can't write to it.
      expect(errKey(await photo.uploadPhoto(`LISTING_${homeA}`, homeA, { Listing: null }, "", hash("b"), PNG))).toBe("NotAuthorized");
      expect(await photo.getPublicListingPhotos(homeA)).toEqual([]);
    });

    it("publishes the owner's own listing photo, and only on that listing", async () => {
      photo.setIdentity(alice);
      const mine = ok<any>(await photo.uploadPhoto(`LISTING_${homeA}`, homeA, { Listing: null }, "Front", hash("c"), PNG));
      expect((await photo.getPublicListingPhotos(homeA)).map((x: any) => x.id)).toEqual([mine.id]);
      expect(await photo.getPublicListingPhotos(homeB)).toEqual([]);
    });

    it("a photo on an ordinary job is never public", async () => {
      photo.setIdentity(mallory);
      ok(await photo.uploadPhoto("JOB_1", homeB, { Finishing: null }, "", hash("d"), PNG));
      expect(await photo.getPublicListingPhotos(homeB)).toEqual([]);
    });
  });

  describe("L-1 off-chain photo ids", () => {
    it("lists only the caller's off-chain photos", async () => {
      photo.setIdentity(alice);
      const off = ok<any>(await photo.beginUpload("JOB_2", homeA, { Finishing: null }, "", hash("e"), 1234n));
      expect(await photo.getMyOffChainPhotoIds()).toEqual([off.id]);   // the on-chain listing photo isn't in it
      photo.setIdentity(mallory);
      expect(await photo.getMyOffChainPhotoIds()).toEqual([]);
    });
  });

  describe("H-2 inbox token check", () => {
    const draft = (n: number) => ({
      fromAddress: "billing@plumber.example", subject: `Invoice ${n}`, title: `Invoice ${n}`,
      serviceType: "Plumbing", contractorName: "Ace Plumbing", amountCents: 12_000n,
      completedDate: "2026-10-01", warrantyMonths: 0n, description: "",
    });

    it("answers only the inbox relay, and only for real tokens", async () => {
      job.setIdentity(alice);
      const token = ok<string>(await job.getMyInboxToken());

      job.setIdentity(relay);
      expect(await job.relayCheckInboxToken(token)).toEqual({ accepting: null });
      expect(await job.relayCheckInboxToken("0000000000")).toEqual({ unknown: null });

      // Anyone else learns nothing, not even whether the token exists.
      job.setIdentity(mallory);
      expect(await job.relayCheckInboxToken(token)).toEqual({ unknown: null });
    });

    it("says full once the inbox has taken today's drafts", async () => {
      job.setIdentity(alice);
      const token = ok<string>(await job.getMyInboxToken());
      job.setIdentity(relay);
      let filed = 0;
      while ("accepting" in (await job.relayCheckInboxToken(token))) {
        ok(await job.relayAddEmailDraft(token, draft(filed)));
        filed++;
        if (filed > 100) throw new Error("inbox never filled");
      }
      expect(await job.relayCheckInboxToken(token)).toEqual({ full: null });
      // The check agrees with what relayAddEmailDraft would do.
      expect(errKey(await job.relayAddEmailDraft(token, draft(filed)))).toBe("InvalidInput");
      expect(filed).toBe(30);
    });
  });

  describe("M-3 certificates", () => {
    it("are refused for an unverified home, before any signing", async () => {
      report.setIdentity(alice);
      expect(errKey(await report.issueCert(homeA, "{}"))).toBe("UnverifiedProperty");
      report.setIdentity(mallory);
      expect(errKey(await report.issueCert(homeA, "{}"))).toBe("NotAuthorized");
    });

    it("pass the verification gate once the home is verified", async () => {
      property.setIdentity(admin);
      ok(await property.verifyProperty(homeA, { Basic: null }, []));
      report.setIdentity(alice);
      // Past the gate it needs the job and market canisters, which this test doesn't wire.
      const r = await report.issueCert(homeA, "{}");
      expect(errKey(r)).toBe("InvalidInput");
      expect(JSON.stringify(r.err)).toMatch(/not configured/);
    });
  });

  describe("M-6 transfers", () => {
    it("drop the seller's ID check and take down the seller's listing", async () => {
      // The seller passed Stripe Identity and has a live FSBO listing.
      property.setIdentity(relay);
      ok(await property.relayMarkIdentityCleared(homeA, alice.getPrincipal(), "vs_test_123", "Alice Seller"));
      listing.setIdentity(alice);
      ok(await listing.saveFsboDraft(homeA, 42_500_000n, ["Bright corner lot."], 3n));
      ok(await listing.activateFsboListing({
        propertyId: homeA, homeowner: alice.getPrincipal(), listPriceCents: 42_500_000n, activatedAt: 0n,
        address: "12 Elm Street", city: "Orlando", state: "FL", zipCode: "32801",
        propertyType: "SingleFamily", yearBuilt: 1998n, squareFeet: 1850n, bedrooms: 3n, bathrooms: 2n,
        verificationLevel: "Basic", score: [], verifiedJobCount: 0n, hasPublicReport: false,
        description: ["Bright corner lot."], photoUrl: [], systemHighlights: [],
      }));
      expect(await listing.getFsboListing(homeA)).toHaveLength(1);

      property.setIdentity(alice);
      const before = ok<any>(await property.getProperty(homeA));
      expect(before.identityVerified).toEqual([true]);
      const pending = ok<any>(await property.initiateTransfer(homeA));

      property.setIdentity(bob);
      const claimed = ok<any>(await property.claimTransfer(pending.token));
      expect(claimed.owner.toText()).toBe(bob.getPrincipal().toText());
      expect(claimed.identityVerified).toEqual([]);
      expect(claimed.identitySessionId).toEqual([]);
      expect(claimed.nameOnId).toEqual([]);

      expect(await listing.getFsboListing(homeA)).toEqual([]);
      listing.setIdentity(alice);
      expect(errKey(await listing.updateFsboPrice(homeA, 1n))).toMatch(/NotFound|NotAuthorized/);
    });

    it("only the property canister can take a listing down", async () => {
      listing.setIdentity(mallory);
      expect(errKey(await listing.propertyTransferred(homeB))).toBe("NotAuthorized");
      listing.setIdentity(admin);
      expect(errKey(await listing.propertyTransferred(homeB))).toBe("NotAuthorized");
    });
  });
});
