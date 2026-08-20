/**
 * MOB.2 — LandingPage mobile polish
 *
 * Updated for the cobalt/yellow redesign: inline-style nav replaces
 * hfl-* CSS classes; no hamburger (full nav visible at all widths).
 */
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import LandingPage from "@/pages/LandingPage";

function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe("LandingPage — branding", () => {
  it("nav logo text content is HomeGentic", () => {
    renderLanding();
    // New design uses inline styles — find by text content
    expect(screen.getAllByText(/HomeGentic/i).length).toBeGreaterThan(0);
  });

  it("nav logo text content does not say HomeFax", () => {
    renderLanding();
    expect(screen.queryByText(/homefax/i)).toBeNull();
  });
});

describe("LandingPage — key sections render", () => {
  it("renders the hero headline", () => {
    renderLanding();
    const h1 = document.querySelector("h1");
    expect(h1).not.toBeNull();
  });

  it("renders the primary CTA button", () => {
    renderLanding();
    const btns = screen.getAllByRole("button");
    expect(btns.length).toBeGreaterThan(0);
  });

  it("renders the pricing section", () => {
    const { container } = renderLanding();
    // Section ID changed from hfl-pricing-section to hg-pricing in redesign
    const pricingSection = container.querySelector("#hg-pricing");
    expect(pricingSection).not.toBeNull();
  });
});

describe("LandingPage — CSS and animations", () => {
  it("injects a keyframe style block for animations", () => {
    const { container } = renderLanding();
    // New design uses @keyframes instead of hfl-* utility classes
    const style =
      container.querySelector("style") ??
      Array.from(document.querySelectorAll("style")).find(
        (s) => s.textContent?.includes("@keyframes")
      );
    expect(style).not.toBeNull();
    expect(style?.textContent).toMatch(/@keyframes/);
  });
});
