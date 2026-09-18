/**
 * HomeSystemsEstimatorPage — real logic worth locking down (against the
 * real systemAgeEstimator service, not mocks — it's pure and exactly
 * what this page is testing):
 *   - shows the input form when the URL has no yearBuilt param, and the
 *     "Estimate My Systems" link is disabled until a year is entered
 *   - a valid yearBuilt param renders results computed by the real
 *     estimateSystems(), including the correct summary line for
 *     whichever urgency mix that year actually produces
 *   - Copy writes the share URL and flips to "Copied!" temporarily
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import HomeSystemsEstimatorPage from "@/pages/HomeSystemsEstimatorPage";
import { estimateSystems } from "@/services/systemAgeEstimator";

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><HomeSystemsEstimatorPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  document.execCommand = vi.fn();
});

describe("HomeSystemsEstimatorPage — input form", () => {
  it("shows the form when no yearBuilt param is present", () => {
    renderAt("/home-systems");
    expect(screen.getByText("Home System Age Estimator")).toBeInTheDocument();
  });

  it("disables the Estimate link until a year is entered, and links to buildEstimatorUrl", () => {
    renderAt("/home-systems");
    const link = screen.getByText("Estimate My Systems →");
    expect(link).toHaveStyle({ pointerEvents: "none" });

    fireEvent.change(screen.getByPlaceholderText(String(new Date().getFullYear() - 20)), { target: { value: "1998" } });
    expect(link).toHaveStyle({ pointerEvents: "auto" });
    expect(link).toHaveAttribute("href", "/home-systems?yearBuilt=1998&type=single-family");
  });

  it("falls back to the form for an invalid yearBuilt param", () => {
    renderAt("/home-systems?yearBuilt=abc");
    expect(screen.getByText("Home System Age Estimator")).toBeInTheDocument();
  });
});

describe("HomeSystemsEstimatorPage — results", () => {
  it("renders the real per-system estimates for a valid yearBuilt", () => {
    renderAt("/home-systems?yearBuilt=1980&type=single-family");
    const expected = estimateSystems(1980, undefined);

    expect(screen.getByText("Systems for a 1980 Home")).toBeInTheDocument();
    expect(screen.getByText(expected[0].systemName)).toBeInTheDocument();
    expect(screen.getAllByText(expected[0].urgency, { selector: 'div[role="status"]' }).length).toBeGreaterThan(0);
  });

  it("shows the critical-systems summary line when the year produces critical systems", () => {
    // 1960 is old enough that most systems (HVAC, water heater, roof) are well past typical lifespan
    renderAt("/home-systems?yearBuilt=1960&type=single-family");
    const expected = estimateSystems(1960, undefined);
    const criticalCount = expected.filter((e) => e.urgency === "Critical").length;
    expect(criticalCount).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`${criticalCount} system.* past expected lifespan`))).toBeInTheDocument();
  });

  it("shows the all-good summary line for a recently built home", () => {
    const thisYear = new Date().getFullYear();
    renderAt(`/home-systems?yearBuilt=${thisYear}&type=single-family`);
    expect(screen.getByText(/All systems within expected lifespan\./)).toBeInTheDocument();
  });
});

describe("HomeSystemsEstimatorPage — share/copy", () => {
  it("copies the share URL and shows Copied! temporarily", () => {
    vi.useFakeTimers();
    try {
      renderAt("/home-systems?yearBuilt=1998&type=single-family");
      fireEvent.click(screen.getByLabelText("copy share url"));

      expect(document.execCommand).toHaveBeenCalledWith("copy");
      expect(screen.getByLabelText("copied")).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(2000); });
      expect(screen.getByLabelText("copy share url")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
