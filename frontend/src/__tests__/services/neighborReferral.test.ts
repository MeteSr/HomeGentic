/**
 * neighborReferralService — real logic worth locking down against the
 * unconfigured-canister default path (REFERRALS_CANISTER_ID is unset in
 * this test environment, so every method takes its mock/local branch):
 *   - getMyCode returns the fixed mock code
 *   - useReferralCode rejects self-referral against the mock code, succeeds otherwise
 *   - getMyReferrals/getCreditBalance return empty/zero without a canister
 *   - buildShareUrl embeds the code as a query param
 *   - pending-ref-code sessionStorage helpers round-trip correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import { neighborReferralService } from "@/services/neighborReferral";

beforeEach(() => sessionStorage.clear());

describe("neighborReferralService — unconfigured canister", () => {
  it("getMyCode returns the fixed mock code", async () => {
    expect(await neighborReferralService.getMyCode()).toBe("HG-000001");
  });

  it("useReferralCode rejects the mock code as self-referral", async () => {
    expect(await neighborReferralService.useReferralCode("HG-000001")).toEqual({ err: "SelfReferral" });
  });

  it("useReferralCode succeeds for any other code", async () => {
    expect(await neighborReferralService.useReferralCode("SOMEONE-ELSE")).toEqual({ ok: true });
  });

  it("getMyReferrals returns an empty array", async () => {
    expect(await neighborReferralService.getMyReferrals()).toEqual([]);
  });

  it("getCreditBalance returns 0", async () => {
    expect(await neighborReferralService.getCreditBalance()).toBe(0);
  });
});

describe("neighborReferralService.buildShareUrl", () => {
  it("embeds the code as a URL-encoded ref query param", () => {
    const url = neighborReferralService.buildShareUrl("HG-ABC 123");
    expect(url).toBe("http://localhost:3000?ref=HG-ABC%20123");
  });
});

describe("neighborReferralService — pending ref code", () => {
  it("returns null when nothing has been captured", () => {
    expect(neighborReferralService.getPendingRefCode()).toBeNull();
  });

  it("round-trips capture → get → clear", () => {
    neighborReferralService.capturePendingRefCode("HG-XYZ");
    expect(neighborReferralService.getPendingRefCode()).toBe("HG-XYZ");
    neighborReferralService.clearPendingRefCode();
    expect(neighborReferralService.getPendingRefCode()).toBeNull();
  });
});
