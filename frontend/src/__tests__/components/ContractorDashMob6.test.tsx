/**
 * MOB.6 — ContractorDashboardPage mobile audit
 */
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

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

function renderDash(width: number) {
  mockMatchMedia(width);
  return render(
    <MemoryRouter initialEntries={["/contractor-dashboard"]}>
      <Routes><Route path="/contractor-dashboard" element={<ContractorDashboardPage />} /></Routes>
    </MemoryRouter>
  );
}

// ── Renders without crashing ──────────────────────────────────────────────────

describe("ContractorDashboardPage — renders on both viewports", () => {
  it("renders on desktop without crashing", () => {
    renderDash(1280);
    expect(document.body).toBeTruthy();
  });

  it("renders on mobile without crashing", () => {
    renderDash(390);
    expect(document.body).toBeTruthy();
  });
});

// ── 7-stat KPI row ────────────────────────────────────────────────────────────

describe("ContractorDashboardPage — KPI stats row", () => {
  it("does NOT use repeat(7,1fr) on mobile", () => {
    const { container } = renderDash(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const sevenCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(7,1fr)"
    );
    expect(sevenCol).toBeUndefined();
  });

  it("uses repeat(7,1fr) on desktop", () => {
    const { container } = renderDash(1280);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const sevenCol = allDivs.find((el) =>
      el.style.gridTemplateColumns?.replace(/\s/g, "") === "repeat(7,1fr)"
    );
    expect(sevenCol).toBeDefined();
  });
});

// ── Two-panel layout ──────────────────────────────────────────────────────────

describe("ContractorDashboardPage — two-panel layout", () => {
  it("does NOT use fixed 320px sidebar column on mobile", () => {
    const { container } = renderDash(390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fixedPanel = allDivs.find((el) =>
      el.style.gridTemplateColumns?.includes("320px")
    );
    expect(fixedPanel).toBeUndefined();
  });

  it("uses 1fr 320px two-column layout on desktop", () => {
    const { container } = renderDash(1280);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fixedPanel = allDivs.find((el) =>
      el.style.gridTemplateColumns?.includes("320px")
    );
    expect(fixedPanel).toBeDefined();
  });
});
