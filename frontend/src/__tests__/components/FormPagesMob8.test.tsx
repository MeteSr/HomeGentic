/**
 * MOB.8 — Core form pages mobile audit
 * JobCreatePage, QuoteRequestPage, PropertyRegisterPage,
 * ContractorProfilePage, SettingsPage
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

let JobCreatePage: React.ComponentType;
let QuoteRequestPage: React.ComponentType;
let PropertyRegisterPage: React.ComponentType;
let ContractorProfilePage: React.ComponentType;
let SettingsPage: React.ComponentType;

beforeAll(async () => {
  mockMatchMedia(1280);
  JobCreatePage         = (await import("@/pages/JobCreatePage")).default;
  QuoteRequestPage      = (await import("@/pages/QuoteRequestPage")).default;
  PropertyRegisterPage  = (await import("@/pages/PropertyRegisterPage")).default;
  ContractorProfilePage = (await import("@/pages/ContractorProfilePage")).default;
  SettingsPage          = (await import("@/pages/SettingsPage")).default;
});

function renderPage(Page: React.ComponentType, path: string, width: number) {
  mockMatchMedia(width);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path={path} element={<Page />} /></Routes>
    </MemoryRouter>
  );
}

// ── Helper: check no bare 1fr 1fr two-column grid exists ─────────────────────
function hasBare2ColGrid(container: HTMLElement): boolean {
  const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
  return allDivs.some((el) => {
    const cols = el.style.gridTemplateColumns?.replace(/\s/g, "");
    return cols === "1fr1fr";
  });
}

// ── JobCreatePage ─────────────────────────────────────────────────────────────

describe("JobCreatePage — mobile layout", () => {
  it("renders without crashing on mobile", () => {
    renderPage(JobCreatePage, "/jobs/new", 390);
    expect(document.body).toBeTruthy();
  });

  it("renders without crashing on desktop", () => {
    renderPage(JobCreatePage, "/jobs/new", 1280);
    expect(document.body).toBeTruthy();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", () => {
    const { container } = renderPage(JobCreatePage, "/jobs/new", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── QuoteRequestPage ──────────────────────────────────────────────────────────

describe("QuoteRequestPage — mobile layout", () => {
  it("renders without crashing on mobile", () => {
    renderPage(QuoteRequestPage, "/quotes/new", 390);
    expect(document.body).toBeTruthy();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", () => {
    const { container } = renderPage(QuoteRequestPage, "/quotes/new", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── PropertyRegisterPage ──────────────────────────────────────────────────────

describe("PropertyRegisterPage — mobile layout", () => {
  it("renders without crashing on mobile", () => {
    renderPage(PropertyRegisterPage, "/properties/new", 390);
    expect(document.body).toBeTruthy();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", () => {
    const { container } = renderPage(PropertyRegisterPage, "/properties/new", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── ContractorProfilePage ─────────────────────────────────────────────────────

describe("ContractorProfilePage — mobile layout", () => {
  it("renders without crashing on mobile", () => {
    renderPage(ContractorProfilePage, "/contractor-profile", 390);
    expect(document.body).toBeTruthy();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", () => {
    const { container } = renderPage(ContractorProfilePage, "/contractor-profile", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── SettingsPage ──────────────────────────────────────────────────────────────

describe("SettingsPage — sidebar", () => {
  it("renders without crashing on mobile", () => {
    renderPage(SettingsPage, "/settings", 390);
    expect(document.body).toBeTruthy();
  });

  it("does NOT use fixed 12rem sidebar on mobile", () => {
    const { container } = renderPage(SettingsPage, "/settings", 390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fixedSidebar = allDivs.find((el) => el.style.width === "12rem");
    expect(fixedSidebar).toBeUndefined();
  });

  it("uses fixed 12rem sidebar on desktop", () => {
    const { container } = renderPage(SettingsPage, "/settings", 1280);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fixedSidebar = allDivs.find((el) => el.style.width === "12rem");
    expect(fixedSidebar).toBeDefined();
  });
});
