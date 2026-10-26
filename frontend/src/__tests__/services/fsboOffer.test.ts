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

const INPUT = makeOfferInput();

describe("fsboOfferService (in-memory store)", () => {
  it("logs an offer as Active with no counters", async () => {
    const o = await fsboOfferService.logOffer("prop-1", INPUT);
    expect(o).toMatchObject({ propertyId: "prop-1", status: "Active", counters: [], buyerName: INPUT.buyerName });
    expect(await fsboOfferService.getByProperty("prop-1")).toEqual([o]);
    expect(await fsboOfferService.getByProperty("other")).toEqual([]);
  });

  it("accepting one offer rejects the other open offers", async () => {
    const a = await fsboOfferService.logOffer("prop-1", INPUT);
    const b = await fsboOfferService.logOffer("prop-1", INPUT);
    const c = await fsboOfferService.logOffer("prop-2", INPUT);
    await fsboOfferService.accept("prop-1", a.id);
    const byId = Object.fromEntries((await fsboOfferService.getByProperty("prop-1")).map((o) => [o.id, o.status]));
    expect(byId).toEqual({ [a.id]: "Accepted", [b.id]: "Rejected" });
    expect((await fsboOfferService.getByProperty("prop-2"))[0].id).toBe(c.id);
    expect((await fsboOfferService.getByProperty("prop-2"))[0].status).toBe("Active");
  });

  it("reject sets Rejected", async () => {
    const o = await fsboOfferService.logOffer("prop-1", INPUT);
    expect((await fsboOfferService.reject("prop-1", o.id)).status).toBe("Rejected");
  });

  it("counters from either side accumulate and mark the offer Countered", async () => {
    const o = await fsboOfferService.logOffer("prop-1", INPUT);
    await fsboOfferService.addCounter("prop-1", o.id, { amountCents: 49_500_000, notes: "Meet me", fromSeller: true });
    const u = await fsboOfferService.addCounter("prop-1", o.id, { amountCents: 49_000_000, notes: "", fromSeller: false });
    expect(u.status).toBe("Countered");
    expect(u.counters.map((c) => [c.amountCents, c.fromSeller])).toEqual([[49_500_000, true], [49_000_000, false]]);
  });

  it("fails for an unknown offer", async () => {
    await expect(fsboOfferService.reject("prop-1", "nope")).rejects.toThrow(/no longer exists/);
  });
});
