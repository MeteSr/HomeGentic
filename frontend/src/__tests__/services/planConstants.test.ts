/**
 * planConstants — static plan data worth locking down against accidental
 * edits: the Free tier's limits, Pro's single annual price, and that
 * ANNUAL_PLANS stays an alias of PLANS (no monthly variant exists anymore).
 */

import { describe, it, expect } from "vitest";
import { PLANS, ANNUAL_PLANS } from "@/services/planConstants";

describe("PLANS", () => {
  it("defines exactly the Free, Pro, ContractorFree, and ContractorPro tiers", () => {
    expect(PLANS.map((p) => p.tier)).toEqual(["Free", "Pro", "ContractorFree", "ContractorPro"]);
  });

  it("gives Free tier the documented limits: 1 property, 5 photos, 3 quotes", () => {
    const free = PLANS.find((p) => p.tier === "Free")!;
    expect(free.price).toBe(0);
    expect(free.propertyLimit).toBe(1);
    expect(free.photosPerJob).toBe(5);
    expect(free.quoteRequests).toBe(3);
  });

  it("prices Pro at $59/year with unlimited quote requests", () => {
    const pro = PLANS.find((p) => p.tier === "Pro")!;
    expect(pro.price).toBe(59);
    expect(pro.period).toBe("year");
    expect(pro.quoteRequests).toBe(Infinity);
  });

  it("gives ContractorFree a zero property limit (contractors don't own properties)", () => {
    const cf = PLANS.find((p) => p.tier === "ContractorFree")!;
    expect(cf.propertyLimit).toBe(0);
    expect(cf.price).toBe(0);
  });

  it("prices ContractorPro at $40/month", () => {
    const cp = PLANS.find((p) => p.tier === "ContractorPro")!;
    expect(cp.price).toBe(40);
    expect(cp.period).toBe("month");
  });
});

describe("ANNUAL_PLANS", () => {
  it("is an alias of PLANS — no separate monthly/annual split exists", () => {
    expect(ANNUAL_PLANS).toBe(PLANS);
  });
});
