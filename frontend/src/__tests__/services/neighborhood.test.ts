import { describe, it, expect, beforeEach } from "vitest";
import {
  neighborhoodService,
  getPercentileRank,
  type ZipCodeStats,
} from "@/services/neighborhood";

describe("neighborhoodService", () => {
  beforeEach(() => {
    neighborhoodService.reset();
  });

  // ── getZipStats ──────────────────────────────────────────────────────────────
  describe("getZipStats", () => {
    it("returns a ZipCodeStats object with the requested zipCode", async () => {
      const stats = await neighborhoodService.getZipStats("78701");
      expect(stats.zipCode).toBe("78701");
    });

    it("has a sampleCount greater than zero", async () => {
      const stats = await neighborhoodService.getZipStats("90210");
      expect(stats.sampleCount).toBeGreaterThan(0);
    });

    it("has averageScore in the range [0, 100]", async () => {
      const stats = await neighborhoodService.getZipStats("10001");
      expect(stats.averageScore).toBeGreaterThanOrEqual(0);
      expect(stats.averageScore).toBeLessThanOrEqual(100);
    });

    it("has medianScore in the range [0, 100]", async () => {
      const stats = await neighborhoodService.getZipStats("33101");
      expect(stats.medianScore).toBeGreaterThanOrEqual(0);
      expect(stats.medianScore).toBeLessThanOrEqual(100);
    });

    it("returns exactly 5 percentile buckets covering [0–100]", async () => {
      const stats = await neighborhoodService.getZipStats("60601");
      expect(stats.percentileBuckets).toHaveLength(5);
      expect(stats.percentileBuckets[0].range[0]).toBe(0);
      expect(stats.percentileBuckets[4].range[1]).toBe(100);
    });

    it("bucket counts sum to sampleCount", async () => {
      const stats = await neighborhoodService.getZipStats("77002");
      const total = stats.percentileBuckets.reduce((s, b) => s + b.count, 0);
      expect(total).toBe(stats.sampleCount);
    });

    it("bucket pct values sum to 100 (within rounding)", async () => {
      const stats = await neighborhoodService.getZipStats("85001");
      const sum = stats.percentileBuckets.reduce((s, b) => s + b.pct, 0);
      expect(sum).toBeCloseTo(100, 0);
    });

    it("has at least one topMaintenanceSystem", async () => {
      const stats = await neighborhoodService.getZipStats("19101");
      expect(stats.topMaintenanceSystems.length).toBeGreaterThan(0);
    });

    it("topMaintenanceSystems contains recognised system names", async () => {
      const KNOWN = ["HVAC", "Roofing", "Plumbing", "Electrical", "Water Heater", "Windows", "Flooring"];
      const stats = await neighborhoodService.getZipStats("30301");
      for (const sys of stats.topMaintenanceSystems) {
        expect(KNOWN).toContain(sys);
      }
    });

    it("trend.direction is one of up | down | stable", async () => {
      const stats = await neighborhoodService.getZipStats("98101");
      expect(["up", "down", "stable"]).toContain(stats.trend.direction);
    });

    it("includes a generatedAt timestamp", async () => {
      const before = Date.now();
      const stats = await neighborhoodService.getZipStats("02101");
      expect(stats.generatedAt).toBeGreaterThanOrEqual(before);
    });

    it("is deterministic — same zip returns identical averageScore", async () => {
      const a = await neighborhoodService.getZipStats("94102");
      neighborhoodService.reset();
      const b = await neighborhoodService.getZipStats("94102");
      expect(a.averageScore).toBe(b.averageScore);
    });

    it("is deterministic — same zip returns identical sampleCount", async () => {
      const a = await neighborhoodService.getZipStats("94102");
      neighborhoodService.reset();
      const b = await neighborhoodService.getZipStats("94102");
      expect(a.sampleCount).toBe(b.sampleCount);
    });

    it("different zip codes can produce different averageScores", async () => {
      const a = await neighborhoodService.getZipStats("10001");
      const b = await neighborhoodService.getZipStats("90210");
      // Extremely unlikely to be equal with a reasonable hash-based generator
      expect(a.averageScore).not.toBe(b.averageScore);
    });

    it("results are cached — second call returns same object reference", async () => {
      const a = await neighborhoodService.getZipStats("55401");
      const b = await neighborhoodService.getZipStats("55401");
      expect(a).toBe(b);
    });

    it("reset() clears the cache so next call returns a fresh object", async () => {
      const a = await neighborhoodService.getZipStats("55401");
      neighborhoodService.reset();
      const b = await neighborhoodService.getZipStats("55401");
      expect(a).not.toBe(b);
    });
  });

  // ── getPercentileRank ────────────────────────────────────────────────────────
  describe("getPercentileRank (pure helper)", () => {
    let stats: ZipCodeStats;

    beforeEach(async () => {
      stats = await neighborhoodService.getZipStats("78701");
    });

    it("returns a number in [0, 100]", () => {
      const p = getPercentileRank(50, stats);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    });

    it("score of 0 returns 0", () => {
      expect(getPercentileRank(0, stats)).toBe(0);
    });

    it("score of 100 returns 100", () => {
      expect(getPercentileRank(100, stats)).toBe(100);
    });

    it("higher score yields a higher or equal percentile rank", () => {
      const p40 = getPercentileRank(40, stats);
      const p60 = getPercentileRank(60, stats);
      const p80 = getPercentileRank(80, stats);
      expect(p60).toBeGreaterThanOrEqual(p40);
      expect(p80).toBeGreaterThanOrEqual(p60);
    });

    it("score equal to median returns a rank within ±5 of 50", () => {
      const p = getPercentileRank(stats.medianScore, stats);
      expect(p).toBeGreaterThanOrEqual(45);
      expect(p).toBeLessThanOrEqual(55);
    });
  });

  // ── getPercentileForProperty ─────────────────────────────────────────────────
  describe("getPercentileForProperty", () => {
    it("returns a number in [0, 100]", async () => {
      const p = await neighborhoodService.getPercentileForProperty("78701", 72);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
    });

    it("is consistent with calling getZipStats + getPercentileRank manually", async () => {
      const stats = await neighborhoodService.getZipStats("78701");
      const manual = getPercentileRank(72, stats);
      const via = await neighborhoodService.getPercentileForProperty("78701", 72);
      expect(via).toBe(manual);
    });

    it("higher score yields higher or equal percentile", async () => {
      const p40 = await neighborhoodService.getPercentileForProperty("10001", 40);
      const p80 = await neighborhoodService.getPercentileForProperty("10001", 80);
      expect(p80).toBeGreaterThanOrEqual(p40);
    });
  });
});
