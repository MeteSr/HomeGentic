/**
 * Unit tests for fsboOfferService and pure FSBO offer helpers
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  fsboOfferService,
  computeFsboNetProceeds,
  computeContingencyRisk,
  type LogFsboOfferInput,
} from "@/services/fsboOffer";

beforeEach(() => {
  fsboOfferService.__reset();
});

// ── pure helpers ──────────────────────────────────────────────────────────────

describe("computeFsboNetProceeds", () => {
  it("deducts 2% closing costs from offer", () => {
    const net = computeFsboNetProceeds(50_000_00);
    expect(net).toBe(50_000_00 - Math.round(50_000_00 * 0.02));
  });

  it("also deducts concessions", () => {
    const net = computeFsboNetProceeds(50_000_00, 5_000_00);
    const closingCosts = Math.round(50_000_00 * 0.02);
    expect(net).toBe(50_000_00 - closingCosts - 5_000_00);
  });

  it("defaults concessions to 0", () => {
    const withZero    = computeFsboNetProceeds(40_000_00, 0);
    const withDefault = computeFsboNetProceeds(40_000_00);
    expect(withZero).toBe(withDefault);
  });
});

describe("computeContingencyRisk", () => {
  it("returns 0 for no contingencies", () => {
    expect(computeContingencyRisk([])).toBe(0);
  });

  it("returns the count of contingencies", () => {
    expect(computeContingencyRisk(["inspection", "financing"])).toBe(2);
  });
});

// ── fsboOfferService.logOffer ─────────────────────────────────────────────────

function makeOfferInput(overrides: Partial<LogFsboOfferInput> = {}): LogFsboOfferInput {
  return {
    buyerName:           "Alice Buyer",
    offerAmountCents:    48_000_00,
    earnestMoneyCents:   1_000_00,
    contingencies:       ["inspection"],
    closeDateMs:         Date.now() + 30 * 86400000,
    hasEscalationClause: false,
    ...overrides,
  };
}

describe("fsboOfferService.logOffer", () => {
  it("creates an offer with Active status", async () => {
    const offer = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    expect(offer.status).toBe("Active");
    expect(offer.propertyId).toBe("prop-1");
    expect(offer.buyerName).toBe("Alice Buyer");
  });

  it("assigns unique incremental ids", async () => {
    const o1 = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    const o2 = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    expect(o1.id).not.toBe(o2.id);
  });

  it("starts with an empty counters array", async () => {
    const offer = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    expect(offer.counters).toHaveLength(0);
  });
});

// ── fsboOfferService.getByProperty ───────────────────────────────────────────

describe("fsboOfferService.getByProperty", () => {
  it("returns empty array for unknown property", () => {
    expect(fsboOfferService.getByProperty("prop-unknown")).toHaveLength(0);
  });

  it("returns only offers matching the propertyId", async () => {
    await fsboOfferService.logOffer("prop-1", makeOfferInput());
    await fsboOfferService.logOffer("prop-2", makeOfferInput());
    const offers = fsboOfferService.getByProperty("prop-1");
    expect(offers).toHaveLength(1);
    expect(offers[0].propertyId).toBe("prop-1");
  });
});

// ── fsboOfferService.accept / reject ──────────────────────────────────────────

describe("fsboOfferService.accept", () => {
  it("sets status to Accepted", async () => {
    const offer  = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    const result = await fsboOfferService.accept(offer.id);
    expect(result.status).toBe("Accepted");
  });
});

describe("fsboOfferService.reject", () => {
  it("sets status to Rejected", async () => {
    const offer  = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    const result = await fsboOfferService.reject(offer.id);
    expect(result.status).toBe("Rejected");
  });
});

// ── fsboOfferService.addCounter ───────────────────────────────────────────────

describe("fsboOfferService.addCounter", () => {
  it("sets status to Countered and appends counter", async () => {
    const offer  = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    const result = await fsboOfferService.addCounter(offer.id, {
      amountCents: 47_000_00,
      notes:       "Slight reduction requested",
      fromSeller:  true,
    });
    expect(result.status).toBe("Countered");
    expect(result.counters).toHaveLength(1);
    expect(result.counters[0].amountCents).toBe(47_000_00);
    expect(result.counters[0].fromSeller).toBe(true);
  });

  it("accumulates multiple counters", async () => {
    const offer = await fsboOfferService.logOffer("prop-1", makeOfferInput());
    await fsboOfferService.addCounter(offer.id, { amountCents: 47_000_00, notes: "c1", fromSeller: true });
    const result = await fsboOfferService.addCounter(offer.id, { amountCents: 47_500_00, notes: "c2", fromSeller: false });
    expect(result.counters).toHaveLength(2);
  });
});
