/**
 * TDD — 8.1.6: Pulse Content Personalization Over Time
 *
 * Track which Pulse items the user acted on; weight future digests toward
 * high-signal topics.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPulsePersonalizationService } from "@/services/pulsePersonalizationService";

// ── recordAction / getWeights ─────────────────────────────────────────────────

describe("pulsePersonalizationService — recording actions (8.1.6)", () => {
  let svc: ReturnType<typeof createPulsePersonalizationService>;
  beforeEach(() => { localStorage.clear(); svc = createPulsePersonalizationService(); });

  it("getWeights returns empty object before any actions", () => {
    expect(svc.getWeights()).toEqual({});
  });

  it("recording an action increases the topic weight", () => {
    svc.recordAction("HVAC", "clicked");
    expect(svc.getWeights().HVAC).toBeGreaterThan(0);
  });

  it("repeated actions on the same topic compound the weight", () => {
    svc.recordAction("Roofing", "clicked");
    const w1 = svc.getWeights().Roofing;
    svc.recordAction("Roofing", "clicked");
    expect(svc.getWeights().Roofing).toBeGreaterThan(w1!);
  });

  it("'booked' action carries more weight than 'clicked'", () => {
    const svcA = createPulsePersonalizationService();
    const svcB = createPulsePersonalizationService();
    svcA.recordAction("HVAC", "clicked");
    svcB.recordAction("HVAC", "booked");
    expect(svcB.getWeights().HVAC!).toBeGreaterThan(svcA.getWeights().HVAC!);
  });

  it("'dismissed' action reduces (or does not increase) the topic weight", () => {
    svc.recordAction("Seasonal", "clicked");
    const w1 = svc.getWeights().Seasonal;
    svc.recordAction("Seasonal", "dismissed");
    expect(svc.getWeights().Seasonal!).toBeLessThanOrEqual(w1!);
  });

  it("getWeights returns a copy — mutations don't affect internal state", () => {
    svc.recordAction("HVAC", "clicked");
    const w = svc.getWeights();
    w.HVAC = 9999;
    expect(svc.getWeights().HVAC).not.toBe(9999);
  });

  it("independent topics get independent weights", () => {
    svc.recordAction("HVAC",    "booked");
    svc.recordAction("Roofing", "clicked");
    const w = svc.getWeights();
    expect(w.HVAC).toBeGreaterThan(w.Roofing!);
  });
});

// ── decay ─────────────────────────────────────────────────────────────────────

describe("pulsePersonalizationService — weight decay (8.1.6)", () => {
  let svc: ReturnType<typeof createPulsePersonalizationService>;
  beforeEach(() => { localStorage.clear(); svc = createPulsePersonalizationService(); });

  it("applyDecay reduces all weights toward zero", () => {
    svc.recordAction("HVAC", "booked");
    svc.recordAction("Roofing", "clicked");
    const before = svc.getWeights();
    svc.applyDecay();
    const after = svc.getWeights();
    expect(after.HVAC!).toBeLessThan(before.HVAC!);
    expect(after.Roofing!).toBeLessThan(before.Roofing!);
  });

  it("applyDecay never produces negative weights", () => {
    svc.recordAction("HVAC", "clicked");
    for (let i = 0; i < 20; i++) svc.applyDecay();
    const w = svc.getWeights();
    for (const v of Object.values(w)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

// ── getTopTopics ──────────────────────────────────────────────────────────────

describe("pulsePersonalizationService — getTopTopics (8.1.6)", () => {
  let svc: ReturnType<typeof createPulsePersonalizationService>;
  beforeEach(() => { localStorage.clear(); svc = createPulsePersonalizationService(); });

  it("returns empty array when no actions recorded", () => {
    expect(svc.getTopTopics(3)).toEqual([]);
  });

  it("returns topics sorted by weight descending", () => {
    svc.recordAction("Roofing",  "clicked");
    svc.recordAction("HVAC",     "booked");    // booked > clicked
    svc.recordAction("Plumbing", "clicked");
    const top = svc.getTopTopics(3);
    expect(top[0]).toBe("HVAC");
  });

  it("respects the limit parameter", () => {
    svc.recordAction("HVAC",     "booked");
    svc.recordAction("Roofing",  "booked");
    svc.recordAction("Plumbing", "booked");
    expect(svc.getTopTopics(2)).toHaveLength(2);
  });
});

// ── persistence (localStorage) ───────────────────────────────────────────────

describe("pulsePersonalizationService — persistence (8.1.6)", () => {
  beforeEach(() => { localStorage.clear(); });

  it("persists weights to localStorage on recordAction", () => {
    const svc = createPulsePersonalizationService();
    svc.recordAction("HVAC", "clicked");
    const raw = localStorage.getItem("pulse_weights");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.HVAC).toBeGreaterThan(0);
  });

  it("loads persisted weights on construction", () => {
    const svc1 = createPulsePersonalizationService();
    svc1.recordAction("Roofing", "booked");
    const weight1 = svc1.getWeights().Roofing;

    const svc2 = createPulsePersonalizationService();
    expect(svc2.getWeights().Roofing).toBe(weight1);
  });
});
