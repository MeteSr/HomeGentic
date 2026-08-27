/**
 * Unit tests for useBreakpoint hook
 *
 * jsdom doesn't implement matchMedia, so we stub window.matchMedia
 * before each test group to simulate specific viewport states.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBreakpoint } from "@/hooks/useBreakpoint";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubMatchMedia(isMobile: boolean, isNotDesktop: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const mobileQ   = query.includes("640");
    const matches   = mobileQ ? isMobile : isNotDesktop;
    return {
      matches,
      media:               query,
      addEventListener:    vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent:       vi.fn().mockReturnValue(false),
      onchange:            null,
      addListener:         vi.fn(),
      removeListener:      vi.fn(),
    } as MediaQueryList;
  });
}

describe("useBreakpoint — desktop viewport (> 1024px)", () => {
  it("returns isDesktop true, isMobile false, isTablet false", () => {
    stubMatchMedia(false, false); // neither mobile nor tablet query matches
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
  });
});

describe("useBreakpoint — mobile viewport (<= 640px)", () => {
  it("returns isMobile true, isDesktop false, isTablet false", () => {
    stubMatchMedia(true, true); // mobile query matches → isMobile=true
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.isTablet).toBe(false);
  });
});

describe("useBreakpoint — tablet viewport (641–1024px)", () => {
  it("returns isTablet true, isMobile false, isDesktop false", () => {
    stubMatchMedia(false, true); // notDesktop matches but not mobile
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isDesktop).toBe(false);
  });
});

describe("useBreakpoint — exactly one flag is true", () => {
  it("exactly one of isMobile/isTablet/isDesktop is true for desktop", () => {
    stubMatchMedia(false, false);
    const { result } = renderHook(() => useBreakpoint());
    const { isMobile, isTablet, isDesktop } = result.current;
    const trueCount = [isMobile, isTablet, isDesktop].filter(Boolean).length;
    expect(trueCount).toBe(1);
  });

  it("exactly one of isMobile/isTablet/isDesktop is true for tablet", () => {
    stubMatchMedia(false, true);
    const { result } = renderHook(() => useBreakpoint());
    const { isMobile, isTablet, isDesktop } = result.current;
    const trueCount = [isMobile, isTablet, isDesktop].filter(Boolean).length;
    expect(trueCount).toBe(1);
  });
});
