/**
 * ResponsiveGrid — real logic worth locking down: the column count
 * (gridTemplateColumns) switches between cols.mobile/tablet/desktop based
 * on the real useBreakpoint() hook, driven here via a stubbed matchMedia
 * (the same pattern used in useBreakpoint.test.ts).
 */

import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";

afterEach(() => {
  vi.restoreAllMocks();
});

function stubMatchMedia(isMobile: boolean, isNotDesktop: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => {
    const mobileQ = query.includes("640");
    const matches = mobileQ ? isMobile : isNotDesktop;
    return {
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn().mockReturnValue(false),
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    } as MediaQueryList;
  });
}

const COLS = { mobile: 1, tablet: 2, desktop: 4 };

describe("ResponsiveGrid — column count by breakpoint", () => {
  it("uses cols.desktop on a desktop viewport", () => {
    stubMatchMedia(false, false);
    const { container } = render(
      <ResponsiveGrid cols={COLS}>
        <div>a</div>
      </ResponsiveGrid>
    );
    expect((container.firstChild as HTMLElement).style.gridTemplateColumns).toBe("repeat(4, 1fr)");
  });

  it("uses cols.tablet on a tablet viewport", () => {
    stubMatchMedia(false, true);
    const { container } = render(
      <ResponsiveGrid cols={COLS}>
        <div>a</div>
      </ResponsiveGrid>
    );
    expect((container.firstChild as HTMLElement).style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  it("uses cols.mobile on a mobile viewport", () => {
    stubMatchMedia(true, true);
    const { container } = render(
      <ResponsiveGrid cols={COLS}>
        <div>a</div>
      </ResponsiveGrid>
    );
    expect((container.firstChild as HTMLElement).style.gridTemplateColumns).toBe("repeat(1, 1fr)");
  });
});

describe("ResponsiveGrid — styling props", () => {
  it("defaults the gap to 1rem", () => {
    stubMatchMedia(false, false);
    const { container } = render(
      <ResponsiveGrid cols={COLS}>
        <div>a</div>
      </ResponsiveGrid>
    );
    expect((container.firstChild as HTMLElement).style.gap).toBe("1rem");
  });

  it("applies a custom gap when provided", () => {
    stubMatchMedia(false, false);
    const { container } = render(
      <ResponsiveGrid cols={COLS} gap="2.5rem">
        <div>a</div>
      </ResponsiveGrid>
    );
    expect((container.firstChild as HTMLElement).style.gap).toBe("2.5rem");
  });

  it("applies the className prop", () => {
    stubMatchMedia(false, false);
    const { container } = render(
      <ResponsiveGrid cols={COLS} className="my-grid">
        <div>a</div>
      </ResponsiveGrid>
    );
    expect(container.firstChild).toHaveClass("my-grid");
  });

  it("lets a custom style prop override the computed grid style", () => {
    stubMatchMedia(false, false);
    const { container } = render(
      <ResponsiveGrid cols={COLS} style={{ gap: "9rem" }}>
        <div>a</div>
      </ResponsiveGrid>
    );
    expect((container.firstChild as HTMLElement).style.gap).toBe("9rem");
  });

  it("renders children", () => {
    stubMatchMedia(false, false);
    const { getByText } = render(
      <ResponsiveGrid cols={COLS}>
        <div>hello child</div>
      </ResponsiveGrid>
    );
    expect(getByText("hello child")).toBeInTheDocument();
  });
});
