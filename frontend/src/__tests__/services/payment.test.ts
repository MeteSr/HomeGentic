import { describe, it, expect, beforeEach, vi } from "vitest";
import { paymentService } from "@/services/payment";
import { PLANS, ANNUAL_PLANS, type PlanTier } from "@/services/planConstants";

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
  ok: { tier: { Basic: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [] },
});
const mockGetMySubscription = vi.fn().mockResolvedValue({
  ok: { tier: { Basic: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [] },
});
const mockCancelSubscription = vi.fn().mockResolvedValue({
  ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [BigInt(1_000_000_000)] },
});
const mockGetPriceQuote = vi.fn().mockResolvedValue({ ok: BigInt(1_000_000) });
const mockCreateStripeCheckoutSession = vi.fn().mockResolvedValue({
  ok: { id: "cs_test_123", url: "https://checkout.stripe.com/pay/test" },
});
const mockVerifyStripeSession = vi.fn().mockResolvedValue({
  ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0) },
});
const mockRedeemGift = vi.fn().mockResolvedValue({
  ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0) },
});

vi.mock("@icp-sdk/core/agent", () => ({
  Actor: {
    createActor: vi.fn(() => ({
      subscribe:                   mockSubscribeActor,
      getMySubscription:           mockGetMySubscription,
      cancelSubscription:          mockCancelSubscription,
      getPriceQuote:               mockGetPriceQuote,
      getPricing:                  vi.fn().mockResolvedValue({ ok: null }),
      getAllPricing:               vi.fn().mockResolvedValue({ ok: [] }),
      createStripeCheckoutSession: mockCreateStripeCheckoutSession,
      verifyStripeSession:         mockVerifyStripeSession,
      redeemGift:                  mockRedeemGift,
    })),
  },
  HttpAgent: { create: vi.fn().mockResolvedValue({}) },
}));

// ─── PLANS data integrity ─────────────────────────────────────────────────────

describe("PLANS", () => {
  it("contains exactly 8 tiers (Free, Basic, Pro, Premium, ContractorFree, ContractorPro, RealtorFree, RealtorPro)", () => {
    expect(PLANS).toHaveLength(8);
  });

  it("contains all expected tiers in order", () => {
    expect(PLANS.map((p) => p.tier)).toEqual(["Free", "Basic", "Pro", "Premium", "ContractorFree", "ContractorPro", "RealtorFree", "RealtorPro"]);
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

  it("Premium tier is $40/month with 20 property limit", () => {
    const premium = PLANS.find((p) => p.tier === "Premium")!;
    expect(premium.price).toBe(40);
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
  it("returns Basic tier when no canister is deployed", async () => {
    const sub = await paymentService.getMySubscription();
    expect(sub.tier).toBe("Basic");
  });

  it("returns null expiresAt in mock mode", async () => {
    const sub = await paymentService.getMySubscription();
    expect(sub.expiresAt).toBeNull();
  });
});

// ─── hasPaidFor (mock path) ───────────────────────────────────────────────────

describe("paymentService.hasPaidFor (mock)", () => {
  it("returns true for paid tiers (Basic and above)", async () => {
    expect(await paymentService.hasPaidFor("reports")).toBe(true);
    expect(await paymentService.hasPaidFor("analytics")).toBe(true);
    expect(await paymentService.hasPaidFor("")).toBe(true);
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

// ─── getMySubscription — canister path (all 6 tier variants) ─────────────────

describe("paymentService.getMySubscription — tier parsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentService.reset();
  });

  const tiers: PlanTier[] = ["Free", "Basic", "Pro", "Premium", "ContractorFree", "ContractorPro"];

  it.each(tiers)("parses '%s' tier variant from canister response", async (tier) => {
    mockGetMySubscription.mockResolvedValueOnce({
      ok: { tier: { [tier]: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [] },
    });
    const sub = await paymentService.getMySubscription();
    expect(sub.tier).toBe(tier);
  });

  it("returns expiresAt=null when expiresAt is 0", async () => {
    mockGetMySubscription.mockResolvedValueOnce({
      ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [] },
    });
    const sub = await paymentService.getMySubscription();
    expect(sub.expiresAt).toBeNull();
  });

  it("converts non-zero expiresAt from nanoseconds to milliseconds", async () => {
    const expiresNs = BigInt(1_735_689_600_000) * BigInt(1_000_000);
    mockGetMySubscription.mockResolvedValueOnce({
      ok: { tier: { Premium: null }, expiresAt: expiresNs, owner: "x", createdAt: BigInt(0), cancelledAt: [] },
    });
    const sub = await paymentService.getMySubscription();
    expect(sub.expiresAt).toBeCloseTo(1_735_689_600_000, -3);
  });

  it("returns cancelledAt: null when cancelledAt is empty array", async () => {
    mockGetMySubscription.mockResolvedValueOnce({
      ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [] },
    });
    const sub = await paymentService.getMySubscription();
    expect(sub.cancelledAt).toBeNull();
  });

  it("parses cancelledAt from nanoseconds to milliseconds when present", async () => {
    const cancelledNs = BigInt(1_735_689_600_000) * BigInt(1_000_000);
    mockGetMySubscription.mockResolvedValueOnce({
      ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [cancelledNs] },
    });
    const sub = await paymentService.getMySubscription();
    expect(sub.cancelledAt).toBeCloseTo(1_735_689_600_000, -3);
  });

  it("returns Basic tier when canister returns NotFound (mid-checkout fallback)", async () => {
    mockGetMySubscription.mockResolvedValueOnce({ err: { NotFound: null } });
    const sub = await paymentService.getMySubscription();
    expect(sub.tier).toBe("Basic");
    expect(sub.expiresAt).toBeNull();
    expect(sub.cancelledAt).toBeNull();
  });
});

// ─── subscribe — error handling ───────────────────────────────────────────────

describe("paymentService.subscribe — error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentService.reset();
  });

  it("throws with key when subscribe canister returns a non-text error", async () => {
    mockGetPriceQuote.mockResolvedValueOnce({ ok: BigInt(1_000_000) });
    mockSubscribeActor.mockResolvedValueOnce({ err: { RateLimited: null } });
    await expect(paymentService.subscribe("Pro")).rejects.toThrow("RateLimited");
  });

  it("throws with text payload when subscribe returns PaymentFailed error", async () => {
    mockGetPriceQuote.mockResolvedValueOnce({ ok: BigInt(1_000_000) });
    mockSubscribeActor.mockResolvedValueOnce({ err: { PaymentFailed: "Insufficient ICP balance" } });
    await expect(paymentService.subscribe("Pro")).rejects.toThrow("Insufficient ICP balance");
  });

  it("throws when getPriceQuote returns an error", async () => {
    mockGetPriceQuote.mockResolvedValueOnce({ err: { NotAuthorized: null } });
    await expect(paymentService.subscribe("Pro")).rejects.toThrow("NotAuthorized");
  });
});

// ─── cancel / recordCancellation / getCancellationInfo ───────────────────────

describe("paymentService.cancel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentService.reset();
  });

  it("returns { expiresAt: null } when expiresAt is 0", async () => {
    mockCancelSubscription.mockResolvedValueOnce({
      ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0), cancelledAt: [BigInt(1_000_000_000)] },
    });
    const result = await paymentService.cancel();
    expect(result.expiresAt).toBeNull();
  });

  it("converts non-zero expiresAt from nanoseconds to milliseconds", async () => {
    const expiresNs = BigInt(1_735_689_600_000) * BigInt(1_000_000);
    mockCancelSubscription.mockResolvedValueOnce({
      ok: { tier: { Pro: null }, expiresAt: expiresNs, owner: "x", createdAt: BigInt(0), cancelledAt: [BigInt(1_000_000_000)] },
    });
    const result = await paymentService.cancel();
    expect(result.expiresAt).toBeCloseTo(1_735_689_600_000, -3);
  });

  it("throws with key when canister returns a non-text error", async () => {
    mockCancelSubscription.mockResolvedValueOnce({ err: { NotAuthorized: null } });
    await expect(paymentService.cancel()).rejects.toThrow("NotAuthorized");
  });

  it("throws with text message when canister returns InvalidInput", async () => {
    mockCancelSubscription.mockResolvedValueOnce({ err: { InvalidInput: "Subscription already cancelled" } });
    await expect(paymentService.cancel()).rejects.toThrow("Subscription already cancelled");
  });
});

describe("paymentService.recordCancellation / getCancellationInfo", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getCancellationInfo returns null when nothing is stored", () => {
    expect(paymentService.getCancellationInfo()).toBeNull();
  });

  it("recordCancellation stores a timestamp and getCancellationInfo returns it", () => {
    const before = Date.now();
    paymentService.recordCancellation();
    const info = paymentService.getCancellationInfo();
    expect(info).not.toBeNull();
    expect(info!.cancelledAt).toBeGreaterThanOrEqual(before);
    expect(info!.cancelledAt).toBeLessThanOrEqual(Date.now());
  });
});

// ─── pause / resume / getPauseState ──────────────────────────────────────────

describe("paymentService pause/resume", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("getPauseState returns null when not paused", () => {
    expect(paymentService.getPauseState()).toBeNull();
  });

  it("pause stores a future resumeAt timestamp", () => {
    paymentService.pause(1);
    const state = paymentService.getPauseState();
    expect(state).not.toBeNull();
    expect(state!.pausedUntil).toBeGreaterThan(Date.now());
    expect(state!.daysLeft).toBe(30);
  });

  it("pause(2) gives roughly 60 daysLeft", () => {
    paymentService.pause(2);
    const state = paymentService.getPauseState();
    expect(state!.daysLeft).toBe(60);
  });

  it("resume clears the pause and getPauseState returns null", () => {
    paymentService.pause(1);
    paymentService.resume();
    expect(paymentService.getPauseState()).toBeNull();
  });

  it("getPauseState returns null and clears storage when pause has expired", () => {
    // Simulate a past timestamp
    localStorage.setItem("homegentic_sub_paused_until", String(Date.now() - 1000));
    expect(paymentService.getPauseState()).toBeNull();
    expect(localStorage.getItem("homegentic_sub_paused_until")).toBeNull();
  });
});

// ─── startStripeCheckout — dev/Express path (USE_EXPRESS_CHECKOUT=true in test) ─

describe("paymentService.startStripeCheckout — dev/Express path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentService.reset();
    Object.defineProperty(window, "location", {
      value: { href: "", origin: "http://localhost:3000" },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to Stripe URL returned by Express on success", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ url: "https://checkout.stripe.com/pay/cs_express_123" }),
    } as Response);
    await paymentService.startStripeCheckout("Pro", "Monthly");
    expect(window.location.href).toBe("https://checkout.stripe.com/pay/cs_express_123");
  });

  it("throws when Express returns an error response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok:   false,
      json: async () => ({ error: "Stripe not configured" }),
    } as Response);
    await expect(paymentService.startStripeCheckout("Pro", "Monthly")).rejects.toThrow("Stripe not configured");
  });

  it("passes gift metadata to Express endpoint when provided", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ url: "https://checkout.stripe.com/pay/gift_123" }),
    } as Response);
    await paymentService.startStripeCheckout("Pro", "Monthly", {
      recipientEmail: "alice@example.com", recipientName: "Alice",
      senderName: "Bob", giftMessage: "Happy home!", deliveryDate: "2025-12-25",
    });
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.gift.recipientEmail).toBe("alice@example.com");
  });
});

// ─── verifyStripeSession — dev/Express path ───────────────────────────────────

describe("paymentService.verifyStripeSession — dev/Express path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentService.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns { type: 'subscription' } on successful Express response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ type: "subscription", tier: "Pro" }),
    } as Response);
    const result = await paymentService.verifyStripeSession("cs_test_session");
    expect(result.type).toBe("subscription");
  });

  it("returns { type: 'gift', giftToken } for gift purchases", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok:   true,
      json: async () => ({ type: "gift", giftToken: "GIFT-TOKEN-ABC" }),
    } as Response);
    const result = await paymentService.verifyStripeSession("GIFT-TOKEN-ABC");
    expect(result.type).toBe("gift");
    expect((result as any).giftToken).toBe("GIFT-TOKEN-ABC");
  });

  it("throws when Express returns a non-ok response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok:   false,
      json: async () => ({ error: "Session not found" }),
    } as Response);
    await expect(paymentService.verifyStripeSession("cs_bad")).rejects.toThrow("Session not found");
  });
});

// ─── redeemGift — canister path ───────────────────────────────────────────────

describe("paymentService.redeemGift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    paymentService.reset();
  });

  it("resolves without error on success", async () => {
    mockRedeemGift.mockResolvedValueOnce({
      ok: { tier: { Pro: null }, expiresAt: BigInt(0), owner: "x", createdAt: BigInt(0) },
    });
    await expect(paymentService.redeemGift("GIFT-TOKEN-XYZ")).resolves.toBeUndefined();
  });

  it("throws with key on non-text error", async () => {
    mockRedeemGift.mockResolvedValueOnce({ err: { NotFound: null } });
    await expect(paymentService.redeemGift("bad-token")).rejects.toThrow("NotFound");
  });

  it("throws with text message on text-payload error", async () => {
    mockRedeemGift.mockResolvedValueOnce({ err: { InvalidInput: "Token already redeemed" } });
    await expect(paymentService.redeemGift("used-token")).rejects.toThrow("Token already redeemed");
  });
});
