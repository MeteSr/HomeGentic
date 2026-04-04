/**
 * §17.1 — Pre-quote price benchmarking UI
 *
 * Tests:
 *   17.1.3 — PriceBenchmarkWidget renders inline on quote request page
 *   17.1.5 — Widget hidden when sampleSize < 5
 *   17.1.4 — PriceLookupPage renders at /prices?service=...&zip=...
 */

import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import * as priceBenchmark from "@/services/priceBenchmark";

// ── lazy import to avoid module resolution issues ─────────────────────────────
const { PriceBenchmarkWidget } = await import("@/components/PriceBenchmarkWidget");
const PriceLookupPage = (await import("@/pages/PriceLookupPage")).default;

const MOCK_RESULT: priceBenchmark.PriceBenchmarkResult = {
  serviceType: "Roofing",
  zipCode:     "32114",
  low:         800000,
  median:      1400000,
  high:        2200000,
  sampleSize:  23,
  lastUpdated: "2025-11",
};

// ── PriceBenchmarkWidget ──────────────────────────────────────────────────────

describe("PriceBenchmarkWidget", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders the benchmark range when data is available", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce(MOCK_RESULT);

    await act(async () => {
      render(
        <MemoryRouter>
          <PriceBenchmarkWidget serviceType="Roofing" zipCode="32114" />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/\$8,000/)).toBeInTheDocument();
      expect(screen.getByText(/\$22,000/)).toBeInTheDocument();
    });
  });

  it("shows the zip code in the label", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce(MOCK_RESULT);

    await act(async () => {
      render(
        <MemoryRouter>
          <PriceBenchmarkWidget serviceType="Roofing" zipCode="32114" />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/32114/)).toBeInTheDocument();
    });
  });

  it("shows sample size and last updated when sufficient", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce(MOCK_RESULT);

    await act(async () => {
      render(
        <MemoryRouter>
          <PriceBenchmarkWidget serviceType="Roofing" zipCode="32114" />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/23/)).toBeInTheDocument();
    });
  });

  it("hides the widget when sampleSize is below 5 (17.1.5)", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce({
      ...MOCK_RESULT,
      sampleSize: 3,
    });

    await act(async () => {
      render(
        <MemoryRouter>
          <PriceBenchmarkWidget serviceType="Roofing" zipCode="32114" />
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.queryByText(/\$8,000/)).not.toBeInTheDocument();
    });
  });

  it("renders nothing when getPriceBenchmark returns null", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce(null);

    await act(async () => {
      render(
        <MemoryRouter>
          <PriceBenchmarkWidget serviceType="Roofing" zipCode="32114" />
        </MemoryRouter>
      );
    });

    // Widget should not render any price text
    await waitFor(() => {
      expect(screen.queryByText(/Typical cost in/)).not.toBeInTheDocument();
    });
  });

  it("renders nothing when zipCode is not provided", async () => {
    const spy = vi.spyOn(priceBenchmark, "getPriceBenchmark");

    render(
      <MemoryRouter>
        <PriceBenchmarkWidget serviceType="Roofing" zipCode="" />
      </MemoryRouter>
    );

    expect(spy).not.toHaveBeenCalled();
    expect(screen.queryByText(/Typical cost in/)).not.toBeInTheDocument();
  });
});

// ── PriceLookupPage ───────────────────────────────────────────────────────────

describe("PriceLookupPage", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("renders a search form when no query params are provided", () => {
    render(
      <MemoryRouter initialEntries={["/prices"]}>
        <Routes>
          <Route path="/prices" element={<PriceLookupPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByLabelText(/service type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zip code/i)).toBeInTheDocument();
  });

  it("displays benchmark result when service and zip params are present", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce(MOCK_RESULT);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/prices?service=Roofing&zip=32114"]}>
          <Routes>
            <Route path="/prices" element={<PriceLookupPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/\$8,000/)).toBeInTheDocument();
    });
  });

  it("shows heading with service type on result page (17.1.4)", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce(MOCK_RESULT);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/prices?service=Roofing&zip=32114"]}>
          <Routes>
            <Route path="/prices" element={<PriceLookupPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Roofing/);
    });
  });

  it("shows 'not enough data' message when sampleSize < 5 (17.1.5)", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce({
      ...MOCK_RESULT,
      sampleSize: 2,
    });

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/prices?service=Roofing&zip=32114"]}>
          <Routes>
            <Route path="/prices" element={<PriceLookupPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/not enough data/i)).toBeInTheDocument();
    });
  });

  it("shows 'no data available' message when fetch returns null", async () => {
    vi.spyOn(priceBenchmark, "getPriceBenchmark").mockResolvedValueOnce(null);

    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/prices?service=Roofing&zip=00000"]}>
          <Routes>
            <Route path="/prices" element={<PriceLookupPage />} />
          </Routes>
        </MemoryRouter>
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    });
  });
});
