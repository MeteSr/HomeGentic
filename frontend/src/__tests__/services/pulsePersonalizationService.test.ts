/**
 * pulsePersonalizationService — real logic worth locking down:
 *   - recordAction awards the correct points per action type and never
 *     lets a topic's weight go below 0
 *   - applyDecay multiplies every weight by 0.85
 *   - getTopTopics sorts descending, excludes zero/negative weights, and
 *     respects the limit
 *   - weights persist to and reload from localStorage
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createPulsePersonalizationService } from "@/services/pulsePersonalizationService";

beforeEach(() => localStorage.clear());

describe("pulsePersonalizationService.recordAction", () => {
  it("awards the correct points per action type", () => {
    const service = createPulsePersonalizationService();
    service.recordAction("hvac", "booked");
    service.recordAction("roofing", "clicked");
    service.recordAction("plumbing", "expanded");

    expect(service.getWeights()).toEqual({ hvac: 10, roofing: 3, plumbing: 1 });
  });

  it("accumulates points across multiple actions on the same topic", () => {
    const service = createPulsePersonalizationService();
    service.recordAction("hvac", "clicked");
    service.recordAction("hvac", "clicked");
    expect(service.getWeights().hvac).toBe(6);
  });

  it("floors a topic's weight at 0 rather than going negative", () => {
    const service = createPulsePersonalizationService();
    service.recordAction("hvac", "clicked");
    service.recordAction("hvac", "dismissed");
    service.recordAction("hvac", "dismissed");
    expect(service.getWeights().hvac).toBe(0);
  });
});

describe("pulsePersonalizationService.applyDecay", () => {
  it("multiplies every topic's weight by 0.85", () => {
    const service = createPulsePersonalizationService();
    service.recordAction("hvac", "booked");
    service.applyDecay();
    expect(service.getWeights().hvac).toBeCloseTo(8.5);
  });
});

describe("pulsePersonalizationService.getTopTopics", () => {
  it("sorts topics by weight descending and respects the limit", () => {
    const service = createPulsePersonalizationService();
    service.recordAction("hvac", "booked");
    service.recordAction("roofing", "clicked");
    service.recordAction("plumbing", "expanded");

    expect(service.getTopTopics(2)).toEqual(["hvac", "roofing"]);
  });

  it("excludes topics with zero or negative weight", () => {
    const service = createPulsePersonalizationService();
    service.recordAction("hvac", "booked");
    service.recordAction("roofing", "dismissed");
    service.recordAction("roofing", "dismissed");

    expect(service.getTopTopics(10)).toEqual(["hvac"]);
  });
});

describe("pulsePersonalizationService — persistence", () => {
  it("persists weights to localStorage and reloads them in a new instance", () => {
    const first = createPulsePersonalizationService();
    first.recordAction("hvac", "booked");

    const second = createPulsePersonalizationService();
    expect(second.getWeights()).toEqual({ hvac: 10 });
  });

  it("starts fresh when localStorage contains invalid JSON", () => {
    localStorage.setItem("pulse_weights", "not-json{{");
    const service = createPulsePersonalizationService();
    expect(service.getWeights()).toEqual({});
  });
});
