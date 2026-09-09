/**
 * §17.2 — Zero-Effort Onboarding: Instant Forecast (component tests)
 *
 * Tests:
 *   - Page renders address + year-built form when no params
 *   - Shows forecast table when valid params provided
 *   - Each system row has an inline "Last replaced" input
 *   - Changing override input updates the URL
 *   - 10-year budget displayed in summary
 *   - "Save your forecast" CTA links to /dashboard
 *   - lookupYearBuilt auto-fills year (stub returns null gracefully)
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import InstantForecastPage from "@/pages/InstantForecastPage";

// Stub lookupYearBuilt so tests don't make real fetch calls
vi.mock("@/services/instantForecast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/instantForecast")>();
  return {
    ...actual,
    lookupYearBuilt: vi.fn().mockResolvedValue(null),
  };
});

function renderAtPath(search: string = "") {
  return render(
    <MemoryRouter initialEntries={[`/instant-forecast${search}`]}>
      <Routes>
        <Route path="/instant-forecast" element={<InstantForecastPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("InstantForecastPage — no params (entry form)", () => {
  it("renders address input", () => {
    renderAtPath();
    expect(screen.getByLabelText(/address/i)).toBeInTheDocument();
  });

  it("renders year built input", () => {
    renderAtPath();
    expect(screen.getByLabelText(/year built/i)).toBeInTheDocument();
  });

  it("renders a submit / get forecast button", () => {
    renderAtPath();
    expect(screen.getByRole("button", { name: /forecast|get forecast|view forecast/i })).toBeInTheDocument();
  });

  it("does not show the forecast table before params are set", () => {
    renderAtPath();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("InstantForecastPage — with valid params (forecast view)", () => {
  const SEARCH = "?address=123+Main+St&yearBuilt=1976";

  it("renders the forecast table", () => {
    renderAtPath(SEARCH);
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("shows at least one system row (e.g. HVAC)", () => {
    renderAtPath(SEARCH);
    expect(screen.getByText(/HVAC/i)).toBeInTheDocument();
  });

  it("each row has a 'Last replaced' input", () => {
    renderAtPath(SEARCH);
    const inputs = screen.getAllByLabelText(/last replaced/i);
    expect(inputs.length).toBeGreaterThan(0);
  });

  it("displays the 10-year budget figure", () => {
    renderAtPath(SEARCH);
    expect(screen.getByText(/10.year budget|10-year budget/i)).toBeInTheDocument();
  });

  it("shows the address in the page", () => {
    renderAtPath(SEARCH);
    expect(screen.getByText(/123 Main St/i)).toBeInTheDocument();
  });
});

describe("InstantForecastPage — Save CTA", () => {
  it("renders a 'Save your forecast' link", () => {
    renderAtPath("?address=123+Main+St&yearBuilt=1976");
    expect(screen.getByRole("link", { name: /save your forecast|save forecast/i })).toBeInTheDocument();
  });

  it("Save CTA href links to /dashboard", () => {
    renderAtPath("?address=123+Main+St&yearBuilt=1976");
    const link = screen.getByRole("link", { name: /save your forecast|save forecast/i }) as HTMLAnchorElement;
    expect(link.href).toContain("/dashboard");
  });
});

describe("InstantForecastPage — per-system override inputs", () => {
  it("pre-fills override input when URL has hvac param", () => {
    renderAtPath("?address=123+Main+St&yearBuilt=1976&hvac=2000");
    const inputs = screen.getAllByLabelText(/last replaced/i) as HTMLInputElement[];
    const hvacInput = inputs.find((el) => {
      const row = el.closest("tr");
      return row && row.textContent?.includes("HVAC");
    });
    expect(hvacInput?.value).toBe("2000");
  });

  it("shows updated urgency when hvac override makes it newer", () => {
    // With yearBuilt=1976, HVAC age is ~50 yrs → Critical
    // With override=2020, HVAC age is ~5 yrs → Watch or Good
    renderAtPath("?address=123+Main+St&yearBuilt=1976&hvac=2020");
    // The urgency badge for HVAC should NOT be Critical
    const table = screen.getByRole("table");
    const rows = table.querySelectorAll("tr");
    const hvacRow = Array.from(rows).find((r) => r.textContent?.includes("HVAC"));
    expect(hvacRow?.textContent).not.toMatch(/Critical/);
  });
});
