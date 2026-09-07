/**
 * Unit tests — usePropertyScore
 *
 * PS.1  scoreHistory initialises from localStorage when propertyId is set
 * PS.2  scoreHistory is empty when propertyId is undefined
 * PS.3  Snapshot is recorded once loading=false and property is present
 * PS.4  scoreHistory reloads when propertyId changes
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePropertyScore } from "@/hooks/usePropertyScore";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

beforeEach(() => {
  localStorage.clear();
});

const mockProperty: Property = {
  id: "prop-1", owner: "owner-1", address: "1 Main St",
  city: "Austin", state: "TX", zipCode: "78701",
  propertyType: "SingleFamily", yearBuilt: BigInt(2000), squareFeet: BigInt(1800),
  verificationLevel: "Basic", tier: "Basic",
  createdAt: BigInt(0), updatedAt: BigInt(0), isActive: true,
};

const mockJob: Job = {
  id: "job-1", propertyId: "prop-1", homeowner: "owner-1",
  description: "Roof repair", serviceType: "Roofing", amount: 500000,
  date: "2024-01-01", verified: true, isDiy: false,
  homeownerSigned: true, contractorSigned: true, photos: [],
  status: "completed", createdAt: 0,
};

// ── PS.1 ─────────────────────────────────────────────────────────────────────

describe("PS.1 — scoreHistory initialises from localStorage", () => {
  it("loads stored snapshots for the property", () => {
    const stored = [{ score: 60, timestamp: 1000 }];
    localStorage.setItem("homegentic_score_prop-1", JSON.stringify(stored));
    const { result } = renderHook(() =>
      usePropertyScore("prop-1", mockProperty, [mockJob], false)
    );
    expect(result.current.scoreHistory.length).toBeGreaterThanOrEqual(1);
  });
});

// ── PS.2 ─────────────────────────────────────────────────────────────────────

describe("PS.2 — scoreHistory is empty when propertyId is undefined", () => {
  it("returns empty array with no propertyId", () => {
    const { result } = renderHook(() =>
      usePropertyScore(undefined, null, [], true)
    );
    expect(result.current.scoreHistory).toEqual([]);
  });
});

// ── PS.3 ─────────────────────────────────────────────────────────────────────

describe("PS.3 — snapshot recorded when loading=false and property present", () => {
  it("scoreHistory is non-empty after loading resolves", async () => {
    const { result } = renderHook(() =>
      usePropertyScore("prop-1", mockProperty, [mockJob], false)
    );
    await waitFor(() => {
      expect(result.current.scoreHistory.length).toBeGreaterThan(0);
    });
  });
});

// ── PS.4 ─────────────────────────────────────────────────────────────────────

describe("PS.4 — scoreHistory reloads when propertyId changes", () => {
  it("reflects new property after rerender", () => {
    localStorage.setItem("homegentic_score_prop-2", JSON.stringify([{ score: 45, timestamp: 500 }]));
    const p2 = { ...mockProperty, id: "prop-2" } satisfies Property;
    const { result, rerender } = renderHook(
      ({ id, prop }: { id: string; prop: Property }) =>
        usePropertyScore(id, prop, [], false),
      { initialProps: { id: "prop-1", prop: mockProperty } }
    );
    rerender({ id: "prop-2", prop: p2 });
    expect(result.current.scoreHistory.some((s) => s.score === 45)).toBe(true);
  });
});
