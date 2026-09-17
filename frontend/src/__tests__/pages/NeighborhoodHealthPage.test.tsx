/**
 * NeighborhoodHealthPage — real logic worth locking down:
 *   - loading -> no-data (fetch failure) -> loaded states
 *   - trend direction drives the icon color and message text
 *     (up/down/stable, with down using Math.abs on a negative changePoints)
 *   - the bucket containing the median score is highlighted darker
 *   - score summary and maintenance category list render the raw stats
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NeighborhoodHealthPage from "@/pages/NeighborhoodHealthPage";
import type { ZipCodeStats } from "@/services/neighborhood";

const { mockGetZipStats } = vi.hoisted(() => ({ mockGetZipStats: vi.fn() }));
vi.mock("@/services/neighborhood", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/neighborhood")>();
  return { ...actual, neighborhoodService: { getZipStats: mockGetZipStats } };
});

function makeStats(overrides: Partial<ZipCodeStats> = {}): ZipCodeStats {
  return {
    zipCode: "78701", sampleCount: 42, averageScore: 74, medianScore: 76,
    percentileBuckets: [
      { label: "0–20", range: [0, 20], count: 2, pct: 4.8 },
      { label: "20–40", range: [20, 40], count: 5, pct: 11.9 },
      { label: "40–60", range: [40, 60], count: 10, pct: 23.8 },
      { label: "60–80", range: [60, 80], count: 20, pct: 47.6 },
      { label: "80–100", range: [80, 100], count: 5, pct: 11.9 },
    ],
    topMaintenanceSystems: ["HVAC", "Roofing", "Plumbing"],
    trend: { direction: "stable", changePoints: 0 },
    generatedAt: Date.now(),
    ...overrides,
  };
}

function renderAt(zipCode: string) {
  return render(
    <MemoryRouter initialEntries={[`/neighborhood/${zipCode}`]}>
      <Routes>
        <Route path="/neighborhood/:zipCode" element={<NeighborhoodHealthPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("NeighborhoodHealthPage — loading and empty states", () => {
  it("shows the no-data message when the fetch fails", async () => {
    mockGetZipStats.mockRejectedValue(new Error("not found"));
    renderAt("78701");
    await waitFor(() => expect(screen.getByText("No data available for this zip code.")).toBeInTheDocument());
  });

  it("shows the loaded stats once the fetch resolves", async () => {
    mockGetZipStats.mockResolvedValue(makeStats());
    renderAt("78701");
    await waitFor(() => expect(screen.getByText("Average Score")).toBeInTheDocument());
  });
});

describe("NeighborhoodHealthPage — trend messaging", () => {
  it("shows the up-trend message for an improving average", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ trend: { direction: "up", changePoints: 3 } }));
    renderAt("78701");
    await waitFor(() => expect(screen.getByText("↑ Avg score up 3 pts this year")).toBeInTheDocument());
  });

  it("shows the down-trend message with an absolute-value point count", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ trend: { direction: "down", changePoints: -4 } }));
    renderAt("78701");
    await waitFor(() => expect(screen.getByText("↓ Avg score down 4 pts this year")).toBeInTheDocument());
  });

  it("shows the stable message when the direction is stable", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ trend: { direction: "stable", changePoints: 0 } }));
    renderAt("78701");
    await waitFor(() => expect(screen.getByText("Avg score stable this year")).toBeInTheDocument());
  });
});

describe("NeighborhoodHealthPage — score summary and distribution", () => {
  it("renders average, median, and sample count", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ averageScore: 74, medianScore: 76, sampleCount: 42 }));
    renderAt("78701");

    await waitFor(() => expect(screen.getByText("74")).toBeInTheDocument());
    expect(screen.getByText("76")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("highlights only the bucket containing the median score", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ medianScore: 76 })); // falls in the 60-80 bucket
    const { container } = renderAt("78701");

    await waitFor(() => expect(screen.getByText("60–80")).toBeInTheDocument());

    const bars = Array.from(container.querySelectorAll('div[style*="border-radius: 4px"][style*="width:"]'));
    const highlighted = bars.filter((el) => (el as HTMLElement).style.background === "rgb(11, 13, 26)");
    expect(highlighted).toHaveLength(1);
  });

  it("numbers the top maintenance categories in order", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ topMaintenanceSystems: ["HVAC", "Roofing", "Plumbing"] }));
    renderAt("78701");

    await waitFor(() => expect(screen.getByText("HVAC")).toBeInTheDocument());
    expect(screen.getByText("1.")).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();
    expect(screen.getByText("3.")).toBeInTheDocument();
  });
});
