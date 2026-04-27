/**
 * MOB.6 — ContractorDashboardPage mobile audit
 */
import { render, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { vi } from "vitest";

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

let ContractorDashboardPage: React.ComponentType;

beforeAll(async () => {
  mockMatchMedia(1280);
  ContractorDashboardPage = (await import("@/pages/ContractorDashboardPage")).default;
});

async function renderDash(width: number) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={["/contractor-dashboard"]}>
        <Routes><Route path="/contractor-dashboard" element={<ContractorDashboardPage />} /></Routes>
      </MemoryRouter>
    );
  });
  return result;
}

// ── Renders without crashing ──────────────────────────────────────────────────

describe("ContractorDashboardPage — renders on both viewports", () => {
  it("renders on desktop without crashing", async () => {
    const { container } = await renderDash(1280);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders on mobile without crashing", async () => {
    const { container } = await renderDash(390);
    expect(container.firstChild).not.toBeNull();
  });
});

// ── 7-stat KPI row ────────────────────────────────────────────────────────────

describe("ContractorDashboardPage — KPI stats row", () => {
  it("does NOT use repeat(7,1fr) on mobile", async () => {
    const { container } = await renderDash(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const sevenCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(7,1fr)"
    );
    expect(sevenCol).toBeUndefined();
  });

  it("uses repeat(7,1fr) on desktop", async () => {
    const { container } = await renderDash(1280);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const sevenCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(7,1fr)"
    );
    expect(sevenCol).toBeDefined();
  });
});

// ── Two-panel layout ──────────────────────────────────────────────────────────

describe("ContractorDashboardPage — two-panel layout", () => {
  it("does NOT use fixed 320px sidebar column on mobile", async () => {
    const { container } = await renderDash(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    expect(allDivs.length).toBeGreaterThan(0);
    const fixedPanel = allDivs.find((el) =>
      el.style.gridTemplateColumns?.includes("320px")
    );
    expect(fixedPanel).toBeUndefined();
  });

  it("uses 1fr 320px two-column layout on desktop", async () => {
    const { container } = await renderDash(1280);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fixedPanel = allDivs.find((el) =>
      el.style.gridTemplateColumns?.includes("320px")
    );
    expect(fixedPanel).toBeDefined();
  });
});
