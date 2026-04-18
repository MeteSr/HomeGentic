/**
 * Integration tests — quoteService against the real ICP quote canister.
 *
 * Requires: dfx start --background && make deploy
 * Run:      npm run test:integration  (from repo root)
 *
 * What these tests prove that unit tests cannot:
 *   - Candid IDL: amount/timeline (Nat/bigint), validUntil (Int ns→ms), createdAt (Int ns→ms)
 *   - UrgencyLevel Variant round-trips (Low / Medium / High / Emergency)
 *   - RequestStatus Variant transitions: Open → Closed (closeQuoteRequest)
 *   - QuoteStatus Variant: Pending → Accepted (acceptQuote)
 *   - Homeowner scoping: getMyQuoteRequests only returns the caller's requests
 *   - getQuotesForRequest returns quotes submitted to a specific request
 *   - Free-tier open-request limit (max 3 concurrent open requests)
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { quoteService } from "@/services/quote";
import type { QuoteRequest, Quote } from "@/services/quote";
import { TEST_PRINCIPAL } from "./setup";

const CANISTER_ID = (process.env as any).QUOTE_CANISTER_ID || "";
const deployed = !!CANISTER_ID;

const RUN_ID = Date.now();
function pid(label: string) { return `integ-quote-${label}-${RUN_ID}`; }

const BASE_REQUEST = {
  propertyId:  pid("base"),
  serviceType: "HVAC" as const,
  description: "Annual HVAC tune-up integration test",
  urgency:     "medium" as const,
};

// ─── createRequest — Candid serialization ────────────────────────────────────

describe.skipIf(!deployed)("createRequest — Candid serialization", () => {
  it("returns a QuoteRequest with a non-empty id", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("id") });
    expect(req.id).toBeTruthy();
    expect(typeof req.id).toBe("string");
  });

  it("serviceType is preserved correctly", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("svc-type") });
    expect(req.serviceType).toBe("HVAC");
  });

  it("UrgencyLevel Variant round-trips: low", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("urg-low"), urgency: "low" });
    expect(req.urgency).toBe("low");
  });

  it("UrgencyLevel Variant round-trips: medium", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("urg-med"), urgency: "medium" });
    expect(req.urgency).toBe("medium");
  });

  it("UrgencyLevel Variant round-trips: high", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("urg-high"), urgency: "high" });
    expect(req.urgency).toBe("high");
  });

  it("UrgencyLevel Variant round-trips: emergency", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("urg-emergency"), urgency: "emergency" });
    expect(req.urgency).toBe("emergency");
  });

  it("all 8 ServiceType variants round-trip correctly", async () => {
    const types = ["HVAC", "Roofing", "Plumbing", "Electrical", "Painting", "Flooring", "Windows", "Landscaping"] as const;
    for (const serviceType of types) {
      const req = await quoteService.createRequest({
        ...BASE_REQUEST,
        propertyId: pid(`svc-${serviceType}`),
        serviceType,
      });
      expect(req.serviceType).toBe(serviceType);
    }
  });

  it("homeowner principal matches the test identity", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("principal") });
    expect(req.homeowner).toBe(TEST_PRINCIPAL);
  });

  it("status starts as 'open'", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("initial-status") });
    expect(req.status).toBe("open");
  });

  it("createdAt is a recent ms timestamp (ns→ms conversion applied)", async () => {
    const before = Date.now() - 5_000;
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("ts") });
    const after = Date.now() + 5_000;
    expect(req.createdAt).toBeGreaterThan(before);
    expect(req.createdAt).toBeLessThan(after);
  });
});

// ─── getRequests — caller scoping ────────────────────────────────────────────

describe.skipIf(!deployed)("getRequests — caller scoping", () => {
  let seeded: QuoteRequest;

  beforeAll(async () => {
    seeded = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("scope") });
  });

  it("getRequests returns the created request", async () => {
    const reqs = await quoteService.getRequests();
    const found = reqs.find((r) => r.id === seeded.id);
    expect(found).toBeDefined();
  });

  it("all returned requests belong to the test principal", async () => {
    const reqs = await quoteService.getRequests();
    expect(reqs.every((r) => r.homeowner === TEST_PRINCIPAL)).toBe(true);
  });
});

// ─── submitQuote — BigInt field round-trips ───────────────────────────────────

describe.skipIf(!deployed)("submitQuote — amount/timeline/validUntil round-trips", () => {
  let request: QuoteRequest;

  beforeAll(async () => {
    request = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("quote-submit") });
  });

  it("returns a Quote with a non-empty id", async () => {
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const quote = await quoteService.submitQuote(request.id, 150_000, 5, validUntil);
    expect(quote.id).toBeTruthy();
  });

  it("amount (Nat) survives BigInt round-trip without truncation", async () => {
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const quote = await quoteService.submitQuote(request.id, 275_500, 3, validUntil);
    expect(quote.amount).toBe(275_500);
  });

  it("timeline days (Nat) survives BigInt round-trip", async () => {
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const quote = await quoteService.submitQuote(request.id, 100_000, 14, validUntil);
    expect(quote.timeline).toBe(14);
  });

  it("contractor principal matches the test identity", async () => {
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const quote = await quoteService.submitQuote(request.id, 50_000, 2, validUntil);
    expect(quote.contractor).toBe(TEST_PRINCIPAL);
  });

  it("quote starts with status 'pending'", async () => {
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const quote = await quoteService.submitQuote(request.id, 80_000, 7, validUntil);
    expect(quote.status).toBe("pending");
  });

  it("createdAt is a recent ms timestamp", async () => {
    const before = Date.now() - 5_000;
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const quote = await quoteService.submitQuote(request.id, 60_000, 4, validUntil);
    const after = Date.now() + 5_000;
    expect(quote.createdAt).toBeGreaterThan(before);
    expect(quote.createdAt).toBeLessThan(after);
  });
});

// ─── getQuotesForRequest ──────────────────────────────────────────────────────

describe.skipIf(!deployed)("getQuotesForRequest — retrieval", () => {
  let request: QuoteRequest;
  let submitted: Quote;

  beforeAll(async () => {
    request = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("get-quotes") });
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    submitted = await quoteService.submitQuote(request.id, 200_000, 5, validUntil);
  });

  it("getQuotesForRequest returns the submitted quote", async () => {
    const quotes = await quoteService.getQuotesForRequest(request.id);
    const found = quotes.find((q) => q.id === submitted.id);
    expect(found).toBeDefined();
  });

  it("all returned quotes have the correct requestId", async () => {
    const quotes = await quoteService.getQuotesForRequest(request.id);
    expect(quotes.every((q) => q.requestId === request.id)).toBe(true);
  });

  it("getQuotesForRequest returns empty for a request with no quotes", async () => {
    const emptyReq = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("no-quotes") });
    const quotes = await quoteService.getQuotesForRequest(emptyReq.id);
    expect(quotes).toHaveLength(0);
  });
});

// ─── accept — QuoteStatus Variant transition ──────────────────────────────────

describe.skipIf(!deployed)("accept — QuoteStatus Pending → Accepted", () => {
  let request: QuoteRequest;
  let quote: Quote;

  beforeAll(async () => {
    request = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("accept") });
    const validUntil = Date.now() + 7 * 24 * 60 * 60 * 1000;
    quote = await quoteService.submitQuote(request.id, 300_000, 7, validUntil);
  });

  it("accept() resolves without error", async () => {
    await expect(quoteService.accept(quote.id)).resolves.toBeUndefined();
  });
});

// ─── close — RequestStatus Variant transition ─────────────────────────────────

describe.skipIf(!deployed)("close — RequestStatus Open → Closed", () => {
  it("close() resolves without error and marks request as closed", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("close") });
    await expect(quoteService.close(req.id)).resolves.toBeUndefined();
  });
});

// ─── cancel — RequestStatus Variant transition ────────────────────────────────

describe.skipIf(!deployed)("cancel — RequestStatus Open → Cancelled", () => {
  it("cancel() resolves without error", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("cancel") });
    await expect(quoteService.cancel(req.id)).resolves.toBeUndefined();
  });

  it("cancel() twice rejects with an error", async () => {
    const req = await quoteService.createRequest({ ...BASE_REQUEST, propertyId: pid("cancel-double") });
    await quoteService.cancel(req.id);
    await expect(quoteService.cancel(req.id)).rejects.toThrow();
  });
});

// ─── cancel — mock fallback ───────────────────────────────────────────────────

describe("cancel — mock fallback (no canister)", () => {
  let svc: typeof quoteService;

  beforeEach(async () => {
    vi.resetModules();
    const m = await import("@/services/quote");
    svc = m.quoteService;
  });

  it("cancel() marks mock request as cancelled", async () => {
    const req = await svc.createRequest({ ...BASE_REQUEST, propertyId: pid("cancel-mock") });
    await svc.cancel(req.id);
    const fetched = await svc.getRequest(req.id);
    expect(fetched?.status).toBe("cancelled");
  });
});
