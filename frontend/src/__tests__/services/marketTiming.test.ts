/**
 * TDD — 5.3.2 + 5.3.3: Market Timing Intelligence
 *
 * marketTimingService combines HomeGentic score × zip × season → estimated
 * price premium and a "list now" recommendation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createMarketTimingService,
  type TimingAnalysis,
  type ListingRecommendation,
} from "@/services/marketTimingService";

// ── getAnalysis — shape ───────────────────────────────────────────────────────

describe("marketTimingService.getAnalysis — shape (5.3.2)", () => {
  let svc: ReturnType<typeof createMarketTimingService>;
  beforeEach(() => { svc = createMarketTimingService(); });

  it("returns a TimingAnalysis object", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(a).toBeDefined();
    expect(typeof a).toBe("object");
  });

  it("has estimatedPremium with low and high (dollars)", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(typeof a.estimatedPremium.low).toBe("number");
    expect(typeof a.estimatedPremium.high).toBe("number");
    expect(a.estimatedPremium.high).toBeGreaterThanOrEqual(a.estimatedPremium.low);
  });

  it("has a listingScore 0–100", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(a.listingScore).toBeGreaterThanOrEqual(0);
    expect(a.listingScore).toBeLessThanOrEqual(100);
  });

  it("has a recommendation: 'list_now' | 'wait' | 'neutral'", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(["list_now", "wait", "neutral"]).toContain(a.recommendation);
  });

  it("has a non-empty headline string", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(typeof a.headline).toBe("string");
    expect(a.headline.length).toBeGreaterThan(0);
  });

  it("has a marketCondition: 'hot' | 'balanced' | 'cool'", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(["hot", "balanced", "cool"]).toContain(a.marketCondition);
  });

  it("has season field", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(["winter", "spring", "summer", "fall"]).toContain(a.season);
  });

  it("has daysOnMarket from market data", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(typeof a.daysOnMarket).toBe("number");
    expect(a.daysOnMarket).toBeGreaterThan(0);
  });

  it("includes reasoning strings array", async () => {
    const a = await svc.getAnalysis({ score: 72, zip: "78701", nowMs: Date.now() });
    expect(Array.isArray(a.reasoning)).toBe(true);
    expect(a.reasoning.length).toBeGreaterThan(0);
    a.reasoning.forEach((r) => expect(typeof r).toBe("string"));
  });
});

// ── Score influence ───────────────────────────────────────────────────────────

describe("marketTimingService — score influence (5.3.2)", () => {
  let svc: ReturnType<typeof createMarketTimingService>;
  beforeEach(() => { svc = createMarketTimingService(); });

  it("higher score → higher estimatedPremium.high", async () => {
    const low  = await svc.getAnalysis({ score: 45, zip: "78701", nowMs: Date.now() });
    const high = await svc.getAnalysis({ score: 88, zip: "78701", nowMs: Date.now() });
    expect(high.estimatedPremium.high).toBeGreaterThan(low.estimatedPremium.high);
  });

  it("higher score → higher listingScore", async () => {
    const low  = await svc.getAnalysis({ score: 42, zip: "78701", nowMs: Date.now() });
    const high = await svc.getAnalysis({ score: 90, zip: "78701", nowMs: Date.now() });
    expect(high.listingScore).toBeGreaterThan(low.listingScore);
  });

  it("score < 40 returns estimatedPremium.low = 0", async () => {
    const a = await svc.getAnalysis({ score: 30, zip: "78701", nowMs: Date.now() });
    expect(a.estimatedPremium.low).toBe(0);
  });
});

// ── Season influence ──────────────────────────────────────────────────────────

describe("marketTimingService — season influence (5.3.2)", () => {
  let svc: ReturnType<typeof createMarketTimingService>;
  beforeEach(() => { svc = createMarketTimingService(); });

  const SPRING_MS = new Date("2026-04-15").getTime();
  const WINTER_MS = new Date("2026-01-15").getTime();

  it("spring listing score >= winter listing score (spring premium)", async () => {
    const spring = await svc.getAnalysis({ score: 70, zip: "78701", nowMs: SPRING_MS });
    const winter = await svc.getAnalysis({ score: 70, zip: "78701", nowMs: WINTER_MS });
    expect(spring.listingScore).toBeGreaterThanOrEqual(winter.listingScore);
  });

  it("detects season correctly for April (spring)", async () => {
    const a = await svc.getAnalysis({ score: 70, zip: "78701", nowMs: SPRING_MS });
    expect(a.season).toBe("spring");
  });

  it("detects season correctly for January (winter)", async () => {
    const a = await svc.getAnalysis({ score: 70, zip: "78701", nowMs: WINTER_MS });
    expect(a.season).toBe("winter");
  });
});

// ── Market condition influence ────────────────────────────────────────────────

describe("marketTimingService — market condition (5.3.2)", () => {
  let svc: ReturnType<typeof createMarketTimingService>;
  beforeEach(() => { svc = createMarketTimingService(); });

  it("SF (low DOM, over-ask) is a hot market", async () => {
    const a = await svc.getAnalysis({ score: 70, zip: "94102", nowMs: Date.now() });
    expect(a.marketCondition).toBe("hot");
  });

  it("Austin (high inventory growth) shows rising inventory in reasoning", async () => {
    const a = await svc.getAnalysis({ score: 70, zip: "78701", nowMs: Date.now() });
    const text = a.reasoning.join(" ").toLowerCase();
    expect(text).toMatch(/inventor|supply|listing/i);
  });
});

// ── Recommendation logic ──────────────────────────────────────────────────────

describe("marketTimingService — recommendations (5.3.3)", () => {
  let svc: ReturnType<typeof createMarketTimingService>;
  beforeEach(() => { svc = createMarketTimingService(); });

  const SPRING = new Date("2026-04-15").getTime();

  it("high score + hot market + spring → 'list_now'", async () => {
    const a = await svc.getAnalysis({ score: 85, zip: "94102", nowMs: SPRING });
    expect(a.recommendation).toBe("list_now");
  });

  it("low score (< 40) → 'wait' recommendation", async () => {
    const a = await svc.getAnalysis({ score: 32, zip: "78701", nowMs: SPRING });
    expect(a.recommendation).toBe("wait");
  });

  it("headline contains a percentage or dollar figure", async () => {
    const a = await svc.getAnalysis({ score: 78, zip: "78701", nowMs: SPRING });
    expect(a.headline).toMatch(/\$|%|above|below|premium/i);
  });
});

// ── getRecommendation (5.3.3 shorthand) ──────────────────────────────────────

describe("marketTimingService.getRecommendation (5.3.3)", () => {
  let svc: ReturnType<typeof createMarketTimingService>;
  beforeEach(() => { svc = createMarketTimingService(); });

  it("returns a ListingRecommendation", async () => {
    const r = await svc.getRecommendation({ score: 72, zip: "78701" });
    expect(r).toBeDefined();
  });

  it("has shouldListNow boolean", async () => {
    const r = await svc.getRecommendation({ score: 72, zip: "78701" });
    expect(typeof r.shouldListNow).toBe("boolean");
  });

  it("has a message string", async () => {
    const r = await svc.getRecommendation({ score: 72, zip: "78701" });
    expect(typeof r.message).toBe("string");
    expect(r.message.length).toBeGreaterThan(0);
  });

  it("has urgency: 'high' | 'medium' | 'low'", async () => {
    const r = await svc.getRecommendation({ score: 72, zip: "78701" });
    expect(["high", "medium", "low"]).toContain(r.urgency);
  });
});
