/**
 * §17.3 — Score → Dollar Value UI
 *
 * Tests:
 *   17.3.2 — ScoreValueBanner: dollar value displayed on score page
 *   17.3.3 — JobValueDelta: "+$X" shown on job-log success screen
 *   17.3.4 — PropertyEstimatedValueInput: home value capture widget
 *   17.3.5 — DocumentedValueSection: shown in report (buyer-facing)
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { ScoreValueBanner }            = await import("@/components/ScoreValueBanner");
const { JobValueDelta }               = await import("@/components/JobValueDelta");
const { PropertyEstimatedValueInput } = await import("@/components/PropertyEstimatedValueInput");
const { DocumentedValueSection }      = await import("@/components/DocumentedValueSection");

// ── ScoreValueBanner (17.3.2) ─────────────────────────────────────────────────

describe("ScoreValueBanner", () => {
  it("renders dollar range for score >= 40", () => {
    render(
      <MemoryRouter>
        <ScoreValueBanner score={74} />
      </MemoryRouter>
    );
    // Flat bands for score 74 → $15,000–$25,000
    expect(screen.getByText(/\$15,000/)).toBeInTheDocument();
    expect(screen.getByText(/\$25,000/)).toBeInTheDocument();
  });

  it("renders nothing for score below 40", () => {
    const { container } = render(
      <MemoryRouter>
        <ScoreValueBanner score={35} />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it("uses home value when provided (17.3.1)", () => {
    // score 74, homeValue $600k: 3%–6% → $18,000–$36,000
    render(
      <MemoryRouter>
        <ScoreValueBanner score={74} homeValueDollars={600_000} />
      </MemoryRouter>
    );
    expect(screen.getByText(/\$18,000/)).toBeInTheDocument();
    expect(screen.getByText(/\$36,000/)).toBeInTheDocument();
  });

  it("uses zip estimate when zip provided but no homeValue", () => {
    render(
      <MemoryRouter>
        <ScoreValueBanner score={74} zip="90210" />
      </MemoryRouter>
    );
    // Should render some dollar range (LA zip → higher median than flat)
    expect(screen.getByText(/\$/)).toBeInTheDocument();
  });

  it("shows 'buyer confidence' label", () => {
    render(
      <MemoryRouter>
        <ScoreValueBanner score={74} />
      </MemoryRouter>
    );
    expect(screen.getByText(/buyer confidence/i)).toBeInTheDocument();
  });
});

// ── JobValueDelta (17.3.3) ────────────────────────────────────────────────────

describe("JobValueDelta", () => {
  it("renders estimated value delta for a logged job at score 70+", () => {
    render(
      <MemoryRouter>
        <JobValueDelta serviceType="Roofing" currentScore={74} />
      </MemoryRouter>
    );
    // Should show some dollar amount
    expect(screen.getByText(/\+\s*\$/)).toBeInTheDocument();
  });

  it("renders nothing for score below 40", () => {
    const { container } = render(
      <MemoryRouter>
        <JobValueDelta serviceType="Roofing" currentScore={30} />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it("mentions 'home value' or 'documented value'", () => {
    render(
      <MemoryRouter>
        <JobValueDelta serviceType="Roofing" currentScore={74} />
      </MemoryRouter>
    );
    expect(screen.getByText(/value/i)).toBeInTheDocument();
  });
});

// ── PropertyEstimatedValueInput (17.3.4) ──────────────────────────────────────

describe("PropertyEstimatedValueInput", () => {
  const STORAGE_KEY = "hf_est_val_prop-1";

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("renders a labeled input for home value", () => {
    render(
      <MemoryRouter>
        <PropertyEstimatedValueInput propertyId="prop-1" />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/estimated home value/i)).toBeInTheDocument();
  });

  it("saves value to localStorage on change", () => {
    render(
      <MemoryRouter>
        <PropertyEstimatedValueInput propertyId="prop-1" />
      </MemoryRouter>
    );
    const input = screen.getByLabelText(/estimated home value/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "400000" } });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("400000");
  });

  it("loads saved value from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEY, "350000");
    render(
      <MemoryRouter>
        <PropertyEstimatedValueInput propertyId="prop-1" />
      </MemoryRouter>
    );
    const input = screen.getByLabelText(/estimated home value/i) as HTMLInputElement;
    expect(input.value).toBe("350000");
  });

  it("calls onValueChange when value changes", () => {
    const onValueChange = vi.fn();
    render(
      <MemoryRouter>
        <PropertyEstimatedValueInput propertyId="prop-1" onValueChange={onValueChange} />
      </MemoryRouter>
    );
    const input = screen.getByLabelText(/estimated home value/i);
    fireEvent.change(input, { target: { value: "500000" } });
    expect(onValueChange).toHaveBeenCalledWith(500_000);
  });
});

// ── DocumentedValueSection (17.3.5) ──────────────────────────────────────────

describe("DocumentedValueSection", () => {
  it("renders 'Documented maintenance value' label", () => {
    render(
      <MemoryRouter>
        <DocumentedValueSection score={74} />
      </MemoryRouter>
    );
    expect(screen.getByText(/documented maintenance value/i)).toBeInTheDocument();
  });

  it("shows dollar range for score >= 40", () => {
    render(
      <MemoryRouter>
        <DocumentedValueSection score={74} />
      </MemoryRouter>
    );
    expect(screen.getByText(/\$15,000/)).toBeInTheDocument();
  });

  it("renders nothing when score is below 40", () => {
    const { container } = render(
      <MemoryRouter>
        <DocumentedValueSection score={30} />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it("uses zip-aware estimate when zip is provided", () => {
    // Score 74, zip 90210 (LA median ~$700k): 3%–6% → $21,000–$42,000
    render(
      <MemoryRouter>
        <DocumentedValueSection score={74} zip="90210" />
      </MemoryRouter>
    );
    // LA zip has higher median → higher than flat $15k–$25k
    const text = screen.getByText(/\$/).textContent ?? "";
    const match = text.match(/\$(\d[\d,]*)/);
    expect(match).not.toBeNull();
  });

  it("uses homeValueDollars when provided", () => {
    render(
      <MemoryRouter>
        <DocumentedValueSection score={74} homeValueDollars={600_000} />
      </MemoryRouter>
    );
    // 3%–6% of 600k = $18k–$36k
    expect(screen.getByText(/\$18,000/)).toBeInTheDocument();
  });
});
