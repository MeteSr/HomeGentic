/**
 * TDD — 2.4: Contractor Bidding with vetKeys Sealed Bids
 *
 * 2.4.1  Sealed-bid quote submission   — encrypt+store ciphertext, hide amount
 * 2.4.2  vetKeys sealed-bid reveal     — after window close, lowest wins
 * 2.4.3  Bid window timer              — open/closed gating
 * 2.4.4  Blind bidding visibility      — contractor sees own only; homeowner sees all after close
 */

import { describe, it, expect, beforeEach } from "vitest";
import { sealedBidService } from "@/services/sealedBid";
import type { SealedBidRequest } from "@/services/sealedBid";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAST   = Date.now() - 60_000;   // 1 minute ago  → window closed
const FUTURE = Date.now() + 60_000;   // 1 minute from now → window open

function makeRequest(closeAt: number, id = "REQ_SEALED_1"): SealedBidRequest {
  return sealedBidService.createSealedBidRequest(
    {
      id,
      propertyId:  "prop-1",
      serviceType: "HVAC",
      description: "AC not cooling — sealed bids requested",
      urgency:     "high",
      closeAt,
    },
    "homeowner-principal"
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2.4.1: Sealed-bid quote submission
// ─────────────────────────────────────────────────────────────────────────────

describe("2.4.1: sealed-bid submission — encrypt and store", () => {
  beforeEach(() => sealedBidService.reset());

  it("submitSealedBid returns a SealedBid object", () => {
    makeRequest(FUTURE);
    const bid = sealedBidService.submitSealedBid("REQ_SEALED_1", 450_000, 5, "contractor-A");
    expect(bid).toBeDefined();
    expect(typeof bid.id).toBe("string");
  });

  it("SealedBid has requestId, contractor, ciphertext, timelineDays, submittedAt", () => {
    makeRequest(FUTURE);
    const bid = sealedBidService.submitSealedBid("REQ_SEALED_1", 450_000, 5, "contractor-A");
    expect(bid.requestId).toBe("REQ_SEALED_1");
    expect(bid.contractor).toBe("contractor-A");
    expect(typeof bid.ciphertext).toBe("string");
    expect(bid.ciphertext.length).toBeGreaterThan(0);
    expect(bid.timelineDays).toBe(5);
    expect(typeof bid.submittedAt).toBe("number");
  });

  it("ciphertext does not contain the raw amount as a decimal number", () => {
    makeRequest(FUTURE);
    const bid = sealedBidService.submitSealedBid("REQ_SEALED_1", 450_000, 5, "contractor-A");
    // The encrypted form must not trivially expose the plaintext price
    expect(bid.ciphertext).not.toContain("450000");
    expect(bid.ciphertext).not.toBe("450000");
  });

  it("ciphertext is different from the amount string", () => {
    makeRequest(FUTURE);
    const bid = sealedBidService.submitSealedBid("REQ_SEALED_1", 99_999, 3, "contractor-B");
    expect(bid.ciphertext).not.toBe("99999");
  });

  it("two bids with the same amount produce different ciphertexts (requestId mixed in)", () => {
    makeRequest(FUTURE, "REQ_SEALED_1");
    makeRequest(FUTURE, "REQ_SEALED_2");
    const b1 = sealedBidService.submitSealedBid("REQ_SEALED_1", 100_000, 3, "contractor-A");
    const b2 = sealedBidService.submitSealedBid("REQ_SEALED_2", 100_000, 3, "contractor-A");
    // Different requestIds → different ciphertexts even for same amount
    expect(b1.ciphertext).not.toBe(b2.ciphertext);
  });

  it("each submitted bid gets a unique id", () => {
    makeRequest(FUTURE);
    const b1 = sealedBidService.submitSealedBid("REQ_SEALED_1", 100_000, 3, "contractor-A");
    const b2 = sealedBidService.submitSealedBid("REQ_SEALED_1", 200_000, 5, "contractor-B");
    expect(b1.id).not.toBe(b2.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.4.2: vetKeys sealed-bid reveal
// ─────────────────────────────────────────────────────────────────────────────

describe("2.4.2: sealed-bid reveal — lowest wins, in-canister comparison", () => {
  beforeEach(() => sealedBidService.reset());

  it("revealBids returns RevealedBid[] with amountCents visible", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 450_000, 5, "contractor-A");
    const revealed = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    expect(revealed).toHaveLength(1);
    expect(revealed[0].amountCents).toBe(450_000);
  });

  it("lowest amount bid is marked isWinner = true", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 500_000, 5, "contractor-A");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 350_000, 7, "contractor-B");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 420_000, 4, "contractor-C");
    const revealed = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    const winner = revealed.find((b) => b.isWinner);
    expect(winner).toBeDefined();
    expect(winner!.amountCents).toBe(350_000);
    expect(winner!.contractor).toBe("contractor-B");
  });

  it("only one bid is marked isWinner when amounts differ", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 500_000, 5, "contractor-A");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 6, "contractor-B");
    const revealed = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    const winners = revealed.filter((b) => b.isWinner);
    expect(winners).toHaveLength(1);
    expect(winners[0].amountCents).toBe(300_000);
  });

  it("revealBids throws BidWindowOpen when window has not yet closed", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 200_000, 3, "contractor-A");
    // now < closeAt → window still open → should throw
    expect(() =>
      sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE - 10)
    ).toThrow(/bid window.*open|still open/i);
  });

  it("all submitted bids appear in reveal results", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 100_000, 2, "contractor-A");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 200_000, 3, "contractor-B");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 150_000, 4, "contractor-C");
    const revealed = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    expect(revealed).toHaveLength(3);
    const amounts = revealed.map((b) => b.amountCents).sort((a, b) => a - b);
    expect(amounts).toEqual([100_000, 150_000, 200_000]);
  });

  it("each RevealedBid has contractor, timelineDays, submittedAt, isWinner", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-X");
    const [b] = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    expect(b.contractor).toBe("contractor-X");
    expect(b.timelineDays).toBe(5);
    expect(typeof b.submittedAt).toBe("number");
    expect(typeof b.isWinner).toBe("boolean");
  });

  it("getWinner returns the lowest-bid RevealedBid after reveal", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 800_000, 10, "contractor-X");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 250_000,  4, "contractor-Y");
    sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    const winner = sealedBidService.getWinner("REQ_SEALED_1");
    expect(winner).toBeDefined();
    expect(winner!.contractor).toBe("contractor-Y");
    expect(winner!.amountCents).toBe(250_000);
  });

  it("revealed bids are idempotent — calling revealBids twice returns same result", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 100_000, 2, "contractor-A");
    const r1 = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    const r2 = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 2);
    expect(r1).toEqual(r2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.4.3: Bid window timer
// ─────────────────────────────────────────────────────────────────────────────

describe("2.4.3: bid window timer", () => {
  beforeEach(() => sealedBidService.reset());

  it("isBidWindowOpen returns true when now < closeAt", () => {
    const req = makeRequest(FUTURE);
    expect(sealedBidService.isBidWindowOpen(req, FUTURE - 1)).toBe(true);
  });

  it("isBidWindowOpen returns false when now >= closeAt", () => {
    const req = makeRequest(FUTURE);
    expect(sealedBidService.isBidWindowOpen(req, FUTURE)).toBe(false);
    expect(sealedBidService.isBidWindowOpen(req, FUTURE + 1000)).toBe(false);
  });

  it("createSealedBidRequest sets closeAt correctly", () => {
    const req = sealedBidService.createSealedBidRequest(
      { id: "REQ_T", propertyId: "p", serviceType: "Roofing",
        description: "d", urgency: "medium", closeAt: FUTURE },
      "homeowner"
    );
    expect(req.closeAt).toBe(FUTURE);
  });

  it("createSealedBidRequest with past closeAt creates a closed-window request", () => {
    const req = makeRequest(PAST);
    expect(sealedBidService.isBidWindowOpen(req, Date.now())).toBe(false);
  });

  it("submitSealedBid throws BidWindowClosed after window closes", () => {
    makeRequest(PAST);
    expect(() =>
      sealedBidService.submitSealedBid("REQ_SEALED_1", 200_000, 3, "contractor-A", Date.now())
    ).toThrow(/bid window.*closed|closed/i);
  });

  it("submitSealedBid succeeds while window is still open", () => {
    makeRequest(FUTURE);
    expect(() =>
      sealedBidService.submitSealedBid("REQ_SEALED_1", 200_000, 3, "contractor-A", Date.now())
    ).not.toThrow();
  });

  it("revealBids only succeeds after window closes", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 200_000, 3, "contractor-A");

    // Before close: throws
    expect(() =>
      sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE - 100)
    ).toThrow(/bid window.*open|still open/i);

    // After close: succeeds
    const revealed = sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    expect(revealed).toHaveLength(1);
  });

  it("requests for same property can have different closeAt values", () => {
    const r1 = makeRequest(FUTURE, "REQ_SEALED_1");
    const r2 = sealedBidService.createSealedBidRequest(
      { id: "REQ_SEALED_2", propertyId: "prop-1", serviceType: "Plumbing",
        description: "leak", urgency: "high", closeAt: FUTURE + 3600_000 },
      "homeowner"
    );
    expect(r1.closeAt).not.toBe(r2.closeAt);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.4.4: Blind bidding visibility
// ─────────────────────────────────────────────────────────────────────────────

describe("2.4.4: blind bidding visibility — contractor vs homeowner", () => {
  beforeEach(() => sealedBidService.reset());

  it("getMyBid returns the contractor's own SealedBid", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-A");
    const mine = sealedBidService.getMyBid("REQ_SEALED_1", "contractor-A");
    expect(mine).toBeDefined();
    expect(mine!.contractor).toBe("contractor-A");
  });

  it("getMyBid returns a SealedBid with ciphertext, not plaintext amount", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-A");
    const mine = sealedBidService.getMyBid("REQ_SEALED_1", "contractor-A");
    expect(mine!.ciphertext).toBeDefined();
    // No amountCents field on SealedBid (blind until reveal)
    expect((mine as any).amountCents).toBeUndefined();
  });

  it("getMyBid returns undefined for a contractor who has not bid", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-A");
    const mine = sealedBidService.getMyBid("REQ_SEALED_1", "contractor-B");
    expect(mine).toBeUndefined();
  });

  it("contractor-A cannot see contractor-B's bid amount via getMyBid", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-A");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 200_000, 4, "contractor-B");

    // contractor-A can only access their own bid
    const mine = sealedBidService.getMyBid("REQ_SEALED_1", "contractor-A");
    expect(mine!.contractor).toBe("contractor-A");
    // contractor-A's bid does NOT expose contractor-B's amount
    expect((mine as any).amountCents).toBeUndefined();
  });

  it("getRevealedBids returns empty before revealBids is called", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-A");
    // Window closes but no explicit reveal yet
    const revealed = sealedBidService.getRevealedBids("REQ_SEALED_1");
    expect(revealed).toEqual([]);
  });

  it("getRevealedBids returns all bids after homeowner calls revealBids", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-A");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 250_000, 3, "contractor-B");
    sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    const revealed = sealedBidService.getRevealedBids("REQ_SEALED_1");
    expect(revealed).toHaveLength(2);
    expect(revealed.every((b) => typeof b.amountCents === "number")).toBe(true);
  });

  it("getWinner returns undefined before reveal", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 300_000, 5, "contractor-A");
    expect(sealedBidService.getWinner("REQ_SEALED_1")).toBeUndefined();
  });

  it("getWinner returns the correct contractor after reveal", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 600_000, 8, "contractor-expensive");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 180_000, 3, "contractor-cheap");
    sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    const winner = sealedBidService.getWinner("REQ_SEALED_1");
    expect(winner!.contractor).toBe("contractor-cheap");
    expect(winner!.isWinner).toBe(true);
  });

  it("losing bids have isWinner = false", () => {
    makeRequest(FUTURE);
    sealedBidService.submitSealedBid("REQ_SEALED_1", 500_000, 5, "contractor-A");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 400_000, 4, "contractor-B");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 600_000, 6, "contractor-C");
    sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);
    const revealed = sealedBidService.getRevealedBids("REQ_SEALED_1");
    const losers = revealed.filter((b) => !b.isWinner);
    expect(losers).toHaveLength(2);
    expect(losers.every((b) => b.amountCents !== 400_000)).toBe(true);
  });

  it("bids for different requests do not bleed across (isolation)", () => {
    makeRequest(FUTURE, "REQ_SEALED_1");
    makeRequest(FUTURE, "REQ_SEALED_2");
    sealedBidService.submitSealedBid("REQ_SEALED_1", 100_000, 2, "contractor-A");
    sealedBidService.submitSealedBid("REQ_SEALED_2", 200_000, 3, "contractor-A");
    sealedBidService.revealBids("REQ_SEALED_1", "homeowner-principal", FUTURE + 1);

    const r1 = sealedBidService.getRevealedBids("REQ_SEALED_1");
    const r2 = sealedBidService.getRevealedBids("REQ_SEALED_2"); // not revealed yet
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(0);
  });
});
