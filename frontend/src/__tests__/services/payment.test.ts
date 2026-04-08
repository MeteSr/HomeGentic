import { describe, it, expect, beforeEach, vi } from "vitest";
import { paymentService, PLANS } from "@/services/payment";
import type { PlanTier } from "@/services/payment";

// ─── PLANS data integrity ─────────────────────────────────────────────────────

describe("PLANS", () => {
  it("contains exactly 4 tiers", () => {
    expect(PLANS).toHaveLength(4);
  });

  it("contains all expected tiers in order", () => {
    expect(PLANS.map((p) => p.tier)).toEqual(["Free", "Pro", "Premium", "ContractorPro"]);
  });

  it("Free tier is $0 with 1 property limit", () => {
    const free = PLANS.find((p) => p.tier === "Free")!;
    expect(free.price).toBe(0);
    expect(free.period).toBe("free");
    expect(free.propertyLimit).toBe(1);
    expect(free.photosPerJob).toBe(2);
    expect(free.quoteRequests).toBe(3);
  });

  it("Pro tier is $10/month with 5 property limit", () => {
    const pro = PLANS.find((p) => p.tier === "Pro")!;
    expect(pro.price).toBe(10);
    expect(pro.period).toBe("month");
    expect(pro.propertyLimit).toBe(5);
    expect(pro.photosPerJob).toBe(10);
    expect(pro.quoteRequests).toBe(10);
  });

  it("Premium tier is $20/month with unlimited properties", () => {
    const premium = PLANS.find((p) => p.tier === "Premium")!;
    expect(premium.price).toBe(20);
    expect(premium.period).toBe("month");
    expect(premium.propertyLimit).toBe(Infinity);
    expect(premium.photosPerJob).toBe(Infinity);
    expect(premium.quoteRequests).toBe(Infinity);
  });

  it("ContractorPro tier is $30/month", () => {
    const cp = PLANS.find((p) => p.tier === "ContractorPro")!;
    expect(cp.price).toBe(30);
    expect(cp.period).toBe("month");
    expect(cp.photosPerJob).toBe(50);
    expect(cp.quoteRequests).toBe(Infinity);
  });

  it("every plan has a non-empty features array", () => {
    PLANS.forEach((p) => {
      expect(Array.isArray(p.features)).toBe(true);
      expect(p.features.length).toBeGreaterThan(0);
    });
  });

  it("homeowner paid tiers have higher property limits than Free", () => {
    const free = PLANS.find((p) => p.tier === "Free")!;
    // ContractorPro is a contractor plan (propertyLimit=0 means N/A for homeowners).
    const homeownerPaid = PLANS.filter((p) => p.price > 0 && p.tier !== "ContractorPro");
    homeownerPaid.forEach((p) => {
      expect(p.propertyLimit).toBeGreaterThan(free.propertyLimit);
    });
  });
});

// ─── getPlan ──────────────────────────────────────────────────────────────────

describe("paymentService.getPlan", () => {
  const tiers: PlanTier[] = ["Free", "Pro", "Premium", "ContractorPro"];

  it.each(tiers)("returns the correct plan for '%s'", (tier) => {
    const plan = paymentService.getPlan(tier);
    expect(plan.tier).toBe(tier);
  });

  it("falls back to Free for an unknown tier", () => {
    const plan = paymentService.getPlan("unknown" as PlanTier);
    expect(plan.tier).toBe("Free");
  });

  it("returns the same object as in PLANS", () => {
    tiers.forEach((tier) => {
      const plan = paymentService.getPlan(tier);
      expect(plan).toBe(PLANS.find((p) => p.tier === tier));
    });
  });
});

// ─── getMySubscription (mock path) ───────────────────────────────────────────

describe("paymentService.getMySubscription (mock)", () => {
  it("returns Free tier when no canister is deployed", async () => {
    const sub = await paymentService.getMySubscription();
    expect(sub.tier).toBe("Free");
  });

  it("returns null expiresAt in mock mode", async () => {
    const sub = await paymentService.getMySubscription();
    expect(sub.expiresAt).toBeNull();
  });
});

// ─── hasPaidFor (mock path) ───────────────────────────────────────────────────

describe("paymentService.hasPaidFor (mock)", () => {
  it("returns false for any feature when tier is Free", async () => {
    expect(await paymentService.hasPaidFor("reports")).toBe(false);
    expect(await paymentService.hasPaidFor("analytics")).toBe(false);
    expect(await paymentService.hasPaidFor("")).toBe(false);
  });
});

// ─── initiate (mock path) ─────────────────────────────────────────────────────

describe("paymentService.initiate (mock)", () => {
  it("returns dashboard URL for any tier", async () => {
    const tiers: PlanTier[] = ["Pro", "Premium", "ContractorPro"];
    for (const tier of tiers) {
      const result = await paymentService.initiate(tier);
      expect(result.url).toBe("/dashboard");
    }
  });
});
