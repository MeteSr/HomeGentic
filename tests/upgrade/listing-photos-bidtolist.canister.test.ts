/**
 * FSBO listing photos and the Bid to List auction, on real listing,
 * property, photo, agent and fee canisters wired as deploy.sh wires them.
 *
 * Listing photos: only the property's own listing photos (uploaded to the
 * photo canister under LISTING_<propertyId>) can be added, so nobody can
 * claim another seller's photo ids; reorder keeps every photo once; review
 * flags are the seller's. Bid to List: only verified agents bid, an agent
 * withdraws only their own bid, the anonymous thread scrubs contact details,
 * the platform fee setting reaches the fee record, a revoked agent can't be
 * awarded, and reviews need a fee-paid award.
 *
 * Run: cd tests/upgrade && npx vitest run listing-photos-bidtolist.canister.test.ts
 * (needs .dfx/local/canisters/{listing,property,photo,agent,fee}/*.wasm)
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
const errText = (r: R<unknown>) => ("err" in r ? JSON.stringify(r.err) : "ok");

const CANISTERS = ["listing", "property", "photo", "agent", "fee"] as const;
type Name = typeof CANISTERS[number];
const DAY_MS = 24 * 60 * 60 * 1000;

describe("listing photos and Bid to List on real canisters", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;
  let alicesHome = "";
  let mallorysHome = "";

  const admin   = createIdentity("lb-admin");
  const alice   = createIdentity("lb-seller");
  const mallory = createIdentity("lb-other-seller");
  const agentA  = createIdentity("lb-agent-a");
  const agentB  = createIdentity("lb-agent-b");
  const agentC  = createIdentity("lb-agent-c");
  const buyer   = createIdentity("lb-buyer");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  let hashN = 0;
  const listingPhoto = async (who: Identity, propertyId: string, jobId = `LISTING_${propertyId}`) =>
    ok<any>(await as("photo", who).uploadPhoto(jobId, propertyId, { Listing: null }, "", (++hashN).toString(16).padStart(64, "0"), new Uint8Array([1, 2, 3, hashN]))).id as string;
  const home = async (who: Identity, address: string) => ok<any>(await as("property", who).registerProperty({
    address, city: "Orlando", state: "FL", zipCode: "32801",
    propertyType: { SingleFamily: null }, yearBuilt: 2000n, squareFeet: 1800n, tier: { Free: null },
  })).id as string;

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
    // deploy.sh's wiring.
    for (const [setter, callee] of [["setPropertyCanisterId", "property"], ["setPhotoCanisterId", "photo"], ["setAgentCanisterId", "agent"], ["setFeeCanisterId", "fee"]] as const) {
      ok(await as("listing", admin)[setter](ids[callee].toText()));
    }
    ok(await as("photo", admin).setPropertyCanisterId(ids.property));
    ok(await as("fee", admin).setListingCanisterId(ids.listing.toText()));
    ok(await as("agent", admin).setListingCanisterId(ids.listing.toText()));
    ok(await as("property", admin).setListingCanisterId(ids.listing));

    alicesHome = await home(alice, "5 Bay Street");
    mallorysHome = await home(mallory, "7 Bay Street");
  }, 180_000);

  afterAll(async () => { await pic?.tearDown(); });

  describe("listing photos", () => {
    let photos: string[] = [];

    beforeAll(async () => {
      photos = [await listingPhoto(alice, alicesHome), await listingPhoto(alice, alicesHome), await listingPhoto(alice, alicesHome)];
    });

    it("adds only the property's own listing photos, and only for its owner", async () => {
      expect(errKey(await as("listing", mallory).addListingPhoto(alicesHome, photos[0]))).toBe("NotAuthorized");
      // Photo ids are sequential: Mallory can't claim Alice's next ids for her own listing.
      expect(errText(await as("listing", mallory).addListingPhoto(mallorysHome, photos[0]))).toMatch(/Not a listing photo/);
      const jobPhoto = await listingPhoto(alice, alicesHome, "JOB_1");
      expect(errText(await as("listing", alice).addListingPhoto(alicesHome, jobPhoto))).toMatch(/Not a listing photo/);
      expect(errText(await as("listing", alice).addPanorama(alicesHome, "Kitchen", jobPhoto))).toMatch(/Not a listing photo/);
      for (const p of photos) ok(await as("listing", alice).addListingPhoto(alicesHome, p));
      expect(errText(await as("listing", alice).addListingPhoto(alicesHome, photos[0]))).toMatch(/already added/);
      expect(await as("listing", mallory).getListingPhotos(alicesHome)).toEqual(photos);
    });

    it("reorders only to an order holding every photo once", async () => {
      const [a, b, c] = photos;
      expect(errKey(await as("listing", mallory).reorderListingPhotos(alicesHome, [c, b, a]))).toBe("NotAuthorized");
      expect(errText(await as("listing", alice).reorderListingPhotos(alicesHome, [a, a, b]))).toMatch(/every photo once/);
      expect(errText(await as("listing", alice).reorderListingPhotos(alicesHome, [a, b]))).toMatch(/same number/);
      expect(errText(await as("listing", alice).reorderListingPhotos(alicesHome, [a, b, "PHOTO_999"]))).toMatch(/Unknown photo/);
      ok(await as("listing", alice).reorderListingPhotos(alicesHome, [c, a, b]));
      expect(await as("listing", alice).getListingPhotos(alicesHome)).toEqual([c, a, b]);
    });

    it("leaves review flags to the seller", async () => {
      expect(errKey(await as("listing", mallory).flagPhotoForReview(photos[1]))).toBe("NotAuthorized");
      ok(await as("listing", alice).flagPhotoForReview(photos[1]));
      expect(await as("listing", mallory).getPhotoReviewState(photos[1])).toEqual([{ flagged: true, reviewed: false }]);
      expect(errKey(await as("listing", mallory).reviewPhoto(photos[1]))).toBe("NotAuthorized");
      ok(await as("listing", alice).reviewPhoto(photos[1]));
      expect(await as("listing", alice).getPhotoReviewState(photos[1])).toEqual([{ flagged: true, reviewed: true }]);
    });

    it("removes a photo for the owner only", async () => {
      expect(errKey(await as("listing", mallory).removeListingPhoto(alicesHome, photos[2]))).toBe("NotAuthorized");
      ok(await as("listing", alice).removeListingPhoto(alicesHome, photos[2]));
      expect(await as("listing", alice).getListingPhotos(alicesHome)).not.toContain(photos[2]);
    });
  });

  describe("Bid to List", () => {
    let requestId = "";
    const proposal = (who: Identity, commissionBps: bigint, text = "Comparable sales support this price.") =>
      as("listing", who).submitProposal(requestId, commissionBps, 450_000_00n, text, "Open houses", ["Pro photos"], 30n, [], 0n, text);
    const register = (who: Identity, name: string) => as("agent", who).register({
      name, brokerage: "Sunshine Realty", licenseNumber: `BK${name.length}123`, licenseState: "FL", county: "Orange",
      serviceCities: ["orlando"], bio: "", phone: "+14075550100", email: `${name.split(" ")[0].toLowerCase()}@example.com`,
    });

    beforeAll(async () => {
      requestId = ok<any>(await as("listing", alice).createBidRequest(
        alicesHome, "5 Bay Street", "Orlando", "Orange", "32801", "alice@example.com",
        [3n], [2n], [1800n], BigInt(Date.now() + 30 * DAY_MS) * 1_000_000n, [], "", { Seven: null },
      )).id;
      ok(await register(agentA, "Ann Agent"));
      ok(await register(agentB, "Bea Broker"));
      ok(await register(agentC, "Cal Closer"));
    });

    it("takes bids only from verified agents", async () => {
      expect(errKey(await proposal(agentA, 250n))).toBe("NotAuthorized");
      for (const a of [agentA, agentB, agentC]) ok(await as("agent", admin).verifyAgent(a.getPrincipal()));
      expect(errKey(await as("agent", agentA).verifyAgent(agentA.getPrincipal()))).toBe("NotAuthorized");
      ok(await proposal(agentA, 250n));
      ok(await proposal(agentB, 275n));
      ok(await proposal(agentC, 300n));
      expect(errText(await proposal(agentA, 200n))).toMatch(/already have a proposal/);
    });

    it("lets an agent withdraw only their own pending bid", async () => {
      const [mine] = await as("listing", agentC).getMyProposals();
      expect(errKey(await as("listing", agentA).withdrawProposal(mine.id))).toBe("NotAuthorized");
      ok(await as("listing", agentC).withdrawProposal(mine.id));
      expect(errText(await as("listing", agentC).withdrawProposal(mine.id))).toMatch(/pending/);
    });

    it("keeps the thread between the seller and that agent, scrubbed of contact details", async () => {
      const [bid] = await as("listing", agentA).getMyProposals();
      const m = ok<any>(await as("listing", agentA).postMessage(bid.id, "Call me at 407-555-0100 or ann@example.com", { agent: null }));
      expect(m.scrubbedBody).not.toMatch(/555-0100|ann@example\.com/);
      expect(m.redactions.length).toBeGreaterThan(0);
      ok(await as("listing", alice).postMessage(bid.id, "What is your marketing budget?", { seller: null }));
      expect(errKey(await as("listing", agentB).postMessage(bid.id, "hi", { agent: null }))).toBe("NotAuthorized");
      expect(errKey(await as("listing", agentA).postMessage(bid.id, "I am the seller", { seller: null }))).toBe("NotAuthorized");
      expect(errKey(await as("listing", mallory).postMessage(bid.id, "hi", { seller: null }))).toBe("NotAuthorized");
      expect(errText(await as("listing", alice).postMessage(bid.id, "", { seller: null }))).toMatch(/empty/);
      expect(errKey(await as("listing", agentB).getThread(bid.id))).toBe("NotAuthorized");
      expect(ok<any[]>(await as("listing", alice).getThread(bid.id)).map((x) => Object.keys(x.authorRole)[0])).toEqual(["agent", "seller"]);
    });

    it("charges the platform fee an admin sets", async () => {
      expect(errKey(await as("listing", alice).setPlatformFeeCents(1n))).toBe("NotAuthorized");
      expect(errKey(await as("listing", admin).setPlatformFeeCents(0n))).toBe("InvalidInput");
      ok(await as("listing", admin).setPlatformFeeCents(299_00n));
      expect(await as("listing", mallory).getPlatformFee()).toBe(299_00n);
    });

    it("won't award a bid whose agent's licence was revoked", async () => {
      const [bidB] = await as("listing", agentB).getMyProposals();
      expect(errKey(await as("agent", alice).revokeAgent(agentB.getPrincipal()))).toBe("NotAuthorized");
      ok(await as("agent", admin).revokeAgent(agentB.getPrincipal()));
      expect(errText(await as("listing", alice).acceptProposal(bidB.id))).toMatch(/no longer verified/);
      expect(await as("fee", admin).getFeeForRequest(requestId)).toEqual([]);
    });

    it("awards after the fee settles, and then takes one review from the seller", async () => {
      const [bidA] = await as("listing", agentA).getMyProposals();
      expect(errKey(await as("listing", mallory).acceptProposal(bidA.id))).toBe("NotAuthorized");
      const feeId = ok<string>(await as("listing", alice).acceptProposal(bidA.id));
      const [fee] = await as("fee", admin).getFeeForRequest(requestId);
      expect([fee.id, fee.amountCents, fee.agentId.toText()]).toEqual([feeId, 299_00n, agentA.getPrincipal().toText()]);

      const review = { agentId: agentA.getPrincipal(), rating: 5n, comment: "Sold in a week.", transactionId: bidA.id };
      // Not awarded yet: no review.
      expect(errKey(await as("agent", alice).addReview(review))).toBe("NotAuthorized");
      expect(errText(await as("listing", admin).markListingFeePaid(requestId, bidA.id))).toMatch(/not settled/);
      ok(await as("fee", admin).markFeePaid(feeId));
      ok(await as("listing", admin).markListingFeePaid(requestId, bidA.id));
      ok(await as("listing", admin).markListingFeePaid(requestId, bidA.id));   // webhook retry
      // The winner now sees the address; the other bidder still doesn't.
      expect(ok<any>(await as("listing", agentA).getBidRequest(requestId)).address).toBe("5 Bay Street");
      expect(ok<any>(await as("listing", agentB).getBidRequest(requestId)).address).toBe("");

      expect(errKey(await as("agent", mallory).addReview(review))).toBe("NotAuthorized");
      expect(errKey(await as("agent", alice).addReview({ ...review, agentId: agentB.getPrincipal() }))).toBe("NotAuthorized");
      expect(errKey(await as("agent", agentA).addReview(review))).toBe("NotAuthorized");   // no self-review
      ok(await as("agent", alice).addReview(review));
      expect(errKey(await as("agent", alice).addReview(review))).toBe("DuplicateReview");
      expect((await as("agent", mallory).getReviews(agentA.getPrincipal())).map((r: any) => r.rating)).toEqual([5n]);
    });

    it("lets only admins and the listing canister record a close; agents set their own card flag", async () => {
      expect(errKey(await as("agent", agentA).recordListingClose(agentA.getPrincipal(), 10n))).toBe("NotAuthorized");
      ok(await as("agent", admin).recordListingClose(agentA.getPrincipal(), 10n));
      ok(await as("agent", admin).recordListingClose(agentA.getPrincipal(), 20n));
      const [p] = await as("agent", agentA).getMyProfile();
      expect([p.listingsLast12Months, p.avgDaysOnMarket]).toEqual([2n, 15n]);
      expect(errKey(await as("agent", mallory).setCardOnFile(true))).toBe("NotFound");
      ok(await as("agent", agentA).setCardOnFile(true));
      expect((await as("agent", agentA).getMyProfile())[0].cardOnFile).toBe(true);
    });

    it("counts the sale on the winning agent's record when the home changes hands, once", async () => {
      const before = (await as("agent", agentA).getMyProfile())[0];
      expect([before.listingsLast12Months, before.avgDaysOnMarket]).toEqual([2n, 15n]);
      await pic.advanceTime(21 * DAY_MS);
      await pic.tick();
      const sell = async (from: Identity, to: Identity) => {
        const { token } = ok<any>(await as("property", from).initiateTransfer(alicesHome));
        ok(await as("property", to).claimTransfer(token));
      };
      await sell(alice, buyer);
      const after = (await as("agent", agentA).getMyProfile())[0];
      // Days on market run from the award (fee settled) to the transfer.
      expect([after.listingsLast12Months, after.avgDaysOnMarket]).toEqual([3n, 17n]);   // (15*2 + 21) / 3
      // The losing bidder's record is untouched.
      expect((await as("agent", agentB).getMyProfile())[0].listingsLast12Months).toBe(0n);
      // Selling the same home on, without a new auction, doesn't count it again.
      await sell(buyer, alice);
      expect((await as("agent", agentA).getMyProfile())[0].listingsLast12Months).toBe(3n);
    });
  });
});
