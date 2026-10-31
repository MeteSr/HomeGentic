/**
 * Epic 15.3: Report branding.
 *
 * The report canister doesn't record the owner's plan, so every shared report
 * carries the same "Generated with HomeGentic" line: no Free banner or upgrade
 * prompt, and no Pro badge the data can't back.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Base snapshot & link factories ───────────────────────────────────────────

const NOW = Date.now();

function makeSnapshot(): any {
  return {
    snapshotId:        "SNAP_T",
    propertyId:        "99",
    generatedBy:       "owner",
    address:           "200 Pine Rd",
    city:              "Portland",
    state:             "OR",
    zipCode:           "97201",
    propertyType:      "SingleFamily",
    yearBuilt:         2005,
    squareFeet:        1800,
    verificationLevel: "Basic",
    jobs:              [],
    recurringServices: [],
    rooms:             [],
    totalAmountCents:  0,
    verifiedJobCount:  0,
    diyJobCount:       0,
    permitCount:       0,
    generatedAt:       NOW,
  };
}

function makeLink(expiresAt: number | null = null): any {
  return {
    token:      "tok-tier",
    snapshotId: "SNAP_T",
    propertyId: "99",
    createdBy:  "owner",
    createdAt:  NOW - 86_400_000,
    expiresAt,
    visibility: "Public",
    viewCount:  0,
    isActive:   true,
  };
}

// ─── Report service mock ──────────────────────────────────────────────────────

vi.mock("@/services/report", () => ({
  reportService: {
    getReport: vi.fn().mockImplementation(() =>
      Promise.resolve({ link: makeLink(null), snapshot: makeSnapshot() })
    ),
    shareUrl:    vi.fn().mockReturnValue("https://example.com/r/tok"),
    expiryLabel: vi.fn().mockReturnValue(null),
  },
  disclosureFromParams: vi.fn().mockReturnValue({
    hideAmounts: false, hideContractors: false, hidePermits: false, hideDescriptions: false,
  }),
}));

vi.mock("@/services/agentProfile", () => ({
  agentProfileService: { fromParams: vi.fn().mockReturnValue(null) },
}));

vi.mock("@/services/scoreService", () => ({
  premiumEstimate: vi.fn().mockReturnValue(null),
  getScoreGrade:   vi.fn().mockReturnValue("GOOD"),
  scoreFromReportJobs: vi.fn().mockReturnValue(72),
}));

// ─── Render helper ─────────────────────────────────────────────────────────────

import ReportPage from "@/pages/ReportPage";
import { reportService } from "@/services/report";

async function renderReport() {
  vi.mocked(reportService.getReport).mockResolvedValue({
    link:     makeLink(null),
    snapshot: makeSnapshot(),
  } as any);

  const { unmount } = render(
    <MemoryRouter initialEntries={["/report/tok-tier"]}>
      <Routes>
        <Route path="/report/:token" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>
  );

  // Wait for the report to load (exits loading state)
  await screen.findByText("200 Pine Rd");
  return { unmount };
}

// ─── 15.3: attribution line ──────────────────────────────────────────────────

describe("ReportPage — attribution (15.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Generated with HomeGentic'", async () => {
    await renderReport();
    expect(screen.getByText(/^generated with homegentic$/i)).toBeInTheDocument();
  });

  it("doesn't claim a plan: no Free banner, upgrade prompt or Pro badge", async () => {
    await renderReport();
    expect(screen.queryByText(/homegentic free/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/remove this banner/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/homegentic pro subscription/i)).not.toBeInTheDocument();
  });
});
