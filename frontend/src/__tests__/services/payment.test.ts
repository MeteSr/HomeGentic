import { describe, it, expect, beforeEach, vi } from "vitest";
import { paymentService, PLANS, ANNUAL_PLANS } from "@/services/payment";
import type { PlanTier } from "@/services/payment";

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Prevent AuthClient / indexedDB access and real canister HTTP calls in unit tests.

vi.mock("@/services/actor", () => ({
  getAgent:     vi.fn().mockResolvedValue({}),
  getPrincipal: vi.fn().mockResolvedValue("2vxsx-fae"),
  resetAgent:   vi.fn(),
}));

vi.mock("@/services/icpLedger", () => ({
  icpLedgerService: {
    approve:    vi.fn().mockResolvedValue(undefined),
    getBalance: vi.fn().mockResolvedValue(BigInt(500_000_000)),
  },
}));

const mockSubscribeActor = vi.fn().mockResolvedValue({
  ok: { tier: { Free: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0) },
});
const mockGetMySubscription = vi.fn().mockResolvedValue({
  ok: { tier: { Free: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0) },
});
const mockGetPriceQuote = vi.fn().mockResolvedValue({ ok: BigInt(1_000_000) });

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: {
    createActor: vi.fn(() => ({
      subscribe:         mockSubscribeActor,
      getMySubscription: mockGetMySubscription,
      getPriceQuote:     mockGetPriceQuote,
      getPricing:        vi.fn().mockResolvedValue({ ok: null }),
      getAllPricing:      vi.fn().mockResolvedValue({ ok: [] }),
    })),
  },
  HttpAgent: { create: vi.fn().mockResolvedValue({}) },
}));

// ─── PLANS data integrity ─────────────────────────────────────────────────────

describe("PLANS", () => {
  it("contains exactly 6 tiers (Free, Basic, Pro, Premium, ContractorFree, ContractorPro)", () => {
    expect(PLANS).toHaveLength(6);
  });

  it("contains all expected tiers in order", () => {
    expect(PLANS.map((p) => p.tier)).toEqual(["Free", "Basic", "Pro", "Premium", "ContractorFree", "ContractorPro"]);
  });

  it("Free tier is $0 unsubscribed sentinel with no limits", () => {
    const free = PLANS.find((p) => p.tier === "Free")!;
    expect(free.price).toBe(0);
    expect(free.period).toBe("free");
    expect(free.propertyLimit).toBe(0);
    expect(free.photosPerJob).toBe(0);
    expect(free.quoteRequests).toBe(0);
  });

  it("Basic tier is $10/month with 1 property limit and all services", () => {
    const basic = PLANS.find((p) => p.tier === "Basic")!;
    expect(basic.price).toBe(10);
    expect(basic.period).toBe("month");
    expect(basic.propertyLimit).toBe(1);
    expect(basic.photosPerJob).toBe(5);
    expect(basic.quoteRequests).toBe(3);
    expect(basic.features.some((f) => /contractor/i.test(f))).toBe(true);
  });

  it("Pro tier is $20/month with 5 property limit", () => {
    const pro = PLANS.find((p) => p.tier === "Pro")!;
    expect(pro.price).toBe(20);
    expect(pro.period).toBe("month");
    expect(pro.propertyLimit).toBe(5);
    expect(pro.photosPerJob).toBe(10);
    expect(pro.quoteRequests).toBe(10);
  });

  it("Premium tier is $35/month with 20 property limit", () => {
    const premium = PLANS.find((p) => p.tier === "Premium")!;
    expect(premium.price).toBe(35);
    expect(premium.period).toBe("month");
    expect(premium.propertyLimit).toBe(20);
    expect(premium.photosPerJob).toBe(30);
    expect(premium.quoteRequests).toBe(Infinity);
  });

  it("ContractorFree tier is $0 with basic contractor features", () => {
    const cf = PLANS.find((p) => p.tier === "ContractorFree")!;
    expect(cf).toBeDefined();
    expect(cf.price).toBe(0);
    expect(cf.period).toBe("free");
    expect(cf.photosPerJob).toBeGreaterThanOrEqual(5);
    expect(cf.propertyLimit).toBe(0); // N/A for contractors
  });

  it("ContractorFree has a non-empty features array mentioning profile listing", () => {
    const cf = PLANS.find((p) => p.tier === "ContractorFree")!;
    expect(cf.features.some((f) => /profile/i.test(f))).toBe(true);
  });

  it("ContractorFree earns via referral — has referral callout in features", () => {
    const cf = PLANS.find((p) => p.tier === "ContractorFree")!;
    expect(cf.features.some((f) => /referral|lead fee|per.job/i.test(f))).toBe(true);
  });

  it("ContractorPro tier is $30/month", () => {
    const cp = PLANS.find((p) => p.tier === "ContractorPro")!;
    expect(cp.price).toBe(30);
    expect(cp.period).toBe("month");
    expect(cp.photosPerJob).toBe(50);
    expect(cp.quoteRequests).toBe(Infinity);
  });

  it("every paid plan has a non-empty features array", () => {
    PLANS.filter((p) => p.price > 0 || p.tier === "ContractorFree").forEach((p) => {
      expect(Array.isArray(p.features)).toBe(true);
      expect(p.features.length).toBeGreaterThan(0);
    });
  });

  it("homeowner paid tiers have higher property limits than Basic", () => {
    const basic = PLANS.find((p) => p.tier === "Basic")!;
    const homeownerAboveBasic = PLANS.filter((p) => (p.tier === "Pro" || p.tier === "Premium"));
    homeownerAboveBasic.forEach((p) => {
      expect(p.propertyLimit).toBeGreaterThan(basic.propertyLimit);
    });
  });
});

// ─── ANNUAL_PLANS data integrity ──────────────────────────────────────────────

describe("ANNUAL_PLANS", () => {
  it("ANNUAL_PLANS is exported and is an array", () => {
    expect(Array.isArray(ANNUAL_PLANS)).toBe(true);
  });

  it("contains Basic, Pro, and Premium annual variants (no Free or Contractor annual)", () => {
    const tiers = ANNUAL_PLANS.map((p) => p.tier);
    expect(tiers).toContain("Basic");
    expect(tiers).toContain("Pro");
    expect(tiers).toContain("Premium");
    expect(tiers).not.toContain("Free");
    expect(tiers).not.toContain("ContractorFree");
  });

  it("annual Basic costs 10x monthly Basic", () => {
    const monthlyBasic = PLANS.find((p) => p.tier === "Basic")!;
    const annualBasic  = ANNUAL_PLANS.find((p) => p.tier === "Basic")!;
    expect(annualBasic.price).toBeLessThan(monthlyBasic.price * 12);
    // Exactly 10 months: $10 * 10 = $100
    expect(annualBasic.price).toBe(monthlyBasic.price * 10);
  });

  it("annual Pro costs less than 12x monthly Pro (2 months free = ~17% discount)", () => {
    const monthlyPro = PLANS.find((p) => p.tier === "Pro")!;
    const annualPro  = ANNUAL_PLANS.find((p) => p.tier === "Pro")!;
    expect(annualPro.price).toBeLessThan(monthlyPro.price * 12);
    // Exactly 10 months: $20 * 10 = $200
    expect(annualPro.price).toBe(monthlyPro.price * 10);
  });

  it("annual Premium costs 10x monthly Premium", () => {
    const monthlyPremium = PLANS.find((p) => p.tier === "Premium")!;
    const annualPremium  = ANNUAL_PLANS.find((p) => p.tier === "Premium")!;
    expect(annualPremium.price).toBe(monthlyPremium.price * 10);
  });

  it("annual plans have period = 'year'", () => {
    ANNUAL_PLANS.forEach((p) => expect(p.period).toBe("year"));
  });

  it("annual plans preserve the same features as their monthly counterpart", () => {
    ANNUAL_PLANS.forEach((annual) => {
      const monthly = PLANS.find((p) => p.tier === annual.tier)!;
      expect(annual.features).toEqual(monthly.features);
    });
  });
});

// ─── getPlan ──────────────────────────────────────────────────────────────────

describe("paymentService.getPlan", () => {
  const tiers: PlanTier[] = ["Free", "Basic", "Pro", "Premium", "ContractorFree", "ContractorPro"];

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

// ─── subscribeAnnual (mock path) ──────────────────────────────────────────────

describe("paymentService.subscribeAnnual (mock)", () => {
  it("is a function", () => {
    expect(typeof paymentService.subscribeAnnual).toBe("function");
  });

  it("resolves without error in mock mode (Pro annual)", async () => {
    await expect(paymentService.subscribeAnnual("Pro")).resolves.toBeUndefined();
  });

  it("resolves without error in mock mode (Premium annual)", async () => {
    await expect(paymentService.subscribeAnnual("Premium")).resolves.toBeUndefined();
  });
});

// ─── subscribe (mock path — no PAYMENT_CANISTER_ID) ──────────────────────────

describe("paymentService.subscribe (mock)", () => {
  it("resolves without error when no canister is deployed (Free)", async () => {
    await expect(paymentService.subscribe("Free")).resolves.toBeUndefined();
  });

  it("resolves without error when no canister is deployed (Basic)", async () => {
    await expect(paymentService.subscribe("Basic")).resolves.toBeUndefined();
  });

  it("resolves without error when no canister is deployed (Pro)", async () => {
    await expect(paymentService.subscribe("Pro")).resolves.toBeUndefined();
  });

  it("calls onStep callback for paid tiers (quoting → approving → confirming)", async () => {
    const onStep = vi.fn();
    await paymentService.subscribe("Pro", onStep);
    expect(onStep).toHaveBeenCalledWith("quoting");
    expect(onStep).toHaveBeenCalledWith("approving");
    expect(onStep).toHaveBeenCalledWith("confirming");
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
    const tiers: PlanTier[] = ["Basic", "Pro", "Premium", "ContractorFree", "ContractorPro"];
    for (const tier of tiers) {
      const result = await paymentService.initiate(tier);
      expect(result.url).toBe("/dashboard");
    }
  });
});
