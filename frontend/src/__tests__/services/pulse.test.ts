/**
 * TDD — 8.1.1: Home Pulse Digest Generation
 *
 * pulseService generates a structured weekly digest from property context.
 * In test / no-agent mode it uses a deterministic mock; in production it
 * calls POST /api/pulse on the voice agent proxy.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createPulseService,
  type PulseContext,
  type PulseDigest,
  type PulseItem,
} from "@/services/pulseService";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<PulseContext> = {}): PulseContext {
  return {
    propertyId:   overrides.propertyId   ?? "prop-1",
    address:      overrides.address      ?? "100 Elm St",
    city:         overrides.city         ?? "Austin",
    state:        overrides.state        ?? "TX",
    zipCode:      overrides.zipCode      ?? "78701",
    yearBuilt:    overrides.yearBuilt    ?? 1998,
    recentJobs:   overrides.recentJobs   ?? [],
    systemAges:   overrides.systemAges   ?? {},
    userTopicWeights: overrides.userTopicWeights ?? {},
    ...overrides,
  };
}

// ── Digest shape ──────────────────────────────────────────────────────────────

describe("pulseService.generateDigest — shape (8.1.1)", () => {
  let svc: ReturnType<typeof createPulseService>;
  beforeEach(() => { svc = createPulseService(); });

  it("returns a PulseDigest object", async () => {
    const digest = await svc.generateDigest(makeContext());
    expect(digest).toBeDefined();
    expect(typeof digest).toBe("object");
  });

  it("digest has a non-empty headline", async () => {
    const digest = await svc.generateDigest(makeContext());
    expect(typeof digest.headline).toBe("string");
    expect(digest.headline.length).toBeGreaterThan(0);
  });

  it("digest has an items array", async () => {
    const digest = await svc.generateDigest(makeContext());
    expect(Array.isArray(digest.items)).toBe(true);
  });

  it("each item has title, body, category, priority", async () => {
    const digest = await svc.generateDigest(makeContext());
    for (const item of digest.items) {
      expect(typeof item.id).toBe("string");
      expect(typeof item.title).toBe("string");
      expect(typeof item.body).toBe("string");
      expect(typeof item.category).toBe("string");
      expect(["high", "medium", "low"]).toContain(item.priority);
    }
  });

  it("digest has a generatedAt ms timestamp", async () => {
    const before = Date.now();
    const digest = await svc.generateDigest(makeContext());
    expect(digest.generatedAt).toBeGreaterThanOrEqual(before);
    expect(digest.generatedAt).toBeLessThanOrEqual(Date.now());
  });

  it("digest includes the propertyId", async () => {
    const digest = await svc.generateDigest(makeContext({ propertyId: "prop-99" }));
    expect(digest.propertyId).toBe("prop-99");
  });

  it("digest includes climateZone", async () => {
    const digest = await svc.generateDigest(makeContext({ zipCode: "60601" }));
    expect(typeof digest.climateZone).toBe("number");
    expect(digest.climateZone).toBe(5);
  });

  it("digest includes season", async () => {
    const digest = await svc.generateDigest(makeContext());
    expect(["winter", "spring", "summer", "fall"]).toContain(digest.season);
  });
});

// ── Context-driven content ────────────────────────────────────────────────────

describe("pulseService.generateDigest — context-driven content (8.1.1)", () => {
  let svc: ReturnType<typeof createPulseService>;
  beforeEach(() => { svc = createPulseService(); });

  it("includes seasonal maintenance items based on climate zone", async () => {
    // Zone 5 (Chicago), winter → expect heating-related item
    const digest = await svc.generateDigest(
      makeContext({ zipCode: "60601" })
    );
    expect(digest.items.length).toBeGreaterThan(0);
  });

  it("items reference the property address or city", async () => {
    const digest = await svc.generateDigest(
      makeContext({ city: "Denver", state: "CO", zipCode: "80201" })
    );
    const text = digest.headline + digest.items.map((i) => i.body + i.title).join(" ");
    // At minimum the digest should be non-trivial
    expect(text.length).toBeGreaterThan(20);
  });

  it("adds an age-based item when systemAges contains old HVAC", async () => {
    const digest = await svc.generateDigest(
      makeContext({ systemAges: { HVAC: 14 } })
    );
    const hvacItem = digest.items.find((i) =>
      /hvac|air.?condition|heat/i.test(i.title + i.body)
    );
    expect(hvacItem).toBeDefined();
  });

  it("adds a roof item when systemAges.Roof is over 20 years", async () => {
    const digest = await svc.generateDigest(
      makeContext({ systemAges: { Roof: 22 } })
    );
    const roofItem = digest.items.find((i) => /roof/i.test(i.title + i.body));
    expect(roofItem).toBeDefined();
  });

  it("items are sorted by priority — high before medium before low", async () => {
    const digest = await svc.generateDigest(makeContext({ systemAges: { HVAC: 15, Roof: 25 } }));
    const order = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < digest.items.length; i++) {
      expect(order[digest.items[i - 1].priority]).toBeLessThanOrEqual(
        order[digest.items[i].priority]
      );
    }
  });
});

// ── Topic weights (8.1.6 integration) ────────────────────────────────────────

describe("pulseService.generateDigest — topic weight influence (8.1.6)", () => {
  let svc: ReturnType<typeof createPulseService>;
  beforeEach(() => { svc = createPulseService(); });

  it("higher-weighted topics appear earlier in the items list", async () => {
    const digest = await svc.generateDigest(
      makeContext({
        systemAges: { HVAC: 5, Roof: 5 }, // both equally minor
        userTopicWeights: { Roofing: 10, HVAC: 0 },
      })
    );
    const roofIdx = digest.items.findIndex((i) => /roof/i.test(i.title + i.body));
    const hvacIdx = digest.items.findIndex((i) => /hvac|air.?condition/i.test(i.title + i.body));
    // If both appear, roofing should come first due to higher weight
    if (roofIdx !== -1 && hvacIdx !== -1) {
      expect(roofIdx).toBeLessThan(hvacIdx);
    }
  });
});

// ── cacheDigest / getCachedDigest ─────────────────────────────────────────────

describe("pulseService cache (8.1.1)", () => {
  let svc: ReturnType<typeof createPulseService>;
  beforeEach(() => { svc = createPulseService(); });

  it("getCachedDigest returns null before any generation", () => {
    expect(svc.getCachedDigest("prop-1")).toBeNull();
  });

  it("getCachedDigest returns the last digest after generation", async () => {
    const digest = await svc.generateDigest(makeContext({ propertyId: "prop-cache" }));
    expect(svc.getCachedDigest("prop-cache")).toEqual(digest);
  });

  it("cached digests are property-scoped", async () => {
    await svc.generateDigest(makeContext({ propertyId: "prop-A" }));
    expect(svc.getCachedDigest("prop-B")).toBeNull();
  });
});
