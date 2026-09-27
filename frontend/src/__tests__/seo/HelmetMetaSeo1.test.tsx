/**
 * SEO.1 — per-route <title> and meta tags (set via PageHead)
 *
 * Each public-facing page must set:
 *   - document.title (unique, brand-suffixed)
 *   - meta[name="description"]
 *   - meta[property="og:title"]
 *   - meta[property="og:description"]
 *   - meta[property="og:type"]
 */
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { vi } from "vitest";

// ── requestAnimationFrame — run RAF callbacks synchronously ────────────────────
// Run synchronously so document.title and meta tags are set before assertions.
(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
(globalThis as any).cancelAnimationFrame = () => {};

const PENDING = vi.hoisted(() => new Promise<never>(() => {}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/services/contractor", () => ({
  contractorService: {
    getContractor:  vi.fn(() => PENDING),
    getCredentials: vi.fn(() => PENDING),
  },
}));
vi.mock("@/services/listing", () => ({
  listingService: {
    getAgentPerformanceRecords: vi.fn(() => PENDING),
    getListing:                 vi.fn(() => PENDING),
    getPublicListing:           vi.fn(() => PENDING),
  },
}));
vi.mock("@/services/property", () => ({
  propertyService: { getProperty: vi.fn(() => PENDING) },
}));
vi.mock("@/services/job", () => ({
  jobService: { getByProperty: vi.fn(() => PENDING) },
}));
vi.mock("@/services/fsbo", () => ({
  fsboService: { getRecord: vi.fn(() => null) },
}));

// ── matchMedia stub (required by useBreakpoint) ───────────────────────────────
Object.defineProperty(window, "matchMedia", {
  writable: true,
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// ── helpers ───────────────────────────────────────────────────────────────────
function metaContent(selector: string): string {
  return (document.querySelector(selector) as HTMLMetaElement)?.content ?? "";
}

// Remove Helmet-managed head tags between tests to avoid cross-test contamination.
afterEach(() => {
  document.querySelectorAll("[data-rh]").forEach((el) => el.remove());
  document.title = "";
});

function wrap(element: React.ReactElement, path = "/") {
  return (
    <>
      <MemoryRouter initialEntries={[path]}>
        {element}
      </MemoryRouter>
    </>
  );
}

// ── LandingPage ───────────────────────────────────────────────────────────────
describe("LandingPage — Helmet meta", () => {
  let LandingPage: React.ComponentType;
  beforeAll(async () => {
    LandingPage = (await import("@/pages/LandingPage")).default;
  });

  it("sets a title containing HomeGentic", () => {
    render(wrap(<LandingPage />));
    expect(document.title).toMatch(/HomeGentic/i);
  });

  it("sets meta[name=description]", () => {
    render(wrap(<LandingPage />));
    expect(metaContent('meta[name="description"]')).not.toBe("");
  });

  it("sets og:title", () => {
    render(wrap(<LandingPage />));
    expect(metaContent('meta[property="og:title"]')).toMatch(/HomeGentic/i);
  });

  it("sets og:type to website", () => {
    render(wrap(<LandingPage />));
    expect(metaContent('meta[property="og:type"]')).toBe("website");
  });
});

// ── FsboListingPage ───────────────────────────────────────────────────────────
describe("FsboListingPage — Helmet meta", () => {
  let FsboListingPage: React.ComponentType;
  beforeAll(async () => {
    FsboListingPage = (await import("@/pages/FsboListingPage")).default;
  });

  it("sets a title (loading or loaded)", () => {
    render(
      <>
        <MemoryRouter initialEntries={["/listing/1"]}>
          <Routes>
            <Route path="/listing/:id" element={<FsboListingPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );
    expect(document.title).toMatch(/HomeGentic/i);
  });

  it("sets og:type to website", () => {
    render(
      <>
        <MemoryRouter initialEntries={["/listing/1"]}>
          <Routes>
            <Route path="/listing/:id" element={<FsboListingPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );
    expect(metaContent('meta[property="og:type"]')).toBe("website");
  });
});

// ── ContractorPublicPage ──────────────────────────────────────────────────────
describe("ContractorPublicPage — Helmet meta", () => {
  let ContractorPublicPage: React.ComponentType;
  beforeAll(async () => {
    ContractorPublicPage = (await import("@/pages/ContractorPublicPage")).default;
  });

  it("sets a title (loading or loaded)", () => {
    render(
      <>
        <MemoryRouter initialEntries={["/contractor/abc"]}>
          <Routes>
            <Route path="/contractor/:id" element={<ContractorPublicPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );
    expect(document.title).toMatch(/HomeGentic/i);
  });

  it("sets og:type to website", () => {
    render(
      <>
        <MemoryRouter initialEntries={["/contractor/abc"]}>
          <Routes>
            <Route path="/contractor/:id" element={<ContractorPublicPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );
    expect(metaContent('meta[property="og:type"]')).toBe("website");
  });
});

// ── ScoreCertPage ─────────────────────────────────────────────────────────────
describe("ScoreCertPage — Helmet meta", () => {
  let ScoreCertPage: React.ComponentType;
  beforeAll(async () => {
    ScoreCertPage = (await import("@/pages/ScoreCertPage")).default;
  });

  it("sets a title", () => {
    render(
      <>
        <MemoryRouter initialEntries={["/cert/sometoken"]}>
          <Routes>
            <Route path="/cert/:token" element={<ScoreCertPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );
    expect(document.title).toMatch(/HomeGentic/i);
  });

  it("sets og:type to website", () => {
    render(
      <>
        <MemoryRouter initialEntries={["/cert/sometoken"]}>
          <Routes>
            <Route path="/cert/:token" element={<ScoreCertPage />} />
          </Routes>
        </MemoryRouter>
      </>
    );
    expect(metaContent('meta[property="og:type"]')).toBe("website");
  });
});

// ── InstantForecastPage ───────────────────────────────────────────────────────
describe("InstantForecastPage — Helmet meta", () => {
  let InstantForecastPage: React.ComponentType;
  beforeAll(async () => {
    InstantForecastPage = (await import("@/pages/InstantForecastPage")).default;
  });

  it("sets a title containing HomeGentic", () => {
    render(wrap(<InstantForecastPage />));
    expect(document.title).toMatch(/HomeGentic/i);
  });

  it("sets meta[name=description]", () => {
    render(wrap(<InstantForecastPage />));
    expect(metaContent('meta[name="description"]')).not.toBe("");
  });

  it("sets og:title", () => {
    render(wrap(<InstantForecastPage />));
    expect(metaContent('meta[property="og:title"]')).not.toBe("");
  });

  it("sets og:type to website", () => {
    render(wrap(<InstantForecastPage />));
    expect(metaContent('meta[property="og:type"]')).toBe("website");
  });
});

// ── CheckAddressPage ──────────────────────────────────────────────────────────
describe("CheckAddressPage — Helmet meta", () => {
  let CheckAddressPage: React.ComponentType;
  beforeAll(async () => {
    CheckAddressPage = (await import("@/pages/CheckAddressPage")).default;
  });

  it("sets a title containing HomeGentic", () => {
    render(wrap(<CheckAddressPage />));
    expect(document.title).toMatch(/HomeGentic/i);
  });

  it("sets og:type to website", () => {
    render(wrap(<CheckAddressPage />));
    expect(metaContent('meta[property="og:type"]')).toBe("website");
  });
});
