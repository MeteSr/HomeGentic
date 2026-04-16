import { describe, it, expect, beforeEach, vi } from "vitest";
import { quoteService } from "@/services/quote";

// Ensure Date.now() increments on every call so IDs based on it are always distinct.
let _now = 2_000_000_000_000;
vi.spyOn(Date, "now").mockImplementation(() => ++_now);
import type { QuoteRequest, Quote } from "@/services/quote";

// ─── getQuotaForTier (pure) ───────────────────────────────────────────────────

describe("quoteService.getQuotaForTier", () => {
  it("Free tier → 3 open requests", () => {
    expect(quoteService.getQuotaForTier("Free")).toBe(3);
  });

  it("Pro tier → 10 open requests", () => {
    expect(quoteService.getQuotaForTier("Pro")).toBe(10);
  });

  it("Premium tier → 10 open requests", () => {
    expect(quoteService.getQuotaForTier("Premium")).toBe(10);
  });

  it("ContractorPro tier → 0 (no quote limits)", () => {
    expect(quoteService.getQuotaForTier("ContractorPro")).toBe(0);
  });

  it("unknown tier falls back to 3", () => {
    expect(quoteService.getQuotaForTier("unknown")).toBe(3);
    expect(quoteService.getQuotaForTier("")).toBe(3);
  });
});

// ─── getOpenRequests (fixed mock data) ───────────────────────────────────────

describe("quoteService.getOpenRequests (mock)", () => {
  it("returns a non-empty list", async () => {
    const reqs = await quoteService.getOpenRequests();
    expect(reqs.length).toBeGreaterThan(0);
  });

  it("every request has required fields", async () => {
    const reqs = await quoteService.getOpenRequests();
    for (const r of reqs) {
      expect(typeof r.id).toBe("string");
      expect(typeof r.propertyId).toBe("string");
      expect(typeof r.homeowner).toBe("string");
      expect(typeof r.serviceType).toBe("string");
      expect(typeof r.description).toBe("string");
      expect(typeof r.createdAt).toBe("number");
      expect(["open", "quoted", "accepted", "closed"]).toContain(r.status);
      expect(["low", "medium", "high", "emergency"]).toContain(r.urgency);
    }
  });

  it("returns a new array on each call (no shared reference)", async () => {
    const a = await quoteService.getOpenRequests();
    const b = await quoteService.getOpenRequests();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("contains at least one 'open' request", async () => {
    const reqs = await quoteService.getOpenRequests();
    expect(reqs.some((r) => r.status === "open")).toBe(true);
  });
});

// ─── createRequest / getRequests / getRequest (stateful) ─────────────────────
//
// MOCK_REQUESTS is module-level state. vi.resetModules() + dynamic import gives
// each describe block a fresh module instance.

describe("quoteService mock — createRequest", () => {
  let svc: typeof quoteService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/quote");
    svc = m.quoteService;
  });

  it("returns a QuoteRequest with the supplied fields", async () => {
    const r = await svc.createRequest({
      propertyId:  "prop-1",
      serviceType: "HVAC",
      urgency:     "high",
      description: "AC not cooling",
    });
    expect(r.propertyId).toBe("prop-1");
    expect(r.serviceType).toBe("HVAC");
    expect(r.urgency).toBe("high");
    expect(r.description).toBe("AC not cooling");
  });

  it("assigns status 'open'", async () => {
    const r = await svc.createRequest({
      propertyId: "prop-1", serviceType: "Plumbing",
      urgency: "emergency", description: "burst pipe",
    });
    expect(r.status).toBe("open");
  });

  it("assigns homeowner 'local' in mock mode", async () => {
    const r = await svc.createRequest({
      propertyId: "prop-1", serviceType: "Roofing",
      urgency: "medium", description: "missing shingles",
    });
    expect(r.homeowner).toBe("local");
  });

  it("assigns a non-empty string id", async () => {
    const r = await svc.createRequest({
      propertyId: "prop-1", serviceType: "Electrical",
      urgency: "low", description: "tripping breaker",
    });
    expect(typeof r.id).toBe("string");
    expect(r.id.length).toBeGreaterThan(0);
  });

  it("assigns createdAt close to now", async () => {
    const before = Date.now();
    const r = await svc.createRequest({
      propertyId: "prop-1", serviceType: "Flooring",
      urgency: "low", description: "refinish floors",
    });
    expect(r.createdAt).toBeGreaterThanOrEqual(before);
    expect(r.createdAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("quoteService mock — getRequests", () => {
  let svc: typeof quoteService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/quote");
    svc = m.quoteService;
  });

  it("starts with the 3 pre-seeded demo requests", async () => {
    const reqs = await svc.getRequests();
    expect(reqs).toHaveLength(3);
    expect(reqs.map((r) => r.id)).toContain("MY_REQ_1");
  });

  it("returns all pre-seeded + created requests", async () => {
    await svc.createRequest({ propertyId: "p1", serviceType: "HVAC",    urgency: "high",   description: "d1" });
    await svc.createRequest({ propertyId: "p1", serviceType: "Roofing", urgency: "medium", description: "d2" });
    const reqs = await svc.getRequests();
    expect(reqs).toHaveLength(5); // 3 pre-seeded + 2 created
  });

  it("returns a copy — mutating result does not affect service state", async () => {
    const before = (await svc.getRequests()).length; // 3 pre-seeded
    await svc.createRequest({ propertyId: "p1", serviceType: "HVAC", urgency: "high", description: "d1" });
    const first = await svc.getRequests();
    first.pop();
    const second = await svc.getRequests();
    expect(second).toHaveLength(before + 1); // pop on copy doesn't affect internal state
  });
});

describe("quoteService mock — getRequest", () => {
  let svc: typeof quoteService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/quote");
    svc = m.quoteService;
  });

  it("finds a created request by id", async () => {
    const created = await svc.createRequest({
      propertyId: "prop-1", serviceType: "Plumbing",
      urgency: "emergency", description: "burst pipe",
    });
    const found = await svc.getRequest(created.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.serviceType).toBe("Plumbing");
  });

  it("returns undefined for an unknown id", async () => {
    expect(await svc.getRequest("does-not-exist")).toBeUndefined();
  });

  it("returns undefined before any requests have been created", async () => {
    expect(await svc.getRequest("REQ_1")).toBeUndefined();
  });
});

// ─── submitQuote (mock) ───────────────────────────────────────────────────────

describe("quoteService mock — submitQuote", () => {
  let svc: typeof quoteService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/quote");
    svc = m.quoteService;
  });

  it("returns a Quote with the supplied values", async () => {
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const q = await svc.submitQuote("REQ_1", 450_000, 5, validUntil);
    expect(q.requestId).toBe("REQ_1");
    expect(q.amount).toBe(450_000);
    expect(q.timeline).toBe(5);
    expect(q.validUntil).toBe(validUntil);
  });

  it("assigns status 'pending'", async () => {
    const q = await svc.submitQuote("REQ_1", 100_000, 3, Date.now() + 86400000);
    expect(q.status).toBe("pending");
  });

  it("assigns contractor 'local' in mock mode", async () => {
    const q = await svc.submitQuote("REQ_1", 100_000, 3, Date.now() + 86400000);
    expect(q.contractor).toBe("local");
  });

  it("assigns a non-empty string id", async () => {
    const q = await svc.submitQuote("REQ_1", 100_000, 3, Date.now() + 86400000);
    expect(typeof q.id).toBe("string");
    expect(q.id.length).toBeGreaterThan(0);
  });

  it("each call returns a distinct id", async () => {
    const a = await svc.submitQuote("REQ_1", 100_000, 3, Date.now() + 86400000);
    const b = await svc.submitQuote("REQ_1", 200_000, 7, Date.now() + 86400000);
    expect(a.id).not.toBe(b.id);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12.2.3 — Contractor side: bid storage, expiration, urgency matching, quota
// ─────────────────────────────────────────────────────────────────────────────

// ─── Contractor bid storage: submitQuote → getQuotesForRequest ───────────────

describe("quoteService mock — contractor bid storage (12.2.3)", () => {
  let svc: typeof quoteService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/quote");
    svc = m.quoteService;
  });

  it("getQuotesForRequest returns submitted bid for that request", async () => {
    const validUntil = Date.now() + 7 * 86_400_000;
    await svc.submitQuote("REQ_1", 250_000, 4, validUntil);
    const bids = await svc.getQuotesForRequest("REQ_1");
    expect(bids).toHaveLength(1);
    expect(bids[0].requestId).toBe("REQ_1");
    expect(bids[0].amount).toBe(250_000);
  });

  it("getQuotesForRequest returns all bids when multiple submitted for same request", async () => {
    const vu = Date.now() + 7 * 86_400_000;
    await svc.submitQuote("REQ_2", 100_000, 2, vu);
    await svc.submitQuote("REQ_2", 120_000, 3, vu);
    await svc.submitQuote("REQ_2", 140_000, 5, vu);
    const bids = await svc.getQuotesForRequest("REQ_2");
    expect(bids).toHaveLength(3);
  });

  it("getQuotesForRequest returns empty array for a request with no bids", async () => {
    const bids = await svc.getQuotesForRequest("REQ_NO_BIDS");
    expect(bids).toEqual([]);
  });

  it("bids for different requests do not bleed across", async () => {
    const vu = Date.now() + 7 * 86_400_000;
    await svc.submitQuote("REQ_A", 50_000, 1, vu);
    await svc.submitQuote("REQ_B", 60_000, 2, vu);
    const bidsA = await svc.getQuotesForRequest("REQ_A");
    const bidsB = await svc.getQuotesForRequest("REQ_B");
    expect(bidsA).toHaveLength(1);
    expect(bidsB).toHaveLength(1);
    expect(bidsA[0].requestId).toBe("REQ_A");
    expect(bidsB[0].requestId).toBe("REQ_B");
  });

  it("submitted bid also appears in getMyBids()", async () => {
    const vu = Date.now() + 7 * 86_400_000;
    const q = await svc.submitQuote("REQ_1", 300_000, 5, vu);
    const myBids = await svc.getMyBids();
    expect(myBids.some((b) => b.id === q.id)).toBe(true);
  });

  it("getBidCountMap reflects submitted bids", async () => {
    const vu = Date.now() + 7 * 86_400_000;
    await svc.submitQuote("REQ_1", 100_000, 2, vu);
    await svc.submitQuote("REQ_1", 200_000, 3, vu);
    const map = await svc.getBidCountMap(["REQ_1", "REQ_99"]);
    expect(map["REQ_1"]).toBeGreaterThanOrEqual(1);
  });
});

// ─── Quote expiration ─────────────────────────────────────────────────────────

describe("quoteService.isQuoteExpired (12.2.3)", () => {
  const makeQuote = (validUntil: number): Quote => ({
    id: "Q1", requestId: "R1", contractor: "c",
    amount: 100_000, timeline: 2,
    validUntil, status: "pending",
    createdAt: Date.now() - 86_400_000,
  });

  it("returns true when validUntil is in the past", () => {
    expect(quoteService.isQuoteExpired(makeQuote(Date.now() - 1000))).toBe(true);
  });

  it("returns false when validUntil is in the future", () => {
    expect(quoteService.isQuoteExpired(makeQuote(Date.now() + 86_400_000))).toBe(false);
  });

  it("a quote with validUntil one day ago is expired", () => {
    const now = Date.now();
    expect(quoteService.isQuoteExpired(makeQuote(now - 86_400_000))).toBe(true);
  });

  it("a quote with validUntil far in the future is not expired", () => {
    // Use a fixed far-future absolute timestamp to avoid mock counter issues
    expect(quoteService.isQuoteExpired(makeQuote(9_999_999_999_999))).toBe(false);
  });
});

// ─── Urgency-based matching ───────────────────────────────────────────────────

describe("quoteService.sortByUrgency (12.2.3)", () => {
  const makeReq = (urgency: "low" | "medium" | "high" | "emergency"): QuoteRequest => ({
    id: urgency, propertyId: "p", homeowner: "h", serviceType: "HVAC",
    description: "d", urgency, status: "open", createdAt: 0,
  });

  it("emergency sorts before high", () => {
    const sorted = quoteService.sortByUrgency([makeReq("high"), makeReq("emergency")]);
    expect(sorted[0].urgency).toBe("emergency");
  });

  it("full sort order: emergency > high > medium > low", () => {
    const shuffled = [makeReq("low"), makeReq("medium"), makeReq("high"), makeReq("emergency")];
    const sorted = quoteService.sortByUrgency(shuffled);
    expect(sorted.map((r) => r.urgency)).toEqual(["emergency", "high", "medium", "low"]);
  });

  it("does not mutate the input array", () => {
    const input = [makeReq("low"), makeReq("high"), makeReq("emergency")];
    const original = input.map((r) => r.urgency);
    quoteService.sortByUrgency(input);
    expect(input.map((r) => r.urgency)).toEqual(original);
  });

  it("emergency open request from seed data appears before lower-urgency ones when sorted", async () => {
    const open = await quoteService.getOpenRequests();
    const sorted = quoteService.sortByUrgency(open);
    const emergIdx = sorted.findIndex((r) => r.urgency === "emergency");
    const highIdx  = sorted.findIndex((r) => r.urgency === "high");
    if (emergIdx !== -1 && highIdx !== -1) {
      expect(emergIdx).toBeLessThan(highIdx);
    }
  });

  it("two requests with same urgency preserve relative order (stable sort)", () => {
    const a = { ...makeReq("high"), id: "A" };
    const b = { ...makeReq("high"), id: "B" };
    const sorted = quoteService.sortByUrgency([a, b]);
    expect(sorted[0].id).toBe("A");
    expect(sorted[1].id).toBe("B");
  });
});

// ─── Tier-enforced open-request limits (12.2.3) ───────────────────────────────

describe("quoteService mock — tier quota enforcement (12.2.3)", () => {
  let svc: typeof quoteService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/quote");
    svc = m.quoteService;
    // Pre-seeded state: MY_REQ_1 (quoted), MY_REQ_2 (open), MY_REQ_3 (accepted)
    // → 1 open request at start
  });

  it("Free tier: 3rd open request succeeds", async () => {
    // 1 pre-seeded open + 1 more = 2 open; add 1 more → 3 → should succeed
    await svc.createRequest({ propertyId: "p", serviceType: "HVAC",    urgency: "low", description: "d" }, "Free");
    await expect(
      svc.createRequest({ propertyId: "p", serviceType: "Roofing", urgency: "low", description: "d" }, "Free")
    ).resolves.toBeDefined();
  });

  it("Free tier: 4th open request throws QuotaExceeded", async () => {
    // 1 pre-seeded open + 2 created = 3 open; next should be blocked
    await svc.createRequest({ propertyId: "p", serviceType: "HVAC",    urgency: "low", description: "d" }, "Free");
    await svc.createRequest({ propertyId: "p", serviceType: "Roofing", urgency: "low", description: "d" }, "Free");
    await expect(
      svc.createRequest({ propertyId: "p", serviceType: "Plumbing", urgency: "low", description: "d" }, "Free")
    ).rejects.toThrow(/quota|limit reached/i);
  });

  it("Pro tier: 10th open request succeeds", async () => {
    // 1 pre-seeded + 8 created = 9; one more → 10, should succeed
    for (let i = 0; i < 8; i++) {
      await svc.createRequest({ propertyId: "p", serviceType: "HVAC", urgency: "low", description: `d${i}` }, "Pro");
    }
    await expect(
      svc.createRequest({ propertyId: "p", serviceType: "Roofing", urgency: "low", description: "d9" }, "Pro")
    ).resolves.toBeDefined();
  });

  it("Pro tier: 11th open request throws QuotaExceeded", async () => {
    // 1 pre-seeded + 9 created = 10; next should be blocked
    for (let i = 0; i < 9; i++) {
      await svc.createRequest({ propertyId: "p", serviceType: "HVAC", urgency: "low", description: `d${i}` }, "Pro");
    }
    await expect(
      svc.createRequest({ propertyId: "p", serviceType: "Plumbing", urgency: "low", description: "d10" }, "Pro")
    ).rejects.toThrow(/quota|limit reached/i);
  });

  it("no tier argument → no quota check (backwards compat)", async () => {
    // Create well past the Free quota of 3
    for (let i = 0; i < 5; i++) {
      await svc.createRequest({ propertyId: "p", serviceType: "HVAC", urgency: "low", description: `d${i}` });
    }
    await expect(
      svc.createRequest({ propertyId: "p", serviceType: "Roofing", urgency: "low", description: "extra" })
    ).resolves.toBeDefined();
  });

  it("closed/accepted/quoted requests do not count toward the open quota", async () => {
    // Pre-seed has 1 quoted + 1 accepted — they must NOT count toward the Free quota of 3
    // 1 open pre-seeded; add 2 → 3 open; should still succeed (not blocked by 2 non-open seed items)
    await svc.createRequest({ propertyId: "p", serviceType: "HVAC",    urgency: "low", description: "d1" }, "Free");
    await expect(
      svc.createRequest({ propertyId: "p", serviceType: "Roofing", urgency: "low", description: "d2" }, "Free")
    ).resolves.toBeDefined();
  });
});
