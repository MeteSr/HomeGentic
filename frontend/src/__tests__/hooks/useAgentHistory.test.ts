/**
 * Unit tests — useAgentHistory
 *
 * AH.1  Initial history loads from localStorage on mount
 * AH.2  addAction prepends a new entry with generated id and timestamp
 * AH.3  addAction trims to MAX_ENTRIES (50)
 * AH.4  clearHistory empties state and removes the localStorage key
 * AH.5  Corrupted localStorage JSON returns empty history (no throw)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAgentHistory } from "@/hooks/useAgentHistory";

const STORAGE_KEY = "homegentic_agent_history";

beforeEach(() => {
  localStorage.clear();
});

// ── AH.1 ─────────────────────────────────────────────────────────────────────

describe("AH.1 — loads history from localStorage on mount", () => {
  it("returns previously stored entries", () => {
    const stored = [
      { id: "1", timestamp: 1000, toolName: "get_properties", label: "Fetch", summary: "ok", success: true },
    ];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    const { result } = renderHook(() => useAgentHistory());
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].toolName).toBe("get_properties");
  });
});

// ── AH.2 ─────────────────────────────────────────────────────────────────────

describe("AH.2 — addAction prepends an entry", () => {
  it("adds the action to the front of history", () => {
    const { result } = renderHook(() => useAgentHistory());
    act(() => {
      result.current.addAction({ toolName: "get_jobs", label: "Jobs", summary: "3 jobs", success: true });
    });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0].toolName).toBe("get_jobs");
    expect(typeof result.current.history[0].id).toBe("string");
    expect(result.current.history[0].timestamp).toBeGreaterThan(0);
  });

  it("newest action is always first", () => {
    const { result } = renderHook(() => useAgentHistory());
    act(() => {
      result.current.addAction({ toolName: "first", label: "First", summary: "", success: true });
    });
    act(() => {
      result.current.addAction({ toolName: "second", label: "Second", summary: "", success: true });
    });
    expect(result.current.history[0].toolName).toBe("second");
    expect(result.current.history[1].toolName).toBe("first");
  });
});

// ── AH.3 ─────────────────────────────────────────────────────────────────────

describe("AH.3 — addAction trims to MAX_ENTRIES", () => {
  it("never exceeds 50 entries", () => {
    const { result } = renderHook(() => useAgentHistory());
    for (let i = 0; i < 55; i++) {
      act(() => {
        result.current.addAction({ toolName: `tool${i}`, label: `L${i}`, summary: "", success: true });
      });
    }
    expect(result.current.history.length).toBeLessThanOrEqual(50);
  });
});

// ── AH.4 ─────────────────────────────────────────────────────────────────────

describe("AH.4 — clearHistory empties state and localStorage", () => {
  it("removes all entries and the storage key", () => {
    const { result } = renderHook(() => useAgentHistory());
    act(() => {
      result.current.addAction({ toolName: "t", label: "L", summary: "", success: true });
    });
    expect(result.current.history).toHaveLength(1);
    act(() => { result.current.clearHistory(); });
    expect(result.current.history).toHaveLength(0);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

// ── AH.5 ─────────────────────────────────────────────────────────────────────

describe("AH.5 — corrupted localStorage returns empty history", () => {
  it("does not throw when JSON is malformed", () => {
    localStorage.setItem(STORAGE_KEY, "{{not-json}}");
    expect(() => renderHook(() => useAgentHistory())).not.toThrow();
    const { result } = renderHook(() => useAgentHistory());
    expect(result.current.history).toEqual([]);
  });
});
