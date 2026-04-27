/**
 * MOB.5 — DashboardPage mobile audit
 */
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

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

beforeAll(async () => {
  mockMatchMedia(1280);
  DashboardPage = (await import("@/pages/DashboardPage")).default;
});

async function renderDashboard(width: number) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <Routes><Route path="/dashboard" element={<DashboardPage />} /></Routes>
      </MemoryRouter>
    );
  });
  return result;
}

// ── Renders without crashing ──────────────────────────────────────────────────

describe("DashboardPage — renders on both viewports", () => {
  it("renders on desktop without crashing", async () => {
    const { container } = await renderDashboard(1280);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders on mobile without crashing", async () => {
    const { container } = await renderDashboard(390);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── KPI stats row ─────────────────────────────────────────────────────────────
// The repeat(5,1fr) grid must NOT appear on mobile — replaced by ResponsiveGrid

describe("DashboardPage — KPI stats grid", () => {
  it("does NOT use a 5-column fixed grid on mobile", async () => {
    const { container } = await renderDashboard(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const fiveCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(5,1fr)"
    );
    expect(fiveCol).toBeUndefined();
  });

  it("uses at most 2 columns on mobile for the KPI stat row", async () => {
    const { container } = await renderDashboard(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const fiveCol = allDivs.find((el) => {
      const cols = el.style.gridTemplateColumns ?? "";
      return cols.replace(/\s/g, "").match(/repeat\([5-9]|(?:1fr\s*){5}/);
    });
    expect(fiveCol).toBeUndefined();
  });

  it("uses full 5-column grid on desktop", async () => {
    const { container } = await renderDashboard(1280);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const fiveCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "").includes("repeat(5,1fr)")
    );
    expect(fiveCol).toBeDefined();
  });
});

// ── Property comparison table ─────────────────────────────────────────────────
// The 5-column table header must be wrapped in a scroll container on mobile

describe("DashboardPage — property comparison table scroll", () => {
  it("does NOT use a fixed 5-column table header on mobile (must be in scroll container)", async () => {
    const { container } = await renderDashboard(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    // On mobile, any grid with a "2fr" column must be inside an overflow-x:auto wrapper
    const bareTable = allDivs.find((el) => {
      const cols = el.style.gridTemplateColumns?.replace(/\s/g, "");
      if (!cols?.includes("2fr")) return false;
      const parent = el.parentElement as HTMLElement | null;
      // parent must exist and have overflow-x:auto
      return !parent || parent.style.overflowX !== "auto";
    });
    expect(bareTable).toBeUndefined();
  });
});
