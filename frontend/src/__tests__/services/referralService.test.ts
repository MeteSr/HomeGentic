/**
 * referralService — real logic worth locking down:
 *   - isReferralJob is true only when sourceQuoteId is a non-empty string
 *   - calculateFee charges 3% of the awarded value, or the $20/2000-cent
 *     floor on small jobs, whichever is greater
 *   - isFloored reports exactly when the floor (not the percentage) is
 *     what calculateFee actually charged
 *   - getPendingFees is a not-yet-implemented stub that resolves to []
 */

import { describe, it, expect } from "vitest";
import { referralService } from "@/services/referralService";

describe("referralService.isReferralJob", () => {
  it("is true when sourceQuoteId is a non-empty string", () => {
    expect(referralService.isReferralJob({ sourceQuoteId: "quote-1" })).toBe(true);
  });

  it("is false when sourceQuoteId is undefined", () => {
    expect(referralService.isReferralJob({})).toBe(false);
  });

  it("is false when sourceQuoteId is null", () => {
    expect(referralService.isReferralJob({ sourceQuoteId: null })).toBe(false);
  });

  it("is false when sourceQuoteId is an empty string", () => {
    expect(referralService.isReferralJob({ sourceQuoteId: "" })).toBe(false);
  });
});

describe("referralService.calculateFee", () => {
  it("charges 3% of the awarded value for a large job", () => {
    expect(referralService.calculateFee(1_000_000)).toBe(30_000);
  });

  it("rounds the percentage to the nearest cent", () => {
    expect(referralService.calculateFee(333_333)).toBe(Math.round(333_333 * 0.03));
  });

  it("charges the $20 floor when 3% would be less", () => {
    expect(referralService.calculateFee(10_000)).toBe(2_000);
  });

  it("charges exactly the floor right at and below the breakeven amount", () => {
    // 2000 / 0.03 = 66,666.67 — below that, the rounded 3% cut is still <= the floor
    expect(referralService.calculateFee(66_666)).toBe(2_000);
    expect(referralService.calculateFee(60_000)).toBe(2_000);
  });

  it("charges the rounded percentage once it clears the floor", () => {
    // 66,684 * 0.03 = 2000.52, which rounds up past the $20 floor
    expect(referralService.calculateFee(66_684)).toBe(2_001);
  });
});

describe("referralService.isFloored", () => {
  it("is true for a small job charged the flat floor", () => {
    expect(referralService.isFloored(10_000)).toBe(true);
  });

  it("is false for a large job charged the percentage", () => {
    expect(referralService.isFloored(1_000_000)).toBe(false);
  });

  it("agrees with calculateFee for an amount well past the floor", () => {
    expect(referralService.isFloored(66_684)).toBe(false);
    expect(referralService.calculateFee(66_684)).toBeGreaterThan(referralService.REFERRAL_FEE_FLOOR_CENTS);
  });
});

describe("referralService.getPendingFees", () => {
  it("resolves to an empty array (canister call not yet implemented)", async () => {
    await expect(referralService.getPendingFees()).resolves.toEqual([]);
  });
});
