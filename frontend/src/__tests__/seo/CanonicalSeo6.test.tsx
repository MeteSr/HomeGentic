/**
 * SEO.6 — Canonical URLs
 *
 * Every public-facing page must set <link rel="canonical"> via Helmet
 * to prevent duplicate-content penalties across ICP gateway origins.
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

function canonical(): string {
  return (document.querySelector('link[rel="canonical"]') as HTMLLinkElement)?.href ?? "";
}

function wrap(el: React.ReactElement, path = "/") {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></HelmetProvider>;
}

const BASE = "https://homegentic.app";

describe("LandingPage — canonical", () => {
  let LandingPage: React.ComponentType;
  beforeAll(async () => { LandingPage = (await import("@/pages/LandingPage")).default; });

  it("sets canonical to homegentic.app/", () => {
    render(wrap(<LandingPage />));
    expect(canonical()).toContain(BASE);
  });
});

describe("InstantForecastPage — canonical", () => {
  let InstantForecastPage: React.ComponentType;
  beforeAll(async () => { InstantForecastPage = (await import("@/pages/InstantForecastPage")).default; });

  it("sets canonical containing /instant-forecast", () => {
    render(wrap(<InstantForecastPage />));
    expect(canonical()).toMatch(/instant-forecast/);
  });
});

describe("CheckAddressPage — canonical", () => {
  let CheckAddressPage: React.ComponentType;
  beforeAll(async () => { CheckAddressPage = (await import("@/pages/CheckAddressPage")).default; });

  it("sets canonical containing /check", () => {
    render(wrap(<CheckAddressPage />));
    expect(canonical()).toMatch(/check/);
  });
});

describe("FsboListingPage — canonical", () => {
  let FsboListingPage: React.ComponentType;
  beforeAll(async () => { FsboListingPage = (await import("@/pages/FsboListingPage")).default; });

  it("sets canonical containing /for-sale or homegentic.app", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/listing/1"]}>
          <Routes><Route path="/listing/:id" element={<FsboListingPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    const c = canonical();
    expect(c.includes(BASE) || c.includes("for-sale")).toBe(true);
  });
});

describe("ContractorPublicPage — canonical", () => {
  let ContractorPublicPage: React.ComponentType;
  beforeAll(async () => { ContractorPublicPage = (await import("@/pages/ContractorPublicPage")).default; });

  it("sets canonical containing homegentic.app", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/contractor/abc"]}>
          <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(canonical()).toContain(BASE);
  });
});

describe("AgentPublicPage — canonical", () => {
  let AgentPublicPage: React.ComponentType;
  beforeAll(async () => { AgentPublicPage = (await import("@/pages/AgentPublicPage")).default; });

  it("sets canonical containing homegentic.app", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/agent/xyz"]}>
          <Routes><Route path="/agent/:id" element={<AgentPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(canonical()).toContain(BASE);
  });
});

describe("ScoreCertPage — canonical", () => {
  let ScoreCertPage: React.ComponentType;
  beforeAll(async () => { ScoreCertPage = (await import("@/pages/ScoreCertPage")).default; });

  it("sets canonical containing homegentic.app", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/cert/tok"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(canonical()).toContain(BASE);
  });
});
