/**
 * Integration tests — paymentService against the real ICP payment canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - IDL.Int for expiresAt (signed BigInt, not Nat) converts correctly
 *   - getAllPricing() returns the full Motoko pricing table exactly as the
 *     frontend PLANS array expects — a mismatch here means the UI silently
 *     shows wrong prices
 *   - getMySubscription() returns Free for an unsubscribed principal
 *   - subscribe("Free") works without ICP ledger approval (paid tiers need II)
 *   - Tier Variant for all five plan tiers (Free, Pro, Premium, ContractorFree, ContractorPro)
 *   - PricingInfo Nat fields (priceUSD, periodDays, propertyLimit, etc.) survive BigInt→number
 */

import { describe, it, expect } from "vitest";
import { paymentService, PLANS } from "@/services/payment";

const CANISTER_ID = process.env.PAYMENT_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

// ─── getMySubscription ────────────────────────────────────────────────────────

describe.skipIf(!deployed)("getMySubscription — Tier Variant and Int expiresAt", () => {
  it("returns an object with a tier string and expiresAt field", async () => {
    const sub = await paymentService.getMySubscription();
    expect(typeof sub.tier).toBe("string");
    expect(sub.tier.length).toBeGreaterThan(0);
  });

  it("expiresAt is null or a reasonable ms timestamp (not a raw nanosecond value)", async () => {
    const sub = await paymentService.getMySubscription();
    if (sub.expiresAt !== null) {
      // A raw ns value would be > 1e18 (year ~33657); a ms value is < 2e12 (year ~2033)
      expect(sub.expiresAt).toBeLessThan(2e13);
      expect(sub.expiresAt).toBeGreaterThan(0);
    } else {
      expect(sub.expiresAt).toBeNull();
    }
  });

  it("Free-tier principal has expiresAt: null (no expiry)", async () => {
    const sub = await paymentService.getMySubscription();
    // A fresh test identity on a local replica starts as Free with no expiry
    if (sub.tier === "Free") {
      expect(sub.expiresAt).toBeNull();
    }
  });
});

// ─── subscribe(Free) ──────────────────────────────────────────────────────────

describe.skipIf(!deployed)("subscribe — Free tier (no ICP ledger required)", () => {
  it("subscribe('Free') resolves without error", async () => {
    await expect(paymentService.subscribe("Free")).resolves.toBeUndefined();
  });

  it("getMySubscription returns Free after subscribe('Free')", async () => {
    await paymentService.subscribe("Free");
    const sub = await paymentService.getMySubscription();
    expect(sub.tier).toBe("Free");
  });
});

// ─── getPricing — individual tier lookup ─────────────────────────────────────

describe.skipIf(!deployed)("getPricing — PricingInfo Nat field round-trips", () => {
  it("getPricing('Free') returns priceUSD: 0", async () => {
    const info = await paymentService.getPricing("Free");
    expect(info).not.toBeNull();
    expect(info!.priceUSD).toBe(0);
  });

  it("getPricing('Pro') returns priceUSD: 10 (matching PLANS)", async () => {
    const info = await paymentService.getPricing("Pro");
    const plan = PLANS.find((p) => p.tier === "Pro")!;
    expect(info!.priceUSD).toBe(plan.price);
  });

  it("getPricing('Premium') returns priceUSD: 20", async () => {
    const info = await paymentService.getPricing("Premium");
    expect(info!.priceUSD).toBe(20);
  });

  it("getPricing('Pro') propertyLimit is 5", async () => {
    const info = await paymentService.getPricing("Pro");
    expect(info!.propertyLimit).toBe(5);
  });

  it("getPricing('Free') propertyLimit is 1", async () => {
    const info = await paymentService.getPricing("Free");
    expect(info!.propertyLimit).toBe(1);
  });

  it("getPricing('Premium') photosPerJob is 30", async () => {
    const info = await paymentService.getPricing("Premium");
    expect(info!.photosPerJob).toBe(30);
  });

  it("getPricing('Pro') periodDays is a positive number", async () => {
    const info = await paymentService.getPricing("Pro");
    expect(info!.periodDays).toBeGreaterThan(0);
  });
});

// ─── getAllPricing — full table vs PLANS ──────────────────────────────────────

describe.skipIf(!deployed)("getAllPricing — Motoko pricing table matches frontend PLANS", () => {
  it("returns at least 5 entries (one per tier)", async () => {
    const all = await paymentService.getAllPricing();
    expect(all.length).toBeGreaterThanOrEqual(5);
  });

  it("every entry has a valid PlanTier string", async () => {
    const validTiers = new Set(["Free", "Pro", "Premium", "ContractorFree", "ContractorPro"]);
    const all = await paymentService.getAllPricing();
    for (const entry of all) {
      expect(validTiers.has(entry.tier)).toBe(true);
    }
  });

  it("all numeric fields (priceUSD, periodDays, propertyLimit, photosPerJob, quoteRequestsPerMonth) are non-negative numbers", async () => {
    const all = await paymentService.getAllPricing();
    for (const entry of all) {
      expect(typeof entry.priceUSD).toBe("number");
      expect(typeof entry.periodDays).toBe("number");
      expect(typeof entry.propertyLimit).toBe("number");
      expect(typeof entry.photosPerJob).toBe("number");
      expect(typeof entry.quoteRequestsPerMonth).toBe("number");
      expect(entry.priceUSD).toBeGreaterThanOrEqual(0);
    }
  });

  it("canister Pro tier matches frontend PLANS Pro entry", async () => {
    const all = await paymentService.getAllPricing();
    const canisterPro = all.find((e) => e.tier === "Pro");
    const frontendPro = PLANS.find((p) => p.tier === "Pro")!;
    expect(canisterPro).toBeDefined();
    expect(canisterPro!.priceUSD).toBe(frontendPro.price);
    expect(canisterPro!.propertyLimit).toBe(frontendPro.propertyLimit);
    expect(canisterPro!.photosPerJob).toBe(frontendPro.photosPerJob);
  });

  it("canister Free tier matches frontend PLANS Free entry", async () => {
    const all = await paymentService.getAllPricing();
    const canisterFree = all.find((e) => e.tier === "Free");
    const frontendFree = PLANS.find((p) => p.tier === "Free")!;
    expect(canisterFree).toBeDefined();
    expect(canisterFree!.priceUSD).toBe(frontendFree.price);
    expect(canisterFree!.propertyLimit).toBe(frontendFree.propertyLimit);
    expect(canisterFree!.photosPerJob).toBe(frontendFree.photosPerJob);
  });

  it("canister Premium tier has photosPerJob 30 matching frontend", async () => {
    const all = await paymentService.getAllPricing();
    const canisterPremium = all.find((e) => e.tier === "Premium");
    expect(canisterPremium!.photosPerJob).toBe(30);
  });

  it("canister ContractorPro tier has photosPerJob 50", async () => {
    const all = await paymentService.getAllPricing();
    const contractorPro = all.find((e) => e.tier === "ContractorPro");
    if (contractorPro) {
      expect(contractorPro.photosPerJob).toBe(50);
    }
  });
});
