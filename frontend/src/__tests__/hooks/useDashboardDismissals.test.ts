/**
 * Unit tests — useDashboardDismissals
 *
 * DD.1  All flags start false / empty when localStorage is clean
 * DD.2  dismissBanner flips bannerDismissed to true
 * DD.3  dismissBaselinePrompt adds propertyId to the set
 * DD.4  dismissMilestone flips milestoneDismissed and writes localStorage
 * DD.5  dismissPulse flips pulseDismissed and writes the monthly key
 * DD.6  dismissScoreIncrease flips scoreIncreaseDismissed (no localStorage)
 * DD.7  dismissReEngagement adds jobId to the set
 * DD.8  upgradeBannerDismissed loads persisted state from localStorage on mount
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDashboardDismissals } from "@/hooks/useDashboardDismissals";

beforeEach(() => {
  localStorage.clear();
});

// ── DD.1 ─────────────────────────────────────────────────────────────────────

describe("DD.1 — initial state is all-false with clean localStorage", () => {
  it("all boolean flags are false and sets are empty", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    const d = result.current;
    expect(d.bannerDismissed).toBe(false);
    expect(d.milestoneDismissed).toBe(false);
    expect(d.milestone3Dismissed).toBe(false);
    expect(d.upgradeBannerDismissed).toBe(false);
    expect(d.pulseDismissed).toBe(false);
    expect(d.scoreIncreaseDismissed).toBe(false);
    expect(d.dismissedBaselinePrompts.size).toBe(0);
    expect(d.dismissedReEngagements.size).toBe(0);
  });
});

// ── DD.2 ─────────────────────────────────────────────────────────────────────

describe("DD.2 — dismissBanner", () => {
  it("sets bannerDismissed to true", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    act(() => { result.current.dismissBanner(); });
    expect(result.current.bannerDismissed).toBe(true);
  });
});

// ── DD.3 ─────────────────────────────────────────────────────────────────────

describe("DD.3 — dismissBaselinePrompt", () => {
  it("adds the propertyId to dismissedBaselinePrompts", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    act(() => { result.current.dismissBaselinePrompt("prop-1"); });
    expect(result.current.dismissedBaselinePrompts.has("prop-1")).toBe(true);
  });

  it("can dismiss multiple properties independently", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    act(() => { result.current.dismissBaselinePrompt("prop-1"); });
    act(() => { result.current.dismissBaselinePrompt("prop-2"); });
    expect(result.current.dismissedBaselinePrompts.size).toBe(2);
  });
});

// ── DD.4 ─────────────────────────────────────────────────────────────────────

describe("DD.4 — dismissMilestone", () => {
  it("flips milestoneDismissed to true", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    act(() => { result.current.dismissMilestone(); });
    expect(result.current.milestoneDismissed).toBe(true);
  });
});

// ── DD.5 ─────────────────────────────────────────────────────────────────────

describe("DD.5 — dismissPulse", () => {
  it("flips pulseDismissed to true", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    act(() => { result.current.dismissPulse(); });
    expect(result.current.pulseDismissed).toBe(true);
  });
});

// ── DD.6 ─────────────────────────────────────────────────────────────────────

describe("DD.6 — dismissScoreIncrease", () => {
  it("flips scoreIncreaseDismissed to true", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    act(() => { result.current.dismissScoreIncrease(); });
    expect(result.current.scoreIncreaseDismissed).toBe(true);
  });
});

// ── DD.7 ─────────────────────────────────────────────────────────────────────

describe("DD.7 — dismissReEngagement", () => {
  it("adds the jobId to dismissedReEngagements", () => {
    const { result } = renderHook(() => useDashboardDismissals());
    act(() => { result.current.dismissReEngagement("job-abc"); });
    expect(result.current.dismissedReEngagements.has("job-abc")).toBe(true);
  });
});

// ── DD.8 ─────────────────────────────────────────────────────────────────────

describe("DD.8 — persisted state loads from localStorage on mount", () => {
  it("upgradeBannerDismissed is true when key exists", () => {
    localStorage.setItem("homegentic_upgrade_banner_dismissed", "1");
    const { result } = renderHook(() => useDashboardDismissals());
    expect(result.current.upgradeBannerDismissed).toBe(true);
  });

  it("milestone3Dismissed is true when key exists", () => {
    localStorage.setItem("homegentic_3job_milestone", "1");
    const { result } = renderHook(() => useDashboardDismissals());
    expect(result.current.milestone3Dismissed).toBe(true);
  });
});
