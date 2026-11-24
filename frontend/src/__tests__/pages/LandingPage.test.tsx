/**
 * LandingPage — mostly static marketing content; the real interactive
 * logic worth locking down is the DualSignatureSection demo:
 *   - status progresses IN PROGRESS -> SIGNED -> VERIFIED as steps advance
 *     to signAt/sealAt for the active path
 *   - toggling "without the contractor signature" flips a sealed record
 *     from VERIFIED to UNVERIFIED
 *   - switching the path tab resets step and the skip-contractor toggle
 *   - nav/CTA buttons navigate to the expected routes
 */

import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(<MemoryRouter><LandingPage /></MemoryRouter>);
}

// The status badge shares text ("VERIFIED") with static demo content
// elsewhere on the page, so scope queries to the job-card container that
// also holds the always-present "Water heater replacement" title.
function statusCard() {
  return screen.getByText("Water heater replacement").closest("div")!.parentElement!.parentElement!;
}

beforeEach(() => {
  vi.clearAllMocks();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("LandingPage — dual signature demo", () => {
  it("starts at IN PROGRESS and advances to SIGNED then VERIFIED as steps advance", () => {
    renderPage();
    expect(within(statusCard()).getByText("IN PROGRESS")).toBeInTheDocument();

    // Path 0 ("Requested in HomeGentic") has 5 steps: signAt=3, sealAt=4
    fireEvent.click(screen.getByText("Next step →")); // step 1
    fireEvent.click(screen.getByText("Next step →")); // step 2
    fireEvent.click(screen.getByText("Next step →")); // step 3 -> signed
    expect(within(statusCard()).getByText("SIGNED")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Next step →")); // step 4 -> sealed
    expect(within(statusCard()).getByText("VERIFIED")).toBeInTheDocument();
  });

  it("flips VERIFIED to UNVERIFIED when the contractor signature is toggled off", () => {
    renderPage();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText("Next step →"));
    expect(within(statusCard()).getByText("VERIFIED")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show it without the contractor signature"));
    expect(within(statusCard()).getByText("UNVERIFIED")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show it with the contractor signature"));
    expect(within(statusCard()).getByText("VERIFIED")).toBeInTheDocument();
  });

  it("switching the path tab resets to step 0 (IN PROGRESS)", () => {
    renderPage();
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText("Next step →"));
    expect(within(statusCard()).getByText("VERIFIED")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Work already done"));
    expect(within(statusCard()).getByText("IN PROGRESS")).toBeInTheDocument();
  });
});

// Crawlers follow only real links, so every way off the page is an <a href>.
describe("LandingPage — navigation", () => {
  const link = (name: string | RegExp, i = 0) => screen.getAllByRole("link", { name })[i];

  it.each([
    ["Start free", "/login"],
    ["Log in", "/login"],
    ["Start your record", "/login"],
    ["Get started", "/login"],
    ["Contractors", "/for-pros"],
    ["For contractors", "/for-pros"],
    ["See a sample report", "/sample-report"],
    ["Talk to us", "/support"],
    ["Try Demo", "/demo"],
    ["Privacy", "/privacy"],
    ["Terms", "/terms"],
    ["Contact", "/support"],
  ])("'%s' is a link to %s", (name, href) => {
    renderPage();
    expect(link(name)).toHaveAttribute("href", href);
  });

  it("every plan card's button is a sign-up link", () => {
    renderPage();
    const pricing = document.getElementById("hg-pricing")!;
    const links = within(pricing).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a).toHaveAttribute("href", "/login");
  });

  it("chooses the Homeowner role for the register page when a sign-up link is clicked", () => {
    sessionStorage.clear();
    renderPage();
    fireEvent.click(link("Start free"));
    expect(sessionStorage.getItem("signupRole")).toBe("Homeowner");
  });

  it("in-page links point at their section and scroll to it smoothly", () => {
    renderPage();
    const pricing = link("Pricing");
    expect(pricing).toHaveAttribute("href", "#hg-pricing");
    expect(link("The record")).toHaveAttribute("href", "#hg-how");
    expect(link("The score")).toHaveAttribute("href", "#hg-score");
    fireEvent.click(pricing);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("leaves no navigation on onClick-only buttons", () => {
    renderPage();
    fireEvent.click(link("Contractors"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("LandingPage — footer", () => {
  // The footer used to say "Nashville, TN", left over from the mockup. The
  // company is HomeGentic, Inc. (a Florida corporation, per the Terms) and
  // has no office in Nashville, so the footer names no city.
  it("shows the legal name and current year, and no made-up location", () => {
    renderPage();
    const year = new Date().getFullYear();
    expect(screen.getByText(`© ${year} HomeGentic, Inc.`)).toBeInTheDocument();
    expect(screen.queryByText(/Nashville/)).not.toBeInTheDocument();
  });
});
