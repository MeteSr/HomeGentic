import { describe, it, expect } from "vitest";
import { referralService } from "@/services/referralService";

// ─── referralService unit tests ───────────────────────────────────────────────
// These run in mock mode (no canister deployed in test env).

describe("referralService.isReferralJob", () => {
  it("returns true when sourceQuoteId is a non-empty string", () => {
    expect(referralService.isReferralJob({ sourceQuoteId: "q-123" })).toBe(true);
  });

  it("returns false when sourceQuoteId is null", () => {
    expect(referralService.isReferralJob({ sourceQuoteId: null })).toBe(false);
  });

  it("returns false when sourceQuoteId is undefined", () => {
    expect(referralService.isReferralJob({})).toBe(false);
  });

  it("returns false when sourceQuoteId is empty string", () => {
    expect(referralService.isReferralJob({ sourceQuoteId: "" })).toBe(false);
  });
});

describe("referralService.calculateFee", () => {
  it("returns a positive number for a given job amount", () => {
    const fee = referralService.calculateFee(50000); // $500 job in cents
    expect(fee).toBeGreaterThan(0);
  });

  it("scales with job amount (percentage, not flat)", () => {
    // Business model: 3% of awarded value per winning bid
    const fee1 = referralService.calculateFee(100000); // $1,000 job
    const fee2 = referralService.calculateFee(200000); // $2,000 job
    expect(fee2).toBe(fee1 * 2);
    expect(fee1).toBe(3000); // 3% of $1,000 = $30
  });

  it("applies the $20 floor on small jobs", () => {
    const fee = referralService.calculateFee(18500); // $185 job — 3% would be $5.55
    expect(fee).toBe(2000); // $20 floor instead
  });

  it("switches from floor to percentage above the crossover ($667 awarded)", () => {
    const belowCrossover = referralService.calculateFee(66600); // $666
    const aboveCrossover = referralService.calculateFee(70000); // $700
    expect(belowCrossover).toBe(2000);      // floor
    expect(aboveCrossover).toBe(2100);      // 3% of $700
  });
});

describe("referralService.isFloored", () => {
  it("is true when 3% of the job amount is under the $20 floor", () => {
    expect(referralService.isFloored(18500)).toBe(true); // $185 job
  });

  it("is false once 3% of the job amount clears the $20 floor", () => {
    expect(referralService.isFloored(100000)).toBe(false); // $1,000 job
  });
});

describe("referralService.getPendingFees (mock)", () => {
  it("is a function", () => {
    expect(typeof referralService.getPendingFees).toBe("function");
  });

  it("returns an array in mock mode", async () => {
    const fees = await referralService.getPendingFees();
    expect(Array.isArray(fees)).toBe(true);
  });
});

describe("referralService.REFERRAL_FEE_RATE / REFERRAL_FEE_FLOOR_CENTS", () => {
  it("rate is exported as 3%", () => {
    expect(referralService.REFERRAL_FEE_RATE).toBe(0.03);
  });

  it("floor is exported as a round dollar amount in cents", () => {
    expect(typeof referralService.REFERRAL_FEE_FLOOR_CENTS).toBe("number");
    expect(referralService.REFERRAL_FEE_FLOOR_CENTS % 100).toBe(0);
    expect(referralService.REFERRAL_FEE_FLOOR_CENTS).toBe(2000); // $20
  });
});
