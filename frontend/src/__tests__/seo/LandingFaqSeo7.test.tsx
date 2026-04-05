/**
 * SEO.7 — Landing page content depth
 *
 * A static FAQ section (server-renderable, no JS required) must be present
 * in LandingPage with at least 5 questions targeting high-intent queries.
 */
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
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

describe("LandingPage — FAQ section", () => {
  let LandingPage: React.ComponentType;
  beforeAll(async () => { LandingPage = (await import("@/pages/LandingPage")).default; });

  it("renders an element with data-faq attribute (FAQ section marker)", () => {
    const { container } = render(
      <HelmetProvider><MemoryRouter><LandingPage /></MemoryRouter></HelmetProvider>
    );
    const faq = container.querySelector("[data-faq]");
    expect(faq).not.toBeNull();
  });

  it("contains at least 5 FAQ question elements", () => {
    const { container } = render(
      <HelmetProvider><MemoryRouter><LandingPage /></MemoryRouter></HelmetProvider>
    );
    const questions = container.querySelectorAll("[data-faq-question]");
    expect(questions.length).toBeGreaterThanOrEqual(5);
  });

  it("contains at least 5 FAQ answer elements", () => {
    const { container } = render(
      <HelmetProvider><MemoryRouter><LandingPage /></MemoryRouter></HelmetProvider>
    );
    const answers = container.querySelectorAll("[data-faq-answer]");
    expect(answers.length).toBeGreaterThanOrEqual(5);
  });

  it("FAQ mentions home maintenance", () => {
    const { container } = render(
      <HelmetProvider><MemoryRouter><LandingPage /></MemoryRouter></HelmetProvider>
    );
    const faq = container.querySelector("[data-faq]");
    expect(faq?.textContent?.toLowerCase()).toMatch(/maintenance/);
  });

  it("FAQ mentions verified or verification", () => {
    const { container } = render(
      <HelmetProvider><MemoryRouter><LandingPage /></MemoryRouter></HelmetProvider>
    );
    const faq = container.querySelector("[data-faq]");
    expect(faq?.textContent?.toLowerCase()).toMatch(/verif/);
  });

  it("has JSON-LD FAQPage structured data", () => {
    render(
      <HelmetProvider><MemoryRouter><LandingPage /></MemoryRouter></HelmetProvider>
    );
    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    const faqSchema = scripts.find((s) => {
      try { return JSON.parse(s.innerHTML)?.["@type"] === "FAQPage"; } catch { return false; }
    });
    expect(faqSchema).not.toBeUndefined();
  });
});
