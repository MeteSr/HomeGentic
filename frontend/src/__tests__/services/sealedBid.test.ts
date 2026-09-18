/**
 * sealedBidService — real logic worth locking down:
 *   - submitSealedBid throws once the bid window has closed
 *   - revealBids throws if called before the window closes, is idempotent
 *     after, and correctly identifies the lowest bid as the winner
 *   - getMyBid only returns the calling contractor's own bid
 *   - reset() clears all in-memory state
 */

import { describe, it, expect, beforeEach } from "vitest";
import { sealedBidService } from "@/services/sealedBid";

beforeEach(() => sealedBidService.reset());

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: "req-1", propertyId: "prop-1", serviceType: "HVAC", description: "AC repair",
    urgency: "medium" as const, closeAt: 2000,
    ...overrides,
  };
}

describe("sealedBidService.isBidWindowOpen", () => {
  it("is true before closeAt and false after", () => {
    const req = sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    expect(sealedBidService.isBidWindowOpen(req, 1500)).toBe(true);
    expect(sealedBidService.isBidWindowOpen(req, 2500)).toBe(false);
  });
});

describe("sealedBidService.submitSealedBid", () => {
  it("throws once the bid window has closed", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    expect(() => sealedBidService.submitSealedBid("req-1", 50000, 3, "contractor-1", 2500)).toThrow(/Bid window closed/);
  });

  it("succeeds while the window is open", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    const bid = sealedBidService.submitSealedBid("req-1", 50000, 3, "contractor-1", 1500);
    expect(bid.requestId).toBe("req-1");
    expect(bid.contractor).toBe("contractor-1");
  });
});

describe("sealedBidService.getMyBid", () => {
  it("returns only the calling contractor's own bid", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    sealedBidService.submitSealedBid("req-1", 50000, 3, "contractor-1", 1500);
    sealedBidService.submitSealedBid("req-1", 60000, 5, "contractor-2", 1500);

    expect(sealedBidService.getMyBid("req-1", "contractor-1")?.contractor).toBe("contractor-1");
    expect(sealedBidService.getMyBid("req-1", "contractor-3")).toBeUndefined();
  });
});

describe("sealedBidService.revealBids", () => {
  it("throws when called before the window closes", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    expect(() => sealedBidService.revealBids("req-1", "owner", 1500)).toThrow(/still open/);
  });

  it("decrypts all bids and marks the lowest as the winner", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    sealedBidService.submitSealedBid("req-1", 80000, 3, "contractor-1", 1500);
    sealedBidService.submitSealedBid("req-1", 50000, 5, "contractor-2", 1500);
    sealedBidService.submitSealedBid("req-1", 65000, 4, "contractor-3", 1500);

    const revealed = sealedBidService.revealBids("req-1", "owner", 2500);
    expect(revealed).toHaveLength(3);
    const winner = revealed.find((b) => b.isWinner);
    expect(winner?.contractor).toBe("contractor-2");
    expect(winner?.amountCents).toBe(50000);
  });

  it("is idempotent — calling twice returns the same cached result", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    sealedBidService.submitSealedBid("req-1", 50000, 3, "contractor-1", 1500);
    const first = sealedBidService.revealBids("req-1", "owner", 2500);
    const second = sealedBidService.revealBids("req-1", "owner", 2500);
    expect(second).toBe(first);
  });
});

describe("sealedBidService.getWinner / getRevealedBids", () => {
  it("returns undefined/empty before reveal", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    sealedBidService.submitSealedBid("req-1", 50000, 3, "contractor-1", 1500);
    expect(sealedBidService.getRevealedBids("req-1")).toEqual([]);
    expect(sealedBidService.getWinner("req-1")).toBeUndefined();
  });

  it("returns the winner after reveal", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    sealedBidService.submitSealedBid("req-1", 50000, 3, "contractor-1", 1500);
    sealedBidService.revealBids("req-1", "owner", 2500);
    expect(sealedBidService.getWinner("req-1")?.contractor).toBe("contractor-1");
  });
});

describe("sealedBidService.reset", () => {
  it("clears all in-memory state", () => {
    sealedBidService.createSealedBidRequest(makeRequest(), "owner", 1000);
    sealedBidService.submitSealedBid("req-1", 50000, 3, "contractor-1", 1500);
    sealedBidService.reset();
    expect(sealedBidService.getMyBid("req-1", "contractor-1")).toBeUndefined();
  });
});
