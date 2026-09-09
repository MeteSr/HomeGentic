/**
 * MOB.1 — useBreakpoint hook + ResponsiveGrid component
 */
import { renderHook, act } from "@testing-library/react";
import { render, screen } from "@testing-library/react";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { BREAKPOINTS } from "@/utils/breakpoints";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";

// ── matchMedia mock helpers ───────────────────────────────────────────────────

type MediaQueryCallback = (e: { matches: boolean }) => void;
const listeners = new Map<string, MediaQueryCallback[]>();
let currentWidth = 1280;

function evaluateQuery(query: string, width: number): boolean {
  const maxMatch = query.match(/max-width:\s*(\d+)px/);
  if (maxMatch) return width <= parseInt(maxMatch[1], 10);
  const minMatch = query.match(/min-width:\s*(\d+)px/);
  if (minMatch) return width >= parseInt(minMatch[1], 10);
  return false;
}

function setViewport(width: number) {
  currentWidth = width;
  listeners.forEach((cbs, query) => {
    const matches = evaluateQuery(query, width);
    cbs.forEach((cb) => cb({ matches }));
  });
}

function mockMatchMedia(initialWidth: number) {
  currentWidth = initialWidth;
  listeners.clear();
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => {
      const matches = evaluateQuery(query, currentWidth);
      return {
        matches,
        media: query,
        addEventListener: (_: string, cb: MediaQueryCallback) => {
          const list = listeners.get(query) ?? [];
          list.push(cb);
          listeners.set(query, list);
        },
        removeEventListener: (_: string, cb: MediaQueryCallback) => {
          const list = listeners.get(query) ?? [];
          listeners.set(query, list.filter((c) => c !== cb));
        },
        dispatchEvent: () => false,
      };
    },
  });
}

// ── BREAKPOINTS constants ─────────────────────────────────────────────────────

describe("BREAKPOINTS constants", () => {
  it("MOBILE is 640", () => expect(BREAKPOINTS.MOBILE).toBe(640));
  it("TABLET is 1024", () => expect(BREAKPOINTS.TABLET).toBe(1024));
});

// ── useBreakpoint — initial values ────────────────────────────────────────────

describe("useBreakpoint — phone (390px)", () => {
  beforeEach(() => mockMatchMedia(390));

  it("isMobile is true", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isMobile).toBe(true);
  });

  it("isTablet is false", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isTablet).toBe(false);
  });

  it("isDesktop is false", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isDesktop).toBe(false);
  });
});

describe("useBreakpoint — tablet (768px)", () => {
  beforeEach(() => mockMatchMedia(768));

  it("isMobile is false", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isMobile).toBe(false);
  });

  it("isTablet is true", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isTablet).toBe(true);
  });

  it("isDesktop is false", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isDesktop).toBe(false);
  });
});

describe("useBreakpoint — desktop (1280px)", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("isMobile is false", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isMobile).toBe(false);
  });

  it("isTablet is false", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isTablet).toBe(false);
  });

  it("isDesktop is true", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isDesktop).toBe(true);
  });
});

// ── useBreakpoint — boundary values ──────────────────────────────────────────

describe("useBreakpoint — boundaries", () => {
  it("640px is mobile (at boundary)", () => {
    mockMatchMedia(640);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isMobile).toBe(true);
  });

  it("641px is not mobile", () => {
    mockMatchMedia(641);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isMobile).toBe(false);
  });

  it("1024px is tablet (at boundary)", () => {
    mockMatchMedia(1024);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isTablet).toBe(true);
  });

  it("1025px is desktop", () => {
    mockMatchMedia(1025);
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isDesktop).toBe(true);
  });
});

// ── useBreakpoint — reacts to viewport changes ────────────────────────────────

describe("useBreakpoint — dynamic resize", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("updates isMobile when viewport shrinks to phone width", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isMobile).toBe(false);
    act(() => setViewport(390));
    expect(result.current.isMobile).toBe(true);
  });

  it("updates isDesktop → false when viewport shrinks to tablet", () => {
    const { result } = renderHook(() => useBreakpoint());
    expect(result.current.isDesktop).toBe(true);
    act(() => setViewport(768));
    expect(result.current.isDesktop).toBe(false);
  });
});

// ── ResponsiveGrid ────────────────────────────────────────────────────────────

describe("ResponsiveGrid — renders children", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("renders all children", () => {
    render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 4 }}>
        <div>A</div>
        <div>B</div>
        <div>C</div>
      </ResponsiveGrid>
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });
});

describe("ResponsiveGrid — column count by breakpoint", () => {
  it("uses desktop cols on desktop viewport", () => {
    mockMatchMedia(1280);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 4 }}>
        <div>A</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(4, 1fr)");
  });

  it("uses tablet cols on tablet viewport", () => {
    mockMatchMedia(768);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 4 }}>
        <div>A</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  it("uses mobile cols on phone viewport", () => {
    mockMatchMedia(390);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 4 }}>
        <div>A</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(1, 1fr)");
  });
});

describe("ResponsiveGrid — gap and style passthrough", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("applies default gap of 1rem", () => {
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 3 }}>
        <div>A</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gap).toBe("1rem");
  });

  it("applies custom gap when provided", () => {
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 3 }} gap="1.5rem">
        <div>A</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gap).toBe("1.5rem");
  });

  it("merges extra style props", () => {
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 3 }} style={{ marginBottom: "2rem" }}>
        <div>A</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.marginBottom).toBe("2rem");
  });

  it("forwards className", () => {
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 3 }} className="my-grid">
        <div>A</div>
      </ResponsiveGrid>
    );
    expect(container.firstChild).toHaveClass("my-grid");
  });
});
