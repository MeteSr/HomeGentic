import { describe, it, expect, beforeEach, vi } from "vitest";
import { quoteService } from "@/services/quote";
import type { QuoteRequest } from "@/services/quote";

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

  it("returns empty array before any requests are created", async () => {
    expect(await svc.getRequests()).toEqual([]);
  });

  it("returns all created requests", async () => {
    await svc.createRequest({ propertyId: "p1", serviceType: "HVAC",    urgency: "high",   description: "d1" });
    await svc.createRequest({ propertyId: "p1", serviceType: "Roofing", urgency: "medium", description: "d2" });
    const reqs = await svc.getRequests();
    expect(reqs).toHaveLength(2);
  });

  it("returns a copy — mutating result does not affect service state", async () => {
    await svc.createRequest({ propertyId: "p1", serviceType: "HVAC", urgency: "high", description: "d1" });
    const first = await svc.getRequests();
    first.pop();
    const second = await svc.getRequests();
    expect(second).toHaveLength(1);
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
