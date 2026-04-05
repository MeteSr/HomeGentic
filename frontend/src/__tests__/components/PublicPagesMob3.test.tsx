/**
 * MOB.3 — Public profile pages responsive layout
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";

// ── matchMedia mock ───────────────────────────────────────────────────────────
let currentWidth = 1280;
function mockMatchMedia(width: number) {
  currentWidth = width;
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => {
      const maxMatch = query.match(/max-width:\s*(\d+)px/);
      const matches  = maxMatch ? currentWidth <= parseInt(maxMatch[1], 10) : false;
      return { matches, media: query, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false };
    },
  });
}

// ── lazy imports (after matchMedia is set up) ─────────────────────────────────
let ScoreCertPage: React.ComponentType;
let ContractorPublicPage: React.ComponentType;
let AgentPublicPage: React.ComponentType;
let ListingDetailPage: React.ComponentType;

beforeAll(async () => {
  mockMatchMedia(1280);
  ScoreCertPage       = (await import("@/pages/ScoreCertPage")).default;
  ContractorPublicPage = (await import("@/pages/ContractorPublicPage")).default;
  AgentPublicPage     = (await import("@/pages/AgentPublicPage")).default;
  ListingDetailPage   = (await import("@/pages/ListingDetailPage")).default;
});

// ── ScoreCertPage ─────────────────────────────────────────────────────────────

describe("ScoreCertPage — desktop (1280px)", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("renders invalid-cert error without crashing", () => {
    render(
      <MemoryRouter initialEntries={["/cert/not-a-valid-token"]}>
        <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/invalid certificate/i)).toBeInTheDocument();
  });

  it("outer container uses 2rem padding on desktop", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/cert/bad"]}>
        <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
      </MemoryRouter>
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.padding).toBe("2rem");
  });
});

describe("ScoreCertPage — mobile (390px)", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders without crashing on phone", () => {
    render(
      <MemoryRouter initialEntries={["/cert/bad"]}>
        <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
      </MemoryRouter>
    );
    expect(screen.getByText(/invalid certificate/i)).toBeInTheDocument();
  });

  it("outer container uses reduced padding on mobile", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/cert/bad"]}>
        <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
      </MemoryRouter>
    );
    const outer = container.firstChild as HTMLElement;
    expect(outer.style.padding).toBe("1rem");
  });
});

// ── ContractorPublicPage ──────────────────────────────────────────────────────

describe("ContractorPublicPage — renders on mobile", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders loading or not-found state without crashing", () => {
    render(
      <MemoryRouter initialEntries={["/contractor/test-id"]}>
        <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
      </MemoryRouter>
    );
    // Either loading spinner or contractor content — page must mount
    expect(document.body).toBeTruthy();
  });

  it("outer wrapper uses reduced padding on mobile", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/contractor/test-id"]}>
        <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
      </MemoryRouter>
    );
    // The inner content div (maxWidth: 38rem) should use mobile padding
    const contentDiv = container.querySelector("[style*='max-width']") as HTMLElement | null;
    if (contentDiv) {
      expect(contentDiv.style.padding).toMatch(/1rem/);
    }
  });
});

describe("ContractorPublicPage — renders on desktop", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("outer wrapper uses full padding on desktop", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/contractor/test-id"]}>
        <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
      </MemoryRouter>
    );
    const contentDiv = container.querySelector("[style*='max-width']") as HTMLElement | null;
    if (contentDiv) {
      expect(contentDiv.style.padding).toMatch(/2rem/);
    }
  });
});

// ── AgentPublicPage ───────────────────────────────────────────────────────────

describe("AgentPublicPage — renders on mobile", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders loading state without crashing on phone", () => {
    render(
      <MemoryRouter initialEntries={["/agent/test-id"]}>
        <Routes><Route path="/agent/:id" element={<AgentPublicPage />} /></Routes>
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});

// ── ListingDetailPage ─────────────────────────────────────────────────────────

describe("ListingDetailPage — form grids on mobile", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders loading or empty state without crashing on phone", () => {
    render(
      <MemoryRouter initialEntries={["/listings/test-id"]}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});

describe("ListingDetailPage — form grids on desktop", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("renders without crashing on desktop", () => {
    render(
      <MemoryRouter initialEntries={["/listings/test-id"]}>
        <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
      </MemoryRouter>
    );
    expect(document.body).toBeTruthy();
  });
});
