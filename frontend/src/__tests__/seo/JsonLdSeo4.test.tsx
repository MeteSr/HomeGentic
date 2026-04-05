/**
 * SEO.4 — JSON-LD structured data
 *
 * Each key page must render a <script type="application/ld+json"> tag
 * with the correct @type for its schema.
 */
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import React from "react";

(globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
(globalThis as any).cancelAnimationFrame = () => {};

Object.defineProperty(window, "matchMedia", {
  writable: true, configurable: true,
  value: (q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false }),
});

afterEach(() => {
  document.querySelectorAll("[data-rh]").forEach((el) => el.remove());
  document.title = "";
});

function ldJson(): any {
  const el = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement | null;
  if (!el) return null;
  try { return JSON.parse(el.innerHTML); } catch { return null; }
}

function wrap(el: React.ReactElement, path = "/") {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></HelmetProvider>;
}

// ── LandingPage — Organization + WebSite ─────────────────────────────────────
describe("LandingPage — JSON-LD", () => {
  let LandingPage: React.ComponentType;
  beforeAll(async () => { LandingPage = (await import("@/pages/LandingPage")).default; });

  it("renders a JSON-LD script tag", () => {
    render(wrap(<LandingPage />));
    expect(ldJson()).not.toBeNull();
  });

  it("has @type WebSite or Organization", () => {
    render(wrap(<LandingPage />));
    const schema = ldJson();
    const type = Array.isArray(schema) ? schema[0]["@type"] : schema["@type"];
    expect(["WebSite", "Organization"]).toContain(type);
  });
});

// ── FsboListingPage — RealEstateListing ──────────────────────────────────────
describe("FsboListingPage — JSON-LD", () => {
  let FsboListingPage: React.ComponentType;
  beforeAll(async () => { FsboListingPage = (await import("@/pages/FsboListingPage")).default; });

  it("renders a JSON-LD script tag (loading state)", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/listing/1"]}>
          <Routes><Route path="/listing/:id" element={<FsboListingPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ldJson()).not.toBeNull();
  });

  it("has @type RealEstateListing", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/listing/1"]}>
          <Routes><Route path="/listing/:id" element={<FsboListingPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    const schema = ldJson();
    expect(schema?.["@type"]).toBe("RealEstateListing");
  });
});

// ── ContractorPublicPage — LocalBusiness ─────────────────────────────────────
describe("ContractorPublicPage — JSON-LD", () => {
  let ContractorPublicPage: React.ComponentType;
  beforeAll(async () => { ContractorPublicPage = (await import("@/pages/ContractorPublicPage")).default; });

  it("renders a JSON-LD script tag", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/contractor/abc"]}>
          <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ldJson()).not.toBeNull();
  });

  it("has @type LocalBusiness or Person", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/contractor/abc"]}>
          <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    const schema = ldJson();
    expect(["LocalBusiness", "Person"]).toContain(schema?.["@type"]);
  });
});

// ── AgentPublicPage — Person ──────────────────────────────────────────────────
describe("AgentPublicPage — JSON-LD", () => {
  let AgentPublicPage: React.ComponentType;
  beforeAll(async () => { AgentPublicPage = (await import("@/pages/AgentPublicPage")).default; });

  it("renders a JSON-LD script tag", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/agent/xyz"]}>
          <Routes><Route path="/agent/:id" element={<AgentPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ldJson()).not.toBeNull();
  });

  it("has @type Person or RealEstateAgent", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/agent/xyz"]}>
          <Routes><Route path="/agent/:id" element={<AgentPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    const schema = ldJson();
    expect(["Person", "RealEstateAgent"]).toContain(schema?.["@type"]);
  });
});

// ── ScoreCertPage — CreativeWork ──────────────────────────────────────────────
describe("ScoreCertPage — JSON-LD", () => {
  let ScoreCertPage: React.ComponentType;
  beforeAll(async () => { ScoreCertPage = (await import("@/pages/ScoreCertPage")).default; });

  it("renders a JSON-LD script tag", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/cert/tok"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ldJson()).not.toBeNull();
  });

  it("has @type CreativeWork", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/cert/tok"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    const schema = ldJson();
    expect(schema?.["@type"]).toBe("CreativeWork");
  });
});
