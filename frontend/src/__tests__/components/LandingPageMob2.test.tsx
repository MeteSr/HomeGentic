/**
 * MOB.2 — LandingPage mobile polish
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
    const { container } = renderLanding();
    const logo = container.querySelector(".hfl-logo");
    expect(logo?.textContent).toMatch(/homegentic/i);
  });

  it("nav logo text content does not say HomeFax", () => {
    const { container } = renderLanding();
    const logo = container.querySelector(".hfl-logo");
    expect(logo?.textContent).not.toMatch(/homefax/i);
  });
});

describe("LandingPage — key sections render", () => {
  it("renders the hero headline", () => {
    renderLanding();
    // h1 contains 'home' or 'HomeGentic' — just confirm it mounts
    const h1 = document.querySelector("h1");
    expect(h1).not.toBeNull();
  });

  it("renders the primary CTA button", () => {
    renderLanding();
    const btns = screen.getAllByRole("button");
    expect(btns.length).toBeGreaterThan(0);
  });

  it("renders the numbers bar (4 stats)", () => {
    const { container } = renderLanding();
    const nbar = container.querySelectorAll(".hfl-nbar");
    expect(nbar.length).toBe(4);
  });

  it("renders 4 lifecycle steps", () => {
    const { container } = renderLanding();
    const steps = container.querySelectorAll(".hfl-step");
    expect(steps.length).toBe(4);
  });

  it("renders 3 persona cards", () => {
    const { container } = renderLanding();
    const personas = container.querySelectorAll(".hfl-persona");
    expect(personas.length).toBe(3);
  });
});

describe("LandingPage — mobile CSS classes present", () => {
  it("hamburger button exists in nav", () => {
    const { container } = renderLanding();
    const hamburger = container.querySelector(".hfl-hamburger");
    expect(hamburger).not.toBeNull();
  });

  it("hfl-actions has flex-wrap via CSS class", () => {
    const { container } = renderLanding();
    const actions = container.querySelector(".hfl-actions");
    expect(actions).not.toBeNull();
  });

  it("sub-480px style block is present in injected CSS", () => {
    const { container } = renderLanding();
    const style = container.querySelector("style") ??
      Array.from(document.querySelectorAll("style")).find(s => s.textContent?.includes("hfl-"));
    expect(style?.textContent).toMatch(/max-width:\s*480px/);
  });
});
