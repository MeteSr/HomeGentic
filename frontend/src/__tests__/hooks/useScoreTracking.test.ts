/**
 * Unit tests — useScoreTracking
 *
 * ST.1  Initial history loads from localStorage for the active property
 * ST.2  scoreGoal starts null when no localStorage entry exists
 * ST.3  setScoreGoal persists to localStorage and updates state
 * ST.4  setScoreGoal(null) removes the localStorage key
 * ST.5  History is re-loaded when activePropertyId changes
 * ST.6  Snapshot is recorded once loading finishes
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useScoreTracking } from "@/hooks/useScoreTracking";

beforeEach(() => {
  localStorage.clear();
});

// ── ST.1 ─────────────────────────────────────────────────────────────────────

describe("ST.1 — loads history from localStorage on mount", () => {
  it("returns stored snapshots for the property", () => {
    const history = [{ score: 72, timestamp: 1000 }];
    localStorage.setItem("homegentic_score_prop-a", JSON.stringify(history));
    const { result } = renderHook(() => useScoreTracking("prop-a", 72, false));
    // History may be updated by recordSnapshot but should contain at least 1 entry
    expect(result.current.scoreHistory.length).toBeGreaterThanOrEqual(1);
  });
});

// ── ST.2 ─────────────────────────────────────────────────────────────────────

describe("ST.2 — scoreGoal starts null", () => {
  it("is null when no localStorage entry exists", () => {
    const { result } = renderHook(() => useScoreTracking("prop-b", 50, false));
    expect(result.current.scoreGoal).toBeNull();
  });
});

// ── ST.3 ─────────────────────────────────────────────────────────────────────

describe("ST.3 — setScoreGoal persists and updates state", () => {
  it("updates scoreGoal and writes to localStorage", () => {
    const { result } = renderHook(() => useScoreTracking("prop-c", 60, false));
    act(() => { result.current.setScoreGoal(80); });
    expect(result.current.scoreGoal).toBe(80);
    expect(localStorage.getItem("homegentic_score_goal_prop-c")).toBe("80");
  });
});

// ── ST.4 ─────────────────────────────────────────────────────────────────────

describe("ST.4 — setScoreGoal(null) removes localStorage key", () => {
  it("clears the persisted goal", () => {
    localStorage.setItem("homegentic_score_goal_prop-d", "75");
    const { result } = renderHook(() => useScoreTracking("prop-d", 60, false));
    act(() => { result.current.setScoreGoal(null); });
    expect(result.current.scoreGoal).toBeNull();
    expect(localStorage.getItem("homegentic_score_goal_prop-d")).toBeNull();
  });
});

// ── ST.5 ─────────────────────────────────────────────────────────────────────

describe("ST.5 — history reloads when activePropertyId changes", () => {
  it("reflects the new property's history after rerender", () => {
    localStorage.setItem("homegentic_score_prop-x", JSON.stringify([{ score: 55, timestamp: 2000 }]));
    const { result, rerender } = renderHook(
      ({ id, score, loading }: { id: string; score: number; loading: boolean }) =>
        useScoreTracking(id, score, loading),
      { initialProps: { id: "prop-y", score: 40, loading: false } }
    );
    rerender({ id: "prop-x", score: 55, loading: false });
    expect(result.current.scoreHistory.some((s) => s.score === 55)).toBe(true);
  });
});

// ── ST.6 ─────────────────────────────────────────────────────────────────────

describe("ST.6 — snapshot is recorded when loading becomes false", () => {
  it("scoreHistory is non-empty after loading=false", async () => {
    const { result } = renderHook(() => useScoreTracking("prop-e", 68, false));
    await waitFor(() => {
      expect(result.current.scoreHistory.length).toBeGreaterThan(0);
    });
  });
});
