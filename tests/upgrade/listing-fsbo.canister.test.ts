/**
 * Listing canister — FSBO seller flow, against a real property canister.
 *
 * Covers what the frontend unit tests can only mock: ownership checks through
 * the property canister, going live, showing requests and their limits, the
 * seller's offer log, score visibility, the notification outbox, taking a
 * listing down, account deletion and an upgrade in the middle of it all.
 *
 * Run: cd tests/upgrade && npx vitest run listing-fsbo.canister.test.ts
 * (needs .dfx/local/canisters/{listing,property}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { createPic, wasmPath } from "./__helpers__/setup";
import { idlFactory as listingIdl }  from "../../packages/shared/src/declarations/listing";
import { idlFactory as propertyIdl } from "../../packages/shared/src/declarations/property";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r) throw new Error(`Expected ok, got err: ${JSON.stringify(r.err)}`);
  return r.ok;
}
function errKey(r: R<unknown>): string {
  if (!("err" in r)) throw new Error(`Expected err, got ok: ${JSON.stringify(r.ok, (_, v) => typeof v === "bigint" ? v.toString() : v)}`);
  return Object.keys(r.err)[0];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The shared declarations leave out the admin bootstrap; tests need it. */
const withBootstrap = (factory: (a: { IDL: any }) => any) => ({ IDL: I }: { IDL: any }) => {
  const Error = I.Variant({
    NotFound: I.Null, NotAuthorized: I.Null, InvalidInput: I.Text,
    AlreadyCancelled: I.Null, DeadlinePassed: I.Null, SlotsFull: I.Null,
  });
  return I.Service({
    ...Object.fromEntries(factory({ IDL: I })._fields),
    setBootstrapNonce: I.Func([I.Text], [], []),
    addAdmin:          I.Func([I.Principal, I.Text], [I.Variant({ ok: I.Null, err: Error })], []),
  });
};

describe("listing canister — FSBO", () => {
  let pic: PocketIc;
  let listing:  any;
  let property: any;
  let listingId: any;
  let propertyId = "";

  const alice  = createIdentity("fsbo-seller");     // owns the property
  const bob    = createIdentity("fsbo-buyer");
  const mallory = createIdentity("fsbo-other");     // signed in, owns nothing
  const relay  = createIdentity("fsbo-relay");
  const admin  = createIdentity("fsbo-admin");

  // Buyers' showing requests arrive through the Worker (the showing relay).
  function ask(who: any, name: string, contact: string, preferredTime: string) {
    listing.setIdentity(relay);
    return listing.relayRequestShowing(propertyId, who.getPrincipal(), name, contact, preferredTime);
  }

  function liveListing(priceCents: bigint) {
    return {
      propertyId, homeowner: alice.getPrincipal(), listPriceCents: priceCents, activatedAt: 0n,
      address: "12 Elm Street", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: "SingleFamily", yearBuilt: 1998n, squareFeet: 1850n,
      bedrooms: 3n, bathrooms: 2n,
      // The canister replaces these with what it looks up itself.
      verificationLevel: "Premium", score: [99n], verifiedJobCount: 50n, hasPublicReport: true,
      description: ["Bright corner lot."], photoUrl: [], systemHighlights: ["New roof 2023"],
    };
  }

  beforeAll(async () => {
    pic = await createPic();

    const p = await pic.setupCanister({ idlFactory: propertyIdl as any, wasm: wasmPath("property") });
    property = p.actor;
    const l = await pic.setupCanister({ idlFactory: withBootstrap(listingIdl) as any, wasm: wasmPath("listing") });
    listing = l.actor;
    listingId = l.canisterId;

    await listing.setBootstrapNonce("n");   // as the controller
    listing.setIdentity(admin);
    ok(await listing.addAdmin(admin.getPrincipal(), "n"));
    ok(await listing.setPropertyCanisterId(p.canisterId.toText()));
    ok(await listing.addNotifier(relay.getPrincipal()));
    ok(await listing.addShowingRelay(relay.getPrincipal()));

    property.setIdentity(alice);
    const prop = ok<any>(await property.registerProperty({
      address: "12 Elm Street", city: "Orlando", state: "FL", zipCode: "32801",
      propertyType: { SingleFamily: null }, yearBuilt: 1998n, squareFeet: 1850n, tier: { Free: null },
    }));
    propertyId = prop.id;
  });

  afterAll(async () => { await pic?.tearDown(); });

  describe("setup before going live", () => {
    it("only the property's owner can start a listing", async () => {
      listing.setIdentity(mallory);
      expect(errKey(await listing.saveFsboDraft(propertyId, 42_500_000n, [], 1n))).toBe("NotAuthorized");
      expect(errKey(await listing.saveFsboDraft("no-such-property", 42_500_000n, [], 1n))).toBe("NotAuthorized");
    });

    it("rejects a zero price and an out-of-range step", async () => {
      listing.setIdentity(alice);
      expect(errKey(await listing.saveFsboDraft(propertyId, 0n, [], 1n))).toBe("InvalidInput");
      expect(errKey(await listing.saveFsboDraft(propertyId, 1n, [], 4n))).toBe("InvalidInput");
    });

    it("saves the draft for the seller and hides it from everyone else", async () => {
      listing.setIdentity(alice);
      const first = ok<any>(await listing.saveFsboDraft(propertyId, 42_500_000n, ["Bright corner lot."], 2n));
      const second = ok<any>(await listing.saveFsboDraft(propertyId, 43_000_000n, ["Bright corner lot."], 3n));
      expect(second.startedAt).toBe(first.startedAt);
      expect((await listing.getFsboDraft(propertyId))[0]).toMatchObject({ listPriceCents: 43_000_000n, step: 3n });

      listing.setIdentity(mallory);
      expect(await listing.getFsboDraft(propertyId)).toEqual([]);
      expect(await listing.getFsboListing(propertyId)).toEqual([]);
    });

    it("can be discarded and started again", async () => {
      listing.setIdentity(alice);
      ok(await listing.discardFsboDraft(propertyId));
      expect(await listing.getFsboDraft(propertyId)).toEqual([]);
      ok(await listing.saveFsboDraft(propertyId, 42_500_000n, ["Bright corner lot."], 3n));
    });

    it("takes showing requests only from the relay", async () => {
      listing.setIdentity(bob);
      expect(errKey(await listing.requestShowing(propertyId, "Bob", "bob@example.com", "Saturday 10am"))).toBe("NotAuthorized");
      expect(errKey(await listing.relayRequestShowing(propertyId, bob.getPrincipal(), "Bob", "bob@example.com", "Sat"))).toBe("NotAuthorized");
      expect(errKey(await listing.propertyTransferred(propertyId))).toBe("NotAuthorized");
    });

    it("refuses showings before the listing is live", async () => {
      listing.setIdentity(bob);
      expect(errKey(await ask(bob, "Bob", "bob@example.com", "Saturday 10am"))).toBe("NotFound");
    });
  });

  describe("going live", () => {
    it("only the owner can publish, and the canister fills in the facts it checks", async () => {
      listing.setIdentity(mallory);
      expect(errKey(await listing.activateFsboListing(liveListing(42_500_000n)))).toBe("NotAuthorized");

      listing.setIdentity(alice);
      ok(await listing.activateFsboListing(liveListing(42_500_000n)));
      const live = (await listing.getFsboListing(propertyId))[0];
      expect(live.homeowner.toText()).toBe(alice.getPrincipal().toText());
      expect(live.verificationLevel).toBe("Unverified");
      expect(live.verifiedJobCount).toBe(0n);   // no job canister wired
      expect(live.hasPublicReport).toBe(false); // no report canister wired
      expect(live.score).toEqual([]);           // no market canister wired
      expect(live.bedrooms).toBe(3n);
      expect((await listing.getFsboDraft(propertyId))[0].step).toBe(4n);
      expect((await listing.listActiveFsboListings()).map((x: any) => x.propertyId)).toContain(propertyId);
    });

    it("keeps a price history and only the seller can change the price", async () => {
      listing.setIdentity(mallory);
      expect(errKey(await listing.updateFsboPrice(propertyId, 1n))).toBe("NotAuthorized");

      listing.setIdentity(alice);
      ok(await listing.updateFsboPrice(propertyId, 41_000_000n));
      ok(await listing.updateFsboPrice(propertyId, 41_000_000n));   // same price: no new point
      expect(errKey(await listing.saveFsboDraft(propertyId, 1n, [], 1n))).toBe("InvalidInput");
      const history = await listing.getFsboPriceHistory(propertyId);
      expect(history.map((h: any) => h.priceCents)).toEqual([42_500_000n, 41_000_000n]);
      expect((await listing.getFsboListing(propertyId))[0].listPriceCents).toBe(41_000_000n);
    });

    it("lets the seller hide the score, and hiding survives re-publishing", async () => {
      listing.setIdentity(mallory);
      expect(errKey(await listing.setFsboScoreVisible(propertyId, false))).toBe("NotAuthorized");

      listing.setIdentity(alice);
      expect(await listing.isFsboScoreHidden(propertyId)).toBe(false);
      ok(await listing.setFsboScoreVisible(propertyId, false));
      expect(await listing.isFsboScoreHidden(propertyId)).toBe(true);
      listing.setIdentity(mallory);
      expect(await listing.isFsboScoreHidden(propertyId)).toBe(false);   // not the seller's: nothing to say
      listing.setIdentity(alice);
      ok(await listing.setFsboScoreVisible(propertyId, true));
      expect(await listing.isFsboScoreHidden(propertyId)).toBe(false);
    });
  });

  describe("showings", () => {
    let requestId = "";

    it("a buyer's request reaches the seller and the notification outbox", async () => {
      listing.setIdentity(bob);
      const req = ok<any>(await ask(bob, "Bob Buyer", "bob@example.com", "Saturday 10am"));
      requestId = req.id;
      expect(Object.keys(req.status)[0]).toBe("Pending");

      listing.setIdentity(relay);
      const page = ok<any>(await listing.getNotificationEvents(0n, 50n));
      const ev = page.events.find((e: any) => e.kind === "showing_request");
      expect(ev).toBeDefined();
      expect(ev.refId).toBe(propertyId);
      expect(ev.recipient[0].toText()).toBe(alice.getPrincipal().toText());
      expect(ev.summary).toBe("Bob Buyer");

      listing.setIdentity(mallory);
      expect(errKey(await listing.getNotificationEvents(0n, 50n))).toBe("NotAuthorized");
    });

    it("validates the request and the seller can't book their own home", async () => {
      listing.setIdentity(bob);
      expect(errKey(await ask(bob, "", "bob@example.com", "Sat"))).toBe("InvalidInput");
      expect(errKey(await ask(bob, "Bob", "b@x", "Sat"))).toBe("InvalidInput");
      expect(errKey(await ask(bob, "Bob", "bob@example.com", ""))).toBe("InvalidInput");
      listing.setIdentity(alice);
      expect(errKey(await ask(alice, "Me", "me@example.com", "Sat"))).toBe("InvalidInput");
    });

    it("only the seller sees requests and answers them", async () => {
      listing.setIdentity(bob);
      expect(errKey(await listing.getShowingRequests(propertyId))).toBe("NotAuthorized");
      expect(errKey(await listing.respondToShowing(propertyId, requestId, { Accept: null }))).toBe("NotAuthorized");

      listing.setIdentity(alice);
      const alt = ok<any>(await listing.respondToShowing(propertyId, requestId, { ProposeAlternate: "Sunday 2pm" }));
      expect(Object.keys(alt.status)[0]).toBe("AlternateProposed");
      expect(alt.alternateTime).toEqual(["Sunday 2pm"]);
      const accepted = ok<any>(await listing.respondToShowing(propertyId, requestId, { Accept: null }));
      expect(Object.keys(accepted.status)[0]).toBe("Accepted");
      expect(accepted.alternateTime).toEqual([]);
      expect(errKey(await listing.respondToShowing(propertyId, "nope", { Decline: null }))).toBe("NotFound");
      expect(errKey(await listing.respondToShowing(propertyId, requestId, { ProposeAlternate: "" }))).toBe("InvalidInput");

      const all = ok<any[]>(await listing.getShowingRequests(propertyId));
      expect(all).toHaveLength(1);
      expect(all[0].contact).toBe("bob@example.com");
    });

    it("caps open requests per buyer; a declined one frees a slot", async () => {
      listing.setIdentity(bob);
      ok(await ask(bob, "Bob Buyer", "bob@example.com", "Mon"));
      const third = ok<any>(await ask(bob, "Bob Buyer", "bob@example.com", "Tue"));
      expect(errKey(await ask(bob, "Bob Buyer", "bob@example.com", "Wed"))).toBe("InvalidInput");

      listing.setIdentity(alice);
      ok(await listing.respondToShowing(propertyId, third.id, { Decline: null }));
      listing.setIdentity(bob);
      ok(await ask(bob, "Bob Buyer", "bob@example.com", "Wed"));
    });

    it("caps requests per listing per day, and the cap resets the next day", async () => {
      // 4 so far today; 25 a day.
      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 3; j++) ok(await ask(createIdentity(`fsbo-crowd-${i}`), `Buyer ${i}`, `b${i}@example.com`, `Slot ${j}`));
      }
      expect(errKey(await ask(createIdentity("fsbo-crowd-late"), "Late", "late@example.com", "Any"))).toBe("InvalidInput");

      await pic.advanceTime(DAY_MS + 1000);
      await pic.tick();
      ok(await ask(createIdentity("fsbo-crowd-late"), "Late", "late@example.com", "Any"));
    });
  });

  describe("offers", () => {
    let first = "";
    let second = "";
    const offer = (buyerName: string, amount: bigint) => ({
      buyerName, offerAmountCents: amount, earnestMoneyCents: 500_000n,
      contingencies: ["Inspection"], closeDate: 0n, hasEscalationClause: false,
    });

    it("only the seller logs and reads offers", async () => {
      listing.setIdentity(bob);
      expect(errKey(await listing.logFsboOffer(propertyId, offer("Bob", 40_000_000n)))).toBe("NotAuthorized");
      expect(errKey(await listing.getFsboOffers(propertyId))).toBe("NotAuthorized");

      listing.setIdentity(alice);
      expect(errKey(await listing.logFsboOffer(propertyId, offer("", 40_000_000n)))).toBe("InvalidInput");
      expect(errKey(await listing.logFsboOffer(propertyId, offer("Bob", 0n)))).toBe("InvalidInput");
      first  = ok<any>(await listing.logFsboOffer(propertyId, offer("Bob", 40_000_000n))).id;
      second = ok<any>(await listing.logFsboOffer(propertyId, offer("Carol", 40_500_000n))).id;
      expect(ok<any[]>(await listing.getFsboOffers(propertyId))).toHaveLength(2);
    });

    it("records counters from either side", async () => {
      listing.setIdentity(alice);
      ok(await listing.counterFsboOffer(propertyId, first, 41_000_000n, "Meet in the middle", true));
      const o = ok<any>(await listing.counterFsboOffer(propertyId, first, 40_750_000n, "Final", false));
      expect(Object.keys(o.status)[0]).toBe("Countered");
      expect(o.counters.map((c: any) => c.fromSeller)).toEqual([true, false]);
      expect(errKey(await listing.counterFsboOffer(propertyId, first, 0n, "", true))).toBe("InvalidInput");
    });

    it("accepting one offer rejects the other open ones and closes it", async () => {
      listing.setIdentity(alice);
      ok(await listing.acceptFsboOffer(propertyId, first));
      const all = ok<any[]>(await listing.getFsboOffers(propertyId));
      const status = (id: string) => Object.keys(all.find((x) => x.id === id).status)[0];
      expect(status(first)).toBe("Accepted");
      expect(status(second)).toBe("Rejected");
      expect(errKey(await listing.rejectFsboOffer(propertyId, first))).toBe("InvalidInput");
      expect(errKey(await listing.counterFsboOffer(propertyId, second, 1n, "", true))).toBe("InvalidInput");
    });
  });

  describe("upgrade", () => {
    it("keeps the live listing, showings, offers and hidden score", async () => {
      listing.setIdentity(alice);
      ok(await listing.setFsboScoreVisible(propertyId, false));
      const before = {
        listing:  await listing.getFsboListing(propertyId),
        showings: ok<any[]>(await listing.getShowingRequests(propertyId)).length,
        offers:   ok<any[]>(await listing.getFsboOffers(propertyId)).length,
        history:  (await listing.getFsboPriceHistory(propertyId)).length,
      };
      await pic.upgradeCanister({ canisterId: listingId, wasm: wasmPath("listing") });
      listing.setIdentity(alice);
      expect(await listing.getFsboListing(propertyId)).toEqual(before.listing);
      expect(ok<any[]>(await listing.getShowingRequests(propertyId))).toHaveLength(before.showings);
      expect(ok<any[]>(await listing.getFsboOffers(propertyId))).toHaveLength(before.offers);
      expect(await listing.getFsboPriceHistory(propertyId)).toHaveLength(before.history);
      expect(await listing.isFsboScoreHidden(propertyId)).toBe(true);
    });
  });

  describe("account deletion", () => {
    it("removes a buyer's requests but leaves other buyers' alone", async () => {
      listing.setIdentity(alice);
      const before = ok<any[]>(await listing.getShowingRequests(propertyId));
      const bobs = before.filter((r) => r.requester.toText() === bob.getPrincipal().toText()).length;
      expect(bobs).toBeGreaterThan(0);

      listing.setIdentity(bob);
      expect(ok(await listing.deleteMyData())).toBe(BigInt(bobs));
      listing.setIdentity(alice);
      const after = ok<any[]>(await listing.getShowingRequests(propertyId));
      expect(after).toHaveLength(before.length - bobs);
      expect(after.some((r) => r.requester.toText() === bob.getPrincipal().toText())).toBe(false);
    });
  });

  describe("taking the listing down", () => {
    it("only the seller can, and it deletes buyers' details with it", async () => {
      listing.setIdentity(mallory);
      expect(errKey(await listing.deactivateFsboListing(propertyId))).toBe("NotAuthorized");

      listing.setIdentity(alice);
      expect(errKey(await listing.discardFsboDraft(propertyId))).toBe("InvalidInput");   // live: take it down instead
      ok(await listing.deactivateFsboListing(propertyId));
      expect(await listing.getFsboListing(propertyId)).toEqual([]);
      expect(await listing.getFsboDraft(propertyId)).toEqual([]);
      expect(await listing.getFsboPriceHistory(propertyId)).toEqual([]);
      expect(await listing.isFsboScoreHidden(propertyId)).toBe(false);
      // The seller is no longer anyone's seller here, so the old threads are gone too.
      expect(errKey(await listing.getShowingRequests(propertyId))).toBe("NotAuthorized");
      listing.setIdentity(admin);
      expect(ok<any[]>(await listing.getShowingRequests(propertyId))).toEqual([]);
      expect(ok<any[]>(await listing.getFsboOffers(propertyId))).toEqual([]);
      expect(errKey(await listing.deactivateFsboListing(propertyId))).toBe("NotFound");
    });

    it("a seller who deletes their account takes the listing with them", async () => {
      listing.setIdentity(alice);
      ok(await listing.saveFsboDraft(propertyId, 39_000_000n, [], 3n));
      ok(await listing.activateFsboListing(liveListing(39_000_000n)));
      listing.setIdentity(bob);
      ok(await ask(bob, "Bob", "bob@example.com", "Fri"));

      listing.setIdentity(alice);
      ok(await listing.deleteMyData());
      expect(await listing.getFsboListing(propertyId)).toEqual([]);
      listing.setIdentity(admin);
      expect(ok<any[]>(await listing.getShowingRequests(propertyId))).toEqual([]);
    });
  });
});
