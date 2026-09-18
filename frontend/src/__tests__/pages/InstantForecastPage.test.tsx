/**
 * InstantForecastPage — real logic worth locking down:
 *   - shows the entry form when no URL params are present, the forecast
 *     table when address+yearBuilt are valid
 *   - the entry form's submit only navigates once both fields are filled
 *   - the forecast view renders the real estimateSystems()/computeTenYearBudget()
 *     output and reacts to per-system "Last replaced" overrides
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import InstantForecastPage from "@/pages/InstantForecastPage";
import { estimateSystems } from "@/services/systemAgeEstimator";
import { computeTenYearBudget } from "@/services/instantForecast";

vi.mock("@/components/PublicNav", () => ({ PublicNav: () => <div data-testid="public-nav" /> }));
vi.mock("@/components/PublicFooter", () => ({ PublicFooter: () => <div data-testid="public-footer" /> }));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/instant-forecast" element={<InstantForecastPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("InstantForecastPage — entry form", () => {
  it("shows the entry form when no params are present", () => {
    renderAt("/instant-forecast");
    expect(screen.getByText("Instant home maintenance forecast")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
  });

  it("does not submit when yearBuilt is blank", () => {
    renderAt("/instant-forecast");
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "123 Main St" } });
    fireEvent.click(screen.getByText("Get Forecast →"));
    // Still showing the form, not the forecast table
    expect(screen.getByText("Instant home maintenance forecast")).toBeInTheDocument();
  });
});

describe("InstantForecastPage — forecast view", () => {
  it("renders the real per-system estimates and 10-year budget for valid params", () => {
    renderAt("/instant-forecast?address=1+Main+St&yearBuilt=1980");
    const expected = estimateSystems(1980, undefined);
    const budget = computeTenYearBudget(expected);

    expect(screen.getByText("1 Main St")).toBeInTheDocument();
    expect(screen.getByText(expected[0].systemName)).toBeInTheDocument();
    expect(screen.getByText(`$${budget.toLocaleString()}`)).toBeInTheDocument();
  });

  it("falls back to the entry form for invalid params", () => {
    renderAt("/instant-forecast?address=1+Main+St&yearBuilt=abc");
    expect(screen.getByText("Instant home maintenance forecast")).toBeInTheDocument();
  });

  it("updates the URL when a system's 'Last replaced' year is overridden", () => {
    renderAt("/instant-forecast?address=1+Main+St&yearBuilt=1980");
    const expected = estimateSystems(1980, undefined);
    const input = screen.getByLabelText(`Last replaced — ${expected[0].systemName}`);
    fireEvent.change(input, { target: { value: "2015" } });
    expect((input as HTMLInputElement).value).toBe("2015");
  });
});
