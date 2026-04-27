/**
 * MOB.10 — Tablet layout pass (768px – 1024px)
 * Validates intermediate column counts and ResponsiveGrid tablet behavior.
 */
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { ResponsiveGrid } from "@/components/ResponsiveGrid";

// Prevents VoiceAgent / AuthContext / @icp-sdk/auth → IndexedDB dependency
// chain that causes act() to hang when multiple pages share one module registry.
vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));

// ── matchMedia mock ───────────────────────────────────────────────────────────
let currentWidth = 1280;
function mockMatchMedia(width: number) {
  currentWidth = width;
  Object.defineProperty(window, "matchMedia", {
    writable: true, configurable: true,
    value: (query: string) => {
      const maxMatch = query.match(/max-width:\s*(\d+)px/);
      const matches  = maxMatch ? currentWidth <= parseInt(maxMatch[1], 10) : false;
      return { matches, media: query, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    },
  });
}

let DashboardPage: React.ComponentType;
let ContractorDashboardPage: React.ComponentType;

beforeAll(async () => {
  mockMatchMedia(1280);
  DashboardPage           = (await import("@/pages/DashboardPage")).default;
  ContractorDashboardPage = (await import("@/pages/ContractorDashboardPage")).default;
});

// ── ResponsiveGrid at tablet width ────────────────────────────────────────────

describe("ResponsiveGrid — tablet breakpoint (768px)", () => {
  it("renders 2 columns on mobile (390px)", () => {
    mockMatchMedia(390);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 2, tablet: 3, desktop: 5 }}>
        <div>a</div><div>b</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  it("renders 3 columns at tablet (768px)", () => {
    mockMatchMedia(768);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 2, tablet: 3, desktop: 5 }}>
        <div>a</div><div>b</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(3, 1fr)");
  });

  it("renders 5 columns on desktop (1280px)", () => {
    mockMatchMedia(1280);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 2, tablet: 3, desktop: 5 }}>
        <div>a</div><div>b</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(5, 1fr)");
  });

  it("uses tablet col count at 1024px (boundary)", () => {
    mockMatchMedia(1024);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 4 }}>
        <div>a</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(2, 1fr)");
  });

  it("uses desktop col count just above tablet boundary (1025px)", () => {
    mockMatchMedia(1025);
    const { container } = render(
      <ResponsiveGrid cols={{ mobile: 1, tablet: 2, desktop: 4 }}>
        <div>a</div>
      </ResponsiveGrid>
    );
    const grid = container.firstChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(4, 1fr)");
  });
});

// ── Dashboard pages at tablet width ──────────────────────────────────────────

describe("DashboardPage — renders at tablet width (768px)", () => {
  it("renders without crashing at 768px", async () => {
    mockMatchMedia(768);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes><Route path="/dashboard" element={<DashboardPage />} /></Routes>
        </MemoryRouter>
      );
    });
    expect(document.body).toBeTruthy();
  });

  it("does not use 5-col grid at tablet (3-col via ResponsiveGrid)", async () => {
    mockMatchMedia(768);
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes><Route path="/dashboard" element={<DashboardPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fiveCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(5,1fr)"
    );
    expect(fiveCol).toBeUndefined();
  });
});

describe("ContractorDashboardPage — renders at tablet width (768px)", () => {
  it("renders without crashing at 768px", async () => {
    mockMatchMedia(768);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/contractor-dashboard"]}>
          <Routes><Route path="/contractor-dashboard" element={<ContractorDashboardPage />} /></Routes>
        </MemoryRouter>
      );
    });
    expect(document.body).toBeTruthy();
  });

  it("does not use 7-col grid at tablet (4-col via ResponsiveGrid)", async () => {
    mockMatchMedia(768);
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/contractor-dashboard"]}>
          <Routes><Route path="/contractor-dashboard" element={<ContractorDashboardPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const sevenCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(7,1fr)"
    );
    expect(sevenCol).toBeUndefined();
  });
});
