/**
 * negotiationAgentService — real logic worth locking down:
 *   - consent is required before analyzeQuote will run
 *   - grantConsent/revokeConsent persist to localStorage and hasConsent reads it
 *   - analyzeQuote throws when no pricing benchmark exists for the service type
 *   - the mock analysis (fetch fails → fallback) classifies fair/high/low
 *     correctly against the real pricingHistoryService benchmark
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createNegotiationAgentService } from "@/services/negotiationAgentService";
import type { Quote, QuoteRequest } from "@/services/quote";

function makeQuote(overrides: Partial<Quote> = {}): Quote {
  return { id: "quote-1", requestId: "req-1", amount: 150_000, timeline: "1 week", ...overrides } as Quote;
}

function makeRequest(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return { id: "req-1", serviceType: "HVAC", description: "AC repair", urgency: "medium", ...overrides } as QuoteRequest;
}

beforeEach(() => localStorage.clear());

describe("negotiationAgentService — consent", () => {
  it("hasConsent is false until grantConsent is called", () => {
    const service = createNegotiationAgentService();
    expect(service.hasConsent("req-1")).toBe(false);
    service.grantConsent("req-1");
    expect(service.hasConsent("req-1")).toBe(true);
  });

  it("revokeConsent removes a previously granted consent", () => {
    const service = createNegotiationAgentService();
    service.grantConsent("req-1");
    service.revokeConsent("req-1");
    expect(service.hasConsent("req-1")).toBe(false);
  });

  it("persists consents to localStorage across instances", () => {
    const first = createNegotiationAgentService();
    first.grantConsent("req-1");
    const second = createNegotiationAgentService();
    expect(second.hasConsent("req-1")).toBe(true);
  });
});

describe("negotiationAgentService.analyzeQuote", () => {
  it("throws when consent has not been granted", async () => {
    const service = createNegotiationAgentService();
    await expect(service.analyzeQuote(makeQuote(), makeRequest(), "78701")).rejects.toThrow(/requires user consent/);
  });

  it("throws when no pricing benchmark exists for the service type", async () => {
    const service = createNegotiationAgentService();
    service.grantConsent("req-1");
    await expect(service.analyzeQuote(makeQuote(), makeRequest({ serviceType: "UnknownTrade" }), "78701")).rejects.toThrow(/No pricing benchmark/);
  });

  describe("mock fallback (voice agent offline)", () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; vi.restoreAllMocks(); });

    it("classifies a quote above p75 as 'high' with a suggested counter", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
      const service = createNegotiationAgentService();
      service.grantConsent("req-1");
      // HVAC national p75 = 280,000 cents
      const analysis = await service.analyzeQuote(makeQuote({ amount: 500_000 }), makeRequest(), "00000");
      expect(analysis.verdict).toBe("high");
      expect(analysis.suggestedCounterCents).toBeDefined();
    });

    it("classifies a quote below p25 as 'low'", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
      const service = createNegotiationAgentService();
      service.grantConsent("req-1");
      // HVAC national p25 = 120,000 cents
      const analysis = await service.analyzeQuote(makeQuote({ amount: 50_000 }), makeRequest(), "00000");
      expect(analysis.verdict).toBe("low");
      expect(analysis.suggestedCounterCents).toBeUndefined();
    });

    it("classifies a quote within the normal range as 'fair'", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("offline"));
      const service = createNegotiationAgentService();
      service.grantConsent("req-1");
      const analysis = await service.analyzeQuote(makeQuote({ amount: 185_000 }), makeRequest(), "00000");
      expect(analysis.verdict).toBe("fair");
    });
  });
});
