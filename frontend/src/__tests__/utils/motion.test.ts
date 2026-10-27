import { describe, it, expect, vi, afterEach } from "vitest";
import { scrollBehavior } from "@/utils/motion";

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: reduce && query.includes("reduce"), media: query }));
}

afterEach(() => vi.unstubAllGlobals());

describe("scrollBehavior", () => {
  it("scrolls smoothly by default", () => {
    mockReducedMotion(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("jumps instantly when the user asked for reduced motion", () => {
    mockReducedMotion(true);
    expect(scrollBehavior()).toBe("auto");
  });
});
