/**
 * MOB.3 — Public profile pages responsive layout
 */
import { render, act, screen } from "@testing-library/react";
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
  ScoreCertPage        = (await import("@/pages/ScoreCertPage")).default;
  ContractorPublicPage = (await import("@/pages/ContractorPublicPage")).default;
  AgentPublicPage      = (await import("@/pages/AgentPublicPage")).default;
  ListingDetailPage    = (await import("@/pages/ListingDetailPage")).default;
});

// ── ScoreCertPage ─────────────────────────────────────────────────────────────

describe("ScoreCertPage — desktop (1280px)", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("renders invalid-cert error without crashing", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/cert/not-a-valid-token"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      );
    });
    expect(screen.getByText(/invalid certificate/i)).toBeInTheDocument();
  });

  it("outer container uses 2rem padding on desktop", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/cert/bad"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    // React 19: react-helmet-async may render non-hoistable elements (e.g. JSON-LD
    // script) into the container before the outer div, so we query directly.
    const outer = container.querySelector("div[style*='min-height']") as HTMLElement;
    expect(outer).not.toBeNull();
    expect(outer.style.padding).toBe("2rem");
  });
});

describe("ScoreCertPage — mobile (390px)", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders without crashing on phone", async () => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/cert/bad"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      );
    });
    expect(screen.getByText(/invalid certificate/i)).toBeInTheDocument();
  });

  it("outer container uses reduced padding on mobile", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/cert/bad"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    // React 19: query directly instead of relying on container.firstChild order.
    const outer = container.querySelector("div[style*='min-height']") as HTMLElement;
    expect(outer).not.toBeNull();
    expect(outer.style.padding).toBe("1rem");
  });
});

// ── ContractorPublicPage ──────────────────────────────────────────────────────

describe("ContractorPublicPage — renders on mobile", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders loading or not-found state without crashing", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/contractor/test-id"]}>
          <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    expect(container.firstChild).not.toBeNull();
  });

  it("outer wrapper has padding on mobile", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/contractor/test-id"]}>
          <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    const contentDiv = container.querySelector("[style*='max-width']") as HTMLElement | null;
    expect(contentDiv).not.toBeNull();
    expect(contentDiv!.style.padding).toBeTruthy();
  });
});

describe("ContractorPublicPage — renders on desktop", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("outer wrapper has padding on desktop", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/contractor/test-id"]}>
          <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    const contentDiv = container.querySelector("[style*='max-width']") as HTMLElement | null;
    expect(contentDiv).not.toBeNull();
    expect(contentDiv!.style.padding).toBeTruthy();
  });
});

// ── AgentPublicPage ───────────────────────────────────────────────────────────

describe("AgentPublicPage — renders on mobile", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders loading state without crashing on phone", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/agent/test-id"]}>
          <Routes><Route path="/agent/:id" element={<AgentPublicPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    expect(container.firstChild).not.toBeNull();
  });
});

// ── ListingDetailPage ─────────────────────────────────────────────────────────

describe("ListingDetailPage — form grids on mobile", () => {
  beforeEach(() => mockMatchMedia(390));

  it("renders loading or empty state without crashing on phone", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/listings/test-id"]}>
          <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    expect(container.firstChild).not.toBeNull();
  });
});

describe("ListingDetailPage — form grids on desktop", () => {
  beforeEach(() => mockMatchMedia(1280));

  it("renders without crashing on desktop", async () => {
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(
        <MemoryRouter initialEntries={["/listings/test-id"]}>
          <Routes><Route path="/listings/:id" element={<ListingDetailPage />} /></Routes>
        </MemoryRouter>
      ));
    });
    expect(container.firstChild).not.toBeNull();
  });
});
