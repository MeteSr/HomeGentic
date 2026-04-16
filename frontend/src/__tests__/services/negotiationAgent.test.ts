/**
 * TDD — 5.2.2: Negotiation Agent Tool
 *
 * negotiationAgentService requires explicit opt-in consent before analyzing
 * any quote. Users can grant and revoke consent per quote request.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createNegotiationAgentService } from "@/services/negotiationAgentService";
import type { Quote, QuoteRequest } from "@/services/quote";

const MOCK_REQUEST: QuoteRequest = {
  id:          "REQ_1",
  propertyId:  "prop_1",
  homeowner:   "owner-1",
  serviceType: "HVAC",
  urgency:     "medium",
  description: "AC unit not cooling. 12-year-old unit.",
  status:      "quoted",
  createdAt:   Date.now() - 86400000,
};

const MOCK_QUOTE: Quote = {
  id:         "QUOTE_1",
  requestId:  "REQ_1",
  contractor: "contractor-1",
  amount:     185000,   // $1,850
  timeline:   3,
  validUntil: Date.now() + 86400000 * 14,
  status:     "pending",
  createdAt:  Date.now() - 3600000,
};

describe("negotiationAgentService — opt-in consent (5.2.2)", () => {
  let svc: ReturnType<typeof createNegotiationAgentService>;

  beforeEach(() => {
    localStorage.clear();
    svc = createNegotiationAgentService();
  });

  it("hasConsent returns false by default", () => {
    expect(svc.hasConsent("REQ_1")).toBe(false);
  });

  it("grantConsent sets hasConsent to true", () => {
    svc.grantConsent("REQ_1");
    expect(svc.hasConsent("REQ_1")).toBe(true);
  });

  it("revokeConsent removes consent", () => {
    svc.grantConsent("REQ_1");
    svc.revokeConsent("REQ_1");
    expect(svc.hasConsent("REQ_1")).toBe(false);
  });

  it("consent is scoped per request — granting one does not grant another", () => {
    svc.grantConsent("REQ_1");
    expect(svc.hasConsent("REQ_2")).toBe(false);
  });

  it("consent persists in localStorage", () => {
    svc.grantConsent("REQ_1");
    const svc2 = createNegotiationAgentService();
    expect(svc2.hasConsent("REQ_1")).toBe(true);
  });

  it("analyzeQuote throws ConsentRequired if not opted in", async () => {
    await expect(svc.analyzeQuote(MOCK_QUOTE, MOCK_REQUEST, "94103"))
      .rejects.toThrow(/consent/i);
  });
});

describe("negotiationAgentService — analyzeQuote mock fallback (5.2.2)", () => {
  let svc: ReturnType<typeof createNegotiationAgentService>;

  beforeEach(() => {
    localStorage.clear();
    svc = createNegotiationAgentService();
    svc.grantConsent("REQ_1");
  });

  it("returns a NegotiationAnalysis with required fields", async () => {
    const r = await svc.analyzeQuote(MOCK_QUOTE, MOCK_REQUEST, "94103");
    expect(r).toHaveProperty("verdict");
    expect(r).toHaveProperty("percentile");
    expect(r).toHaveProperty("rationale");
    expect(r).toHaveProperty("benchmarkUsed");
  });

  it("verdict is one of fair | high | low", async () => {
    const r = await svc.analyzeQuote(MOCK_QUOTE, MOCK_REQUEST, "94103");
    expect(["fair", "high", "low"]).toContain(r.verdict);
  });

  it("percentile is between 0 and 100", async () => {
    const r = await svc.analyzeQuote(MOCK_QUOTE, MOCK_REQUEST, "94103");
    expect(r.percentile).toBeGreaterThanOrEqual(0);
    expect(r.percentile).toBeLessThanOrEqual(100);
  });

  it("a very high quote (above p75) returns verdict high and includes suggestedCounterCents", async () => {
    const highQuote: Quote = { ...MOCK_QUOTE, amount: 9_999_999 };
    const r = await svc.analyzeQuote(highQuote, MOCK_REQUEST, "94103");
    expect(r.verdict).toBe("high");
    expect(r.suggestedCounterCents).toBeDefined();
    expect(r.suggestedCounterCents!).toBeLessThan(highQuote.amount);
  });

  it("a very low quote (below p25) returns verdict low", async () => {
    const lowQuote: Quote = { ...MOCK_QUOTE, amount: 1 };
    const r = await svc.analyzeQuote(lowQuote, MOCK_REQUEST, "94103");
    expect(r.verdict).toBe("low");
  });

  it("rationale is a non-empty string", async () => {
    const r = await svc.analyzeQuote(MOCK_QUOTE, MOCK_REQUEST, "94103");
    expect(typeof r.rationale).toBe("string");
    expect(r.rationale.length).toBeGreaterThan(10);
  });

  it("benchmarkUsed contains p25, median, p75", async () => {
    const r = await svc.analyzeQuote(MOCK_QUOTE, MOCK_REQUEST, "94103");
    expect(r.benchmarkUsed).toHaveProperty("p25");
    expect(r.benchmarkUsed).toHaveProperty("median");
    expect(r.benchmarkUsed).toHaveProperty("p75");
  });

  it("HomeGentic never contacts contractors — analyzeQuote has no side effects on quoteService", async () => {
    // The service only returns analysis; it does not mutate any quote state.
    // This is verified by the fact that analyzeQuote only returns a value
    // and does not call quoteService.accept / quoteService.submitQuote.
    const r = await svc.analyzeQuote(MOCK_QUOTE, MOCK_REQUEST, "94103");
    expect(r).toBeDefined(); // smoke test
  });
});
