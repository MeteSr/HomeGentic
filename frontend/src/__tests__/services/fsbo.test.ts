/**
 * Unit tests for fsboService and pure FSBO helpers
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  fsboService,
  computeFsboReadiness,
  computeAgentCommissionSavings,
} from "@/services/fsbo";

beforeEach(() => {
  fsboService.__reset();
});

// ── computeFsboReadiness ──────────────────────────────────────────────────────

describe("computeFsboReadiness", () => {
  it("returns NotReady when score < 65", () => {
    const result = computeFsboReadiness(60, 3, true);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing.some(m => m.includes("65+"))).toBe(true);
  });

  it("returns NotReady when verifiedJobCount < 2", () => {
    const result = computeFsboReadiness(70, 1, true);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing.some(m => m.includes("2 verified"))).toBe(true);
  });

  it("returns NotReady when both score and jobs are insufficient", () => {
    const result = computeFsboReadiness(50, 0, false);
    expect(result.readiness).toBe("NotReady");
    expect(result.missing).toHaveLength(2);
  });

  it("returns Ready when score >= 65 and verifiedJobs >= 2 but not OptimallyReady", () => {
    const result = computeFsboReadiness(70, 2, false);
    expect(result.readiness).toBe("Ready");
  });

  it("returns OptimallyReady when score >= 85, verifiedJobs >= 3, and hasReport", () => {
    const result = computeFsboReadiness(90, 3, true);
    expect(result.readiness).toBe("OptimallyReady");
    expect(result.missing).toHaveLength(0);
  });

  it("Ready missing list explains what is needed for OptimallyReady", () => {
    const result = computeFsboReadiness(70, 2, false);
    expect(result.readiness).toBe("Ready");
    expect(result.missing.length).toBeGreaterThan(0);
  });
});

// ── computeAgentCommissionSavings ─────────────────────────────────────────────

describe("computeAgentCommissionSavings", () => {
  it("returns 3% of the list price in cents", () => {
    const savings = computeAgentCommissionSavings(50_000_00); // $500k in cents
    expect(savings).toBe(Math.round(50_000_00 * 0.03));
  });

  it("rounds correctly for non-integer results", () => {
    const savings = computeAgentCommissionSavings(333_333);
    expect(savings).toBe(Math.round(333_333 * 0.03));
  });

  it("returns 0 for 0 list price", () => {
    expect(computeAgentCommissionSavings(0)).toBe(0);
  });
});

// ── fsboService.setFsboMode ───────────────────────────────────────────────────

describe("fsboService.setFsboMode", () => {
  it("creates a new FSBO record for a property", () => {
    const record = fsboService.setFsboMode("prop-1", 45_000_00);
    expect(record.propertyId).toBe("prop-1");
    expect(record.isFsbo).toBe(true);
    expect(record.listPriceCents).toBe(45_000_00);
    expect(record.step).toBe(1);
  });

  it("preserves activatedAt on subsequent calls", () => {
    const first = fsboService.setFsboMode("prop-1", 40_000_00);
    const second = fsboService.setFsboMode("prop-1", 42_000_00);
    expect(second.activatedAt).toBe(first.activatedAt);
    expect(second.listPriceCents).toBe(42_000_00);
  });

  it("stores an optional description", () => {
    const record = fsboService.setFsboMode("prop-1", 40_000_00, "Charming colonial home");
    expect(record.description).toBe("Charming colonial home");
  });
});

// ── fsboService.getRecord ─────────────────────────────────────────────────────

describe("fsboService.getRecord", () => {
  it("returns null when no record exists", () => {
    expect(fsboService.getRecord("prop-x")).toBeNull();
  });

  it("returns the record after setFsboMode", () => {
    fsboService.setFsboMode("prop-2", 30_000_00);
    const record = fsboService.getRecord("prop-2");
    expect(record).not.toBeNull();
    expect(record!.propertyId).toBe("prop-2");
  });
});

// ── fsboService.advanceStep ───────────────────────────────────────────────────

describe("fsboService.advanceStep", () => {
  it("advances from step 1 to 2", () => {
    fsboService.setFsboMode("prop-1", 40_000_00);
    const updated = fsboService.advanceStep("prop-1");
    expect(updated.step).toBe(2);
  });

  it("advances from step 2 to 3", () => {
    fsboService.setFsboMode("prop-1", 40_000_00);
    fsboService.advanceStep("prop-1");
    const updated = fsboService.advanceStep("prop-1");
    expect(updated.step).toBe(3);
  });

  it("advances from step 3 to done", () => {
    fsboService.setFsboMode("prop-1", 40_000_00);
    fsboService.advanceStep("prop-1");
    fsboService.advanceStep("prop-1");
    const updated = fsboService.advanceStep("prop-1");
    expect(updated.step).toBe("done");
  });

  it("throws when FSBO not activated", () => {
    expect(() => fsboService.advanceStep("prop-not-exist")).toThrow();
  });
});

// ── fsboService.deactivate ────────────────────────────────────────────────────

describe("fsboService.deactivate", () => {
  it("removes the FSBO record", () => {
    fsboService.setFsboMode("prop-1", 40_000_00);
    fsboService.deactivate("prop-1");
    expect(fsboService.getRecord("prop-1")).toBeNull();
  });
});

// ── fsboService price history ─────────────────────────────────────────────────

describe("fsboService price history", () => {
  it("returns empty array when no price logged", () => {
    expect(fsboService.getPriceHistory("prop-1")).toHaveLength(0);
  });

  it("logs price changes and retrieves them", () => {
    fsboService.logPriceChange("prop-1", 40_000_00);
    fsboService.logPriceChange("prop-1", 38_000_00);
    const history = fsboService.getPriceHistory("prop-1");
    expect(history).toHaveLength(2);
    expect(history[0].priceCents).toBe(40_000_00);
    expect(history[1].priceCents).toBe(38_000_00);
  });
});

// ── fsboService.updatePrice ───────────────────────────────────────────────────

describe("fsboService.updatePrice", () => {
  it("updates the list price on an active record", () => {
    fsboService.setFsboMode("prop-1", 40_000_00);
    const updated = fsboService.updatePrice("prop-1", 35_000_00);
    expect(updated.listPriceCents).toBe(35_000_00);
  });

  it("throws when property not found", () => {
    expect(() => fsboService.updatePrice("prop-not-exist", 100)).toThrow();
  });
});

// ── fsboService.setUnderContract ──────────────────────────────────────────────

describe("fsboService.setUnderContract", () => {
  it("sets step to done", () => {
    fsboService.setFsboMode("prop-1", 40_000_00);
    fsboService.setUnderContract("prop-1");
    expect(fsboService.getRecord("prop-1")!.step).toBe("done");
  });

  it("is a no-op when property not in map", () => {
    expect(() => fsboService.setUnderContract("prop-none")).not.toThrow();
  });
});
