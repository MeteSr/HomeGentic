/**
 * NeighborhoodBenchmark — real logic worth locking down:
 *   - renders nothing with a blank zipCode, or before stats resolve
 *   - the rank label and bar color follow the real percentile
 *     thresholds (computed via the real getPercentileRank helper, with
 *     the service mocked to return a single-bucket distribution where
 *     percentile === score, for deterministic assertions)
 *   - the trend label reflects up/down/stable direction and magnitude
 *   - View area navigates to the zip's neighborhood detail route
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { NeighborhoodBenchmark } from "@/components/NeighborhoodBenchmark";
import type { ZipCodeStats } from "@/services/neighborhood";

const { mockGetZipStats } = vi.hoisted(() => ({ mockGetZipStats: vi.fn() }));
vi.mock("@/services/neighborhood", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/neighborhood")>();
  return { ...actual, neighborhoodService: { getZipStats: mockGetZipStats } };
});

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeStats(overrides: Partial<ZipCodeStats> = {}): ZipCodeStats {
  return {
    zipCode: "78701", sampleCount: 100, averageScore: 60, medianScore: 60,
    // single bucket spanning the whole range with count === sampleCount
    // makes getPercentileRank(score, stats) === score exactly
    percentileBuckets: [{ label: "0-100", range: [0, 100], count: 100, pct: 100 }],
    topMaintenanceSystems: [],
    trend: { direction: "stable", changePoints: 0 },
    generatedAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe("NeighborhoodBenchmark — visibility", () => {
  it("renders nothing with a blank zipCode", () => {
    const { container } = render(<NeighborhoodBenchmark zipCode="" score={80} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockGetZipStats).not.toHaveBeenCalled();
  });

  it("renders nothing before stats resolve", () => {
    mockGetZipStats.mockReturnValue(new Promise(() => {}));
    const { container } = render(<NeighborhoodBenchmark zipCode="78701" score={80} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("NeighborhoodBenchmark — rank label thresholds", () => {
  it("shows Top 10% for a percentile of 95", async () => {
    mockGetZipStats.mockResolvedValue(makeStats());
    render(<NeighborhoodBenchmark zipCode="78701" score={95} />);
    expect(await screen.findByText("Top 10% in your zip")).toBeInTheDocument();
  });

  it("shows Top 25% for a percentile of 80", async () => {
    mockGetZipStats.mockResolvedValue(makeStats());
    render(<NeighborhoodBenchmark zipCode="78701" score={80} />);
    expect(await screen.findByText("Top 25% in 78701")).toBeInTheDocument();
  });

  it("shows Above average for a percentile of 60", async () => {
    mockGetZipStats.mockResolvedValue(makeStats());
    render(<NeighborhoodBenchmark zipCode="78701" score={60} />);
    expect(await screen.findByText("Above average in 78701")).toBeInTheDocument();
  });

  it("shows Average range for a percentile of 30", async () => {
    mockGetZipStats.mockResolvedValue(makeStats());
    render(<NeighborhoodBenchmark zipCode="78701" score={30} />);
    expect(await screen.findByText("Average range in 78701")).toBeInTheDocument();
  });

  it("shows Below average for a percentile of 10", async () => {
    mockGetZipStats.mockResolvedValue(makeStats());
    render(<NeighborhoodBenchmark zipCode="78701" score={10} />);
    expect(await screen.findByText("Below average in 78701")).toBeInTheDocument();
  });
});

describe("NeighborhoodBenchmark — trend label", () => {
  it("formats an upward trend", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ trend: { direction: "up", changePoints: 4 } }));
    render(<NeighborhoodBenchmark zipCode="78701" score={50} />);
    expect(await screen.findByText("↑ Avg score up 4 pts this year")).toBeInTheDocument();
  });

  it("formats a downward trend using the absolute value", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ trend: { direction: "down", changePoints: -3 } }));
    render(<NeighborhoodBenchmark zipCode="78701" score={50} />);
    expect(await screen.findByText("↓ Avg score down 3 pts this year")).toBeInTheDocument();
  });

  it("formats a stable trend", async () => {
    mockGetZipStats.mockResolvedValue(makeStats({ trend: { direction: "stable", changePoints: 0 } }));
    render(<NeighborhoodBenchmark zipCode="78701" score={50} />);
    expect(await screen.findByText("Avg score stable this year")).toBeInTheDocument();
  });
});

describe("NeighborhoodBenchmark — navigation", () => {
  it("navigates to the zip's neighborhood detail route", async () => {
    mockGetZipStats.mockResolvedValue(makeStats());
    render(<NeighborhoodBenchmark zipCode="78701" score={50} />);
    fireEvent.click(await screen.findByText("View area →"));
    expect(mockNavigate).toHaveBeenCalledWith("/neighborhood/78701");
  });
});
