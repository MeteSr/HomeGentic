/**
 * SEO.3 — og:image for key pages
 *
 * Every public page must set meta[property="og:image"].
 * The fallback is /og-default.png (1200×630 brand image).
 * public/og-default.png must exist.
 */
import { render } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import React from "react";
import { existsSync } from "fs";
import { resolve } from "path";

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

function ogImage(): string {
  return (document.querySelector('meta[property="og:image"]') as HTMLMetaElement)?.content ?? "";
}

function wrap(el: React.ReactElement, path = "/") {
  return <HelmetProvider><MemoryRouter initialEntries={[path]}>{el}</MemoryRouter></HelmetProvider>;
}

// ── public/og-default.png exists ─────────────────────────────────────────────
describe("og-default.png asset", () => {
  it("public/og-default.png exists", () => {
    const p = resolve(__dirname, "../../../public/og-default.png");
    expect(existsSync(p)).toBe(true);
  });
});

// ── Page og:image tags ────────────────────────────────────────────────────────
describe("LandingPage — og:image", () => {
  let LandingPage: React.ComponentType;
  beforeAll(async () => { LandingPage = (await import("@/pages/LandingPage")).default; });

  it("sets og:image", () => {
    render(wrap(<LandingPage />));
    expect(ogImage()).toMatch(/og-default\.png/);
  });
});

describe("InstantForecastPage — og:image", () => {
  let InstantForecastPage: React.ComponentType;
  beforeAll(async () => { InstantForecastPage = (await import("@/pages/InstantForecastPage")).default; });

  it("sets og:image", () => {
    render(wrap(<InstantForecastPage />));
    expect(ogImage()).toMatch(/og-default\.png/);
  });
});

describe("CheckAddressPage — og:image", () => {
  let CheckAddressPage: React.ComponentType;
  beforeAll(async () => { CheckAddressPage = (await import("@/pages/CheckAddressPage")).default; });

  it("sets og:image", () => {
    render(wrap(<CheckAddressPage />));
    expect(ogImage()).toMatch(/og-default\.png/);
  });
});

describe("FsboListingPage — og:image", () => {
  let FsboListingPage: React.ComponentType;
  beforeAll(async () => { FsboListingPage = (await import("@/pages/FsboListingPage")).default; });

  it("sets og:image (loading state)", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/listing/1"]}>
          <Routes><Route path="/listing/:id" element={<FsboListingPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ogImage()).toMatch(/og-default\.png/);
  });
});

describe("ContractorPublicPage — og:image", () => {
  let ContractorPublicPage: React.ComponentType;
  beforeAll(async () => { ContractorPublicPage = (await import("@/pages/ContractorPublicPage")).default; });

  it("sets og:image", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/contractor/abc"]}>
          <Routes><Route path="/contractor/:id" element={<ContractorPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ogImage()).toMatch(/og-default\.png/);
  });
});

describe("AgentPublicPage — og:image", () => {
  let AgentPublicPage: React.ComponentType;
  beforeAll(async () => { AgentPublicPage = (await import("@/pages/AgentPublicPage")).default; });

  it("sets og:image", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/agent/xyz"]}>
          <Routes><Route path="/agent/:id" element={<AgentPublicPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ogImage()).toMatch(/og-default\.png/);
  });
});

describe("ScoreCertPage — og:image", () => {
  let ScoreCertPage: React.ComponentType;
  beforeAll(async () => { ScoreCertPage = (await import("@/pages/ScoreCertPage")).default; });

  it("sets og:image", () => {
    render(
      <HelmetProvider>
        <MemoryRouter initialEntries={["/cert/tok"]}>
          <Routes><Route path="/cert/:token" element={<ScoreCertPage />} /></Routes>
        </MemoryRouter>
      </HelmetProvider>
    );
    expect(ogImage()).toMatch(/og-default\.png/);
  });
});
