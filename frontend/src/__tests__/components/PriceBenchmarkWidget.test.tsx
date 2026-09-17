/**
 * PriceBenchmarkWidget — real logic worth locking down:
 *   - fetches nothing (renders nothing) with a blank serviceType/zipCode
 *   - hides itself when sampleSize < 5 (real hasSufficientSamples gate),
 *     even once the fetch resolves
 *   - once sufficient samples exist, shows the low/high range (cents to
 *     dollars, rounded), the median, sample size, and zip code
 *   - refetches when serviceType or zipCode changes
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PriceBenchmarkWidget } from "@/components/PriceBenchmarkWidget";
import type { PriceBenchmarkResult } from "@/services/priceBenchmark";

const { mockGetPriceBenchmark } = vi.hoisted(() => ({ mockGetPriceBenchmark: vi.fn() }));
vi.mock("@/services/priceBenchmark", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/priceBenchmark")>();
  return { ...actual, getPriceBenchmark: mockGetPriceBenchmark };
});

function makeResult(overrides: Partial<PriceBenchmarkResult> = {}): PriceBenchmarkResult {
  return {
    serviceType: "HVAC", zipCode: "78701", low: 25000, median: 40000, high: 60000,
    sampleSize: 8, lastUpdated: "2024-06",
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("PriceBenchmarkWidget — no query", () => {
  it("does not fetch or render with a blank serviceType or zipCode", () => {
    const { container } = render(<PriceBenchmarkWidget serviceType="" zipCode="78701" />);
    expect(mockGetPriceBenchmark).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PriceBenchmarkWidget — insufficient samples", () => {
  it("stays hidden once resolved with sampleSize < 5", async () => {
    mockGetPriceBenchmark.mockResolvedValue(makeResult({ sampleSize: 3 }));
    const { container } = render(<PriceBenchmarkWidget serviceType="HVAC" zipCode="78701" />);

    await waitFor(() => expect(mockGetPriceBenchmark).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("stays hidden when the fetch resolves null", async () => {
    mockGetPriceBenchmark.mockResolvedValue(null);
    const { container } = render(<PriceBenchmarkWidget serviceType="HVAC" zipCode="78701" />);

    await waitFor(() => expect(mockGetPriceBenchmark).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PriceBenchmarkWidget — sufficient samples", () => {
  it("shows the formatted range, median, sample size, and zip code", async () => {
    mockGetPriceBenchmark.mockResolvedValue(makeResult({ low: 25000, median: 40000, high: 60000, sampleSize: 12, zipCode: "78701" }));
    render(<PriceBenchmarkWidget serviceType="HVAC" zipCode="78701" />);

    expect(await screen.findByText("Typical cost in 78701")).toBeInTheDocument();
    expect(screen.getByText("$250")).toBeInTheDocument();
    expect(screen.getByText("$600")).toBeInTheDocument();
    expect(screen.getByText("median $400")).toBeInTheDocument();
    expect(screen.getByText(/Based on 12 closed bids/)).toBeInTheDocument();
  });
});

describe("PriceBenchmarkWidget — refetch on change", () => {
  it("refetches when serviceType or zipCode changes", async () => {
    mockGetPriceBenchmark.mockResolvedValue(makeResult());
    const { rerender } = render(<PriceBenchmarkWidget serviceType="HVAC" zipCode="78701" />);
    await waitFor(() => expect(mockGetPriceBenchmark).toHaveBeenCalledWith("HVAC", "78701"));

    rerender(<PriceBenchmarkWidget serviceType="Roofing" zipCode="78701" />);
    await waitFor(() => expect(mockGetPriceBenchmark).toHaveBeenCalledWith("Roofing", "78701"));
    expect(mockGetPriceBenchmark).toHaveBeenCalledTimes(2);
  });
});
