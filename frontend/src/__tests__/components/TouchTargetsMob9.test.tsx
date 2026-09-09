/**
 * MOB.9 — Touch targets & tap interactions (44×44px minimum)
 * Apple HIG / WCAG 2.5.5: all interactive elements must be at least 44px tall.
 */
import { render } from "@testing-library/react";
import { Button } from "@/components/Button";

// ── matchMedia mock (needed for any component using useBreakpoint) ─────────────
Object.defineProperty(window, "matchMedia", {
  writable: true, configurable: true,
  value: (query: string) => ({
    matches: false, media: query,
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
});

// ── Button component ─────────────────────────────────────────────────────────

describe("Button — touch target size", () => {
  it("md button has minHeight 44px", () => {
    const { getByRole } = render(<Button>Click me</Button>);
    const btn = getByRole("button");
    expect(btn.style.minHeight).toBe("44px");
  });

  it("sm button has minHeight 44px", () => {
    const { getByRole } = render(<Button size="sm">Click me</Button>);
    const btn = getByRole("button");
    expect(btn.style.minHeight).toBe("44px");
  });

  it("lg button has minHeight 44px", () => {
    const { getByRole } = render(<Button size="lg">Click me</Button>);
    const btn = getByRole("button");
    expect(btn.style.minHeight).toBe("44px");
  });

  it("ghost variant button has minHeight 44px", () => {
    const { getByRole } = render(<Button variant="ghost">Ghost</Button>);
    const btn = getByRole("button");
    expect(btn.style.minHeight).toBe("44px");
  });

  it("outline variant button has minHeight 44px", () => {
    const { getByRole } = render(<Button variant="outline">Outline</Button>);
    const btn = getByRole("button");
    expect(btn.style.minHeight).toBe("44px");
  });

  it("secondary variant button has minHeight 44px", () => {
    const { getByRole } = render(<Button variant="secondary">Secondary</Button>);
    const btn = getByRole("button");
    expect(btn.style.minHeight).toBe("44px");
  });
});
