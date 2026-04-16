/**
 * MOB.8 — Core form pages mobile audit
 * JobCreatePage, QuoteRequestPage, PropertyRegisterPage,
 * ContractorProfilePage, SettingsPage
 */
import { render, act } from "@testing-library/react";
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

async function renderPage(Page: React.ComponentType, path: string, width: number) {
  mockMatchMedia(width);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes><Route path={path} element={<Page />} /></Routes>
      </MemoryRouter>
    );
  });
  return result;
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
  it("renders without crashing on mobile", async () => {
    const { container } = await renderPage(JobCreatePage, "/jobs/new", 390);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders without crashing on desktop", async () => {
    const { container } = await renderPage(JobCreatePage, "/jobs/new", 1280);
    expect(container.firstChild).not.toBeNull();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", async () => {
    const { container } = await renderPage(JobCreatePage, "/jobs/new", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── QuoteRequestPage ──────────────────────────────────────────────────────────

describe("QuoteRequestPage — mobile layout", () => {
  it("renders without crashing on mobile", async () => {
    const { container } = await renderPage(QuoteRequestPage, "/quotes/new", 390);
    expect(container.firstChild).not.toBeNull();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", async () => {
    const { container } = await renderPage(QuoteRequestPage, "/quotes/new", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── PropertyRegisterPage ──────────────────────────────────────────────────────

describe("PropertyRegisterPage — mobile layout", () => {
  it("renders without crashing on mobile", async () => {
    const { container } = await renderPage(PropertyRegisterPage, "/properties/new", 390);
    expect(container.firstChild).not.toBeNull();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", async () => {
    const { container } = await renderPage(PropertyRegisterPage, "/properties/new", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── ContractorProfilePage ─────────────────────────────────────────────────────

describe("ContractorProfilePage — mobile layout", () => {
  it("renders without crashing on mobile", async () => {
    const { container } = await renderPage(ContractorProfilePage, "/contractor-profile", 390);
    expect(container.firstChild).not.toBeNull();
  });

  it("does NOT use bare 1fr 1fr grid on mobile", async () => {
    const { container } = await renderPage(ContractorProfilePage, "/contractor-profile", 390);
    expect(hasBare2ColGrid(container)).toBe(false);
  });
});

// ── SettingsPage ──────────────────────────────────────────────────────────────

describe("SettingsPage — sidebar", () => {
  it("renders without crashing on mobile", async () => {
    const { container } = await renderPage(SettingsPage, "/settings", 390);
    expect(container.firstChild).not.toBeNull();
  });

  it("does NOT use fixed 11rem sidebar on mobile", async () => {
    const { container } = await renderPage(SettingsPage, "/settings", 390);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fixedSidebar = allDivs.find((el) => el.style.width === "11rem");
    expect(fixedSidebar).toBeUndefined();
  });

  it("uses fixed 11rem sidebar on desktop", async () => {
    const { container } = await renderPage(SettingsPage, "/settings", 1280);
    const allDivs = Array.from(container.querySelectorAll("[style]")) as HTMLElement[];
    const fixedSidebar = allDivs.find((el) => el.style.width === "11rem");
    expect(fixedSidebar).toBeDefined();
  });
});
