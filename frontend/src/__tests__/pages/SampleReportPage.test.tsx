/**
 * SampleReportPage — mostly static mock content; the real logic worth
 * locking down is the derived computation over the hardcoded JOBS array:
 *   - verifiedJobs count and totalValue only include status === "VERIFIED"
 *     jobs, with their dollar costs summed correctly
 *   - nav CTAs navigate to the expected routes
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SampleReportPage from "@/pages/SampleReportPage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderPage() {
  return render(<MemoryRouter><SampleReportPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe("SampleReportPage — derived stats", () => {
  it("counts only VERIFIED jobs and sums their dollar costs correctly", () => {
    renderPage();
    // 6 of the 8 JOBS are VERIFIED: 14200+380+3850+1200+180+650 = 20,460
    expect(screen.getByText("6 Verified Jobs")).toBeInTheDocument();
    expect(screen.getByText(/8 records · \$20,460 in verified work/)).toBeInTheDocument();
  });

  it("renders a card for every job and every room", () => {
    renderPage();
    expect(screen.getByText("Roof Replacement")).toBeInTheDocument();
    expect(screen.getByText("Water Softener Installation")).toBeInTheDocument();
    expect(screen.getByText("4 rooms documented")).toBeInTheDocument();
  });
});

describe("SampleReportPage — navigation", () => {
  it("navigates to /login when 'Create yours' is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Create yours"));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("navigates to / when the logo is clicked", () => {
    renderPage();
    fireEvent.click(screen.getByText("Gentic"));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("navigates to /pricing from the bottom CTA", () => {
    renderPage();
    fireEvent.click(screen.getByText("See pricing"));
    expect(mockNavigate).toHaveBeenCalledWith("/pricing");
  });
});
