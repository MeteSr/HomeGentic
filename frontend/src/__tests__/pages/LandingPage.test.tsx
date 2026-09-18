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

describe("LandingPage — navigation", () => {
  it("navigates to /login when 'Start free' is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Start free"));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("navigates to /for-pros when the Contractors nav link is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Contractors"));
    expect(mockNavigate).toHaveBeenCalledWith("/for-pros");
  });

  it("navigates to /sample-report from the hero CTA", () => {
    renderPage();
    fireEvent.click(screen.getAllByText("See a sample report")[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/sample-report");
  });
});
