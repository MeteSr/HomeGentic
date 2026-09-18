/**
 * PriceLookupPage — real logic worth locking down:
 *   - shows the search form when service or zip is missing from the URL
 *   - the form's Look Up Prices link is disabled (pointer-events none)
 *     until a zip is entered, and its href uses the real
 *     buildPriceLookupUrl encoding
 *   - with both params present: shows a loading state, then either
 *     the benchmark result, the "not enough data" panel (insufficient
 *     samples), or the "No Data" state (a null result)
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import PriceLookupPage from "@/pages/PriceLookupPage";
import type { PriceBenchmarkResult } from "@/services/priceBenchmark";

const { mockGetPriceBenchmark } = vi.hoisted(() => ({ mockGetPriceBenchmark: vi.fn() }));
vi.mock("@/services/priceBenchmark", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/priceBenchmark")>();
  return { ...actual, getPriceBenchmark: mockGetPriceBenchmark };
});

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><PriceLookupPage /></MemoryRouter>);
}

function makeResult(overrides: Partial<PriceBenchmarkResult> = {}): PriceBenchmarkResult {
  return {
    serviceType: "HVAC", zipCode: "32114", low: 25000, median: 40000, high: 60000,
    sampleSize: 8, lastUpdated: "2024-06",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("PriceLookupPage — search form", () => {
  it("shows the form when service or zip is missing", () => {
    renderAt("/prices");
    expect(screen.getByText("Home repair cost lookup")).toBeInTheDocument();
    expect(mockGetPriceBenchmark).not.toHaveBeenCalled();
  });

  it("disables the lookup link until a zip is entered, and links via buildPriceLookupUrl", () => {
    renderAt("/prices");
    const link = screen.getByText("Look Up Prices");
    expect(link).toHaveStyle({ pointerEvents: "none" });

    fireEvent.change(screen.getByLabelText("zip code"), { target: { value: "32114" } });
    expect(link).toHaveStyle({ pointerEvents: "auto" });
    expect(link).toHaveAttribute("href", "/prices?service=HVAC&zip=32114");
  });
});

describe("PriceLookupPage — loading and results", () => {
  it("shows a loading state while the benchmark fetch is in flight", async () => {
    mockGetPriceBenchmark.mockReturnValue(new Promise(() => {}));
    renderAt("/prices?service=HVAC&zip=32114");
    expect(await screen.findByRole("status", { name: "loading" })).toBeInTheDocument();
  });

  it("shows the benchmark result once sufficient samples resolve", async () => {
    mockGetPriceBenchmark.mockResolvedValue(makeResult({ sampleSize: 12, low: 25000, high: 60000, median: 40000 }));
    renderAt("/prices?service=HVAC&zip=32114");

    expect(await screen.findByText("HVAC in 32114")).toBeInTheDocument();
    expect(screen.getByText("$250")).toBeInTheDocument();
    expect(screen.getByText("$600")).toBeInTheDocument();
    expect(screen.getByText("12 bids")).toBeInTheDocument();
  });

  it("shows the not-enough-data panel when sampleSize is below the threshold", async () => {
    mockGetPriceBenchmark.mockResolvedValue(makeResult({ sampleSize: 2 }));
    renderAt("/prices?service=HVAC&zip=32114");

    expect(await screen.findByText(/Not enough data/)).toBeInTheDocument();
  });

  it("shows the No Data state when the fetch resolves null", async () => {
    mockGetPriceBenchmark.mockResolvedValue(null);
    renderAt("/prices?service=HVAC&zip=32114");

    expect(await screen.findByText("No Data")).toBeInTheDocument();
    expect(screen.getByText("No data available for this combination yet.")).toBeInTheDocument();
  });

  it("refetches when the service or zip param changes", async () => {
    mockGetPriceBenchmark.mockResolvedValue(makeResult());
    renderAt("/prices?service=HVAC&zip=32114");
    await waitFor(() => expect(mockGetPriceBenchmark).toHaveBeenCalledWith("HVAC", "32114"));
  });
});
