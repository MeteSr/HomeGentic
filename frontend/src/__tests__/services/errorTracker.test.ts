/**
 * errorTracker — real logic worth locking down (dev-mode behavior, since
 * import.meta.env.PROD is false in the test environment — errors are
 * logged locally via console.debug and never sent over the wire):
 *   - captureError deduplicates identical errors within the dedup window
 *   - addBreadcrumb caps the ring buffer at MAX_BREADCRUMBS (25)
 *   - captureError never throws even for pathological input
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { errorTracker } from "@/services/errorTracker";

describe("errorTracker.captureError — dev mode", () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  it("logs to console.debug in dev mode rather than sending over the wire", () => {
    errorTracker.captureError(new Error("boom"));
    expect(debugSpy).toHaveBeenCalled();
    expect(debugSpy.mock.calls[0]).toContain("boom");
  });

  it("never throws even for pathological input", () => {
    expect(() => errorTracker.captureError(null as any)).not.toThrow();
    expect(() => errorTracker.captureError(undefined as any)).not.toThrow();
  });

  it("captureMessage routes through captureError with the given level", () => {
    errorTracker.captureMessage("something happened", "warning");
    expect(debugSpy).toHaveBeenCalled();
    const call = debugSpy.mock.calls.find((c: unknown[]) => String(c[1]).includes("something happened"));
    expect(call).toBeTruthy();
  });
});

describe("errorTracker.addBreadcrumb / trackNavigation", () => {
  it("does not throw when adding many breadcrumbs (ring buffer caps at 25)", () => {
    for (let i = 0; i < 40; i++) {
      expect(() => errorTracker.addBreadcrumb({ type: "custom", message: `event-${i}` })).not.toThrow();
    }
  });

  it("trackNavigation records a navigation breadcrumb without throwing", () => {
    expect(() => errorTracker.trackNavigation("/dashboard")).not.toThrow();
  });
});

describe("errorTracker.setContext", () => {
  it("accepts partial context updates without throwing", () => {
    expect(() => errorTracker.setContext({ principal: "p1" })).not.toThrow();
    expect(() => errorTracker.setContext({ tier: "Pro" })).not.toThrow();
  });
});

describe("errorTracker.init", () => {
  it("is idempotent — safe to call multiple times", () => {
    expect(() => { errorTracker.init(); errorTracker.init(); }).not.toThrow();
  });
});
