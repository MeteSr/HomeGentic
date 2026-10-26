/**
 * Unit tests for fsboService and pure FSBO helpers
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  fsboService,
  listPublicFsbos,
  computeFsboReadiness,
  computeAgentCommissionSavings,
} from "@/services/fsbo";
import { showingRequestService } from "@/services/showingRequest";
import { fsboOfferService } from "@/services/fsboOffer";
import type { Property } from "@/services/property";

// No LISTING_CANISTER_ID here, so the service runs on its in-memory store.
// services/fsboCanister.test.ts covers the listing canister calls.
beforeEach(() => {
  fsboService.__reset();
  showingRequestService.__reset();
  fsboOfferService.__reset();
});

const property: Property = {
  id: "prop-1", owner: "2vxsx-fae", address: "12 Elm St", city: "Orlando", state: "FL", zipCode: "32801",
  propertyType: "SingleFamily", yearBuilt: 1998n, squareFeet: 1850n, verificationLevel: "Basic",
  tier: "Pro", createdAt: 0n, updatedAt: 0n, isActive: true,
};

// ── computeFsboReadiness ──────────────────────────────────────────────────────

describe("computeFsboReadiness", () => {
  it("returns NotReady when score < 65", () => {
    const result = computeFsboReadiness(60, 3, true);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing.some(m => m.includes("65+"))).toBe(true);
  });

  it("returns NotReady when verifiedJobCount < 2", () => {
    const result = computeFsboReadiness(70, 1, true);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing.some(m => m.includes("2 verified"))).toBe(true);
  });

  it("returns NotReady when both score and jobs are insufficient", () => {
    const result = computeFsboReadiness(50, 0, false);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing).toHaveLength(2);
  });

  it("returns Ready when score >= 65 and verifiedJobs >= 2 but not OptimallyReady", () => {
    const result = computeFsboReadiness(70, 2, false);
    expect(result.readiness).toBe("Ready");
  });

  it("returns OptimallyReady when score >= 85, verifiedJobs >= 3, and hasReport", () => {
    const result = computeFsboReadiness(90, 3, true);
    expect(result.readiness).toBe("OptimallyReady");
    expect(result.missing).toHaveLength(0);
  });

  it("Ready missing list explains what is needed for OptimallyReady", () => {
    const result = computeFsboReadiness(70, 2, false);
    expect(result.readiness).toBe("Ready");
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

// ── computeAgentCommissionSavings ─────────────────────────────────────────────

describe("computeAgentCommissionSavings", () => {
  it("returns 3% of the list price in cents", () => {
    const savings = computeAgentCommissionSavings(50_000_00); // $500k in cents
    expect(savings).toBe(Math.round(50_000_00 * 0.03));
  });

  it("rounds correctly for non-integer results", () => {
    const savings = computeAgentCommissionSavings(333_333);
    expect(savings).toBe(Math.round(333_333 * 0.03));
  });

  it("returns 0 for 0 list price", () => {
    expect(computeAgentCommissionSavings(0)).toBe(0);
  });
});

// ── fsboService.setFsboMode ───────────────────────────────────────────────────

// ── Seller setup (in-memory store) ───────────────────────────────────────────

describe("fsboService.saveDraft", () => {
  it("returns null before the seller starts", async () => {
    expect(await fsboService.getRecord("prop-1")).toBeNull();
  });

  it("saves price, description and the next step; the home isn't live yet", async () => {
    const rec = await fsboService.saveDraft("prop-1", 48_500_000, "Sunny corner lot", 2);
    expect(rec).toMatchObject({ propertyId: "prop-1", isFsbo: false, listPriceCents: 48_500_000, step: 2, description: "Sunny corner lot" });
    expect(await fsboService.getRecord("prop-1")).toEqual(rec);
    expect(await fsboService.getPublicListing("prop-1")).toBeNull();
  });

  it("keeps the start time across saves", async () => {
    const first  = await fsboService.saveDraft("prop-1", 1_000, undefined, 2);
    const second = await fsboService.saveDraft("prop-1", 2_000, undefined, 3);
    expect(second.activatedAt).toBe(first.activatedAt);
    expect(second.step).toBe(3);
  });

  it("drops a blank description", async () => {
    const rec = await fsboService.saveDraft("prop-1", 1_000, "   ", 2);
    expect(rec.description).toBeUndefined();
  });

  it("rejects a zero or negative price", async () => {
    await expect(fsboService.saveDraft("prop-1", 0, undefined, 2)).rejects.toThrow(/above \$0/);
    await expect(fsboService.saveDraft("prop-1", -5, undefined, 2)).rejects.toThrow(/above \$0/);
  });
});

describe("fsboService.goLive", () => {
  it("publishes the listing with the property details and the seller's beds and baths", async () => {
    const draft = await fsboService.saveDraft("prop-1", 48_500_000, "Sunny", 3);
    const rec = await fsboService.goLive(property, draft, { bedrooms: 3, bathrooms: 2 });
    expect(rec).toMatchObject({ isFsbo: true, step: "done", listPriceCents: 48_500_000 });

    const live = await fsboService.getPublicListing("prop-1");
    expect(live).toMatchObject({
      address: "12 Elm St", city: "Orlando", zipCode: "32801", propertyType: "SingleFamily",
      yearBuilt: 1998, squareFeet: 1850, bedrooms: 3, bathrooms: 2, description: "Sunny",
    });
    expect((await listPublicFsbos()).map((l) => l.propertyId)).toEqual(["prop-1"]);
    expect(await fsboService.getPriceHistory("prop-1")).toEqual([
      { priceCents: 48_500_000, recordedAt: expect.any(Number) },
    ]);
  });
});

describe("fsboService.updatePrice", () => {
  it("changes the price and adds each new price to the history", async () => {
    const draft = await fsboService.saveDraft("prop-1", 50_000_000, undefined, 3);
    await fsboService.goLive(property, draft, { bedrooms: 3, bathrooms: 2 });
    await fsboService.updatePrice("prop-1", 48_000_000);
    await fsboService.updatePrice("prop-1", 48_000_000); // same price: no new entry
    const rec = await fsboService.updatePrice("prop-1", 46_500_000);

    expect(rec.listPriceCents).toBe(46_500_000);
    expect((await fsboService.getPriceHistory("prop-1")).map((h) => h.priceCents))
      .toEqual([50_000_000, 48_000_000, 46_500_000]);
  });

  it("fails when the home isn't live", async () => {
    await expect(fsboService.updatePrice("nope", 1_000)).rejects.toThrow(/no longer exists/);
  });
});

describe("fsboService.deactivate", () => {
  it("takes the listing down and deletes its showings, offers and history", async () => {
    const draft = await fsboService.saveDraft("prop-1", 50_000_000, undefined, 3);
    await fsboService.goLive(property, draft, { bedrooms: 3, bathrooms: 2 });
    await showingRequestService.create({ propertyId: "prop-1", name: "Ana", contact: "ana@example.com", preferredTime: "Sat" });
    await fsboOfferService.logOffer("prop-1", {
      buyerName: "Ana", offerAmountCents: 49_000_000, earnestMoneyCents: 0,
      contingencies: [], closeDateMs: 0, hasEscalationClause: false,
    });

    await fsboService.deactivate("prop-1");

    expect(await fsboService.getRecord("prop-1")).toBeNull();
    expect(await fsboService.getPublicListing("prop-1")).toBeNull();
    expect(await fsboService.getPriceHistory("prop-1")).toEqual([]);
    expect(await showingRequestService.getByProperty("prop-1")).toEqual([]);
    expect(await fsboOfferService.getByProperty("prop-1")).toEqual([]);
  });

  it("discards an unfinished setup", async () => {
    await fsboService.saveDraft("prop-1", 50_000_000, undefined, 2);
    await fsboService.deactivate("prop-1");
    expect(await fsboService.getRecord("prop-1")).toBeNull();
  });
});

describe("fsboService score visibility", () => {
  it("hides and shows the score on the public listing", async () => {
    const draft = await fsboService.saveDraft("prop-1", 50_000_000, undefined, 3);
    await fsboService.goLive(property, draft, { bedrooms: 3, bathrooms: 2 });
    expect(await fsboService.isScoreHidden("prop-1")).toBe(false);
    await fsboService.setScoreVisible("prop-1", false);
    expect(await fsboService.isScoreHidden("prop-1")).toBe(true);
    await fsboService.setScoreVisible("prop-1", true);
    expect(await fsboService.isScoreHidden("prop-1")).toBe(false);
  });
});

describe("E2E injection", () => {
  it("window.__e2e_fsbo wins over the store", async () => {
    (window as any).__e2e_fsbo = { "prop-9": { propertyId: "prop-9", isFsbo: true, listPriceCents: 1, activatedAt: 0, step: "done", hasReport: false } };
    try {
      expect((await fsboService.getRecord("prop-9"))?.isFsbo).toBe(true);
    } finally {
      delete (window as any).__e2e_fsbo;
    }
  });
});
