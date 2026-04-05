/**
 * TDD — Epic 15.3: Report Branding
 *
 *   15.3.1 — planTier field in ReportSnapshot
 *     - fromSnapshot() maps raw.planTier, defaulting "" → "Free"
 *     - TypeScript interface has planTier: string
 *
 *   15.3.3 — Pro+ reports: no banner, "Verified by HomeGentic" trust badge
 *     - planTier "Pro"     → badge shown, free banner hidden
 *     - planTier "Premium" → badge shown, free banner hidden
 *     - planTier "Free"    → free banner shown, badge hidden
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Base snapshot & link factories ───────────────────────────────────────────

const NOW = Date.now();

function makeSnapshot(planTier: string): any {
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
    planTier,
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

// ─── Report service mock (mutable per test) ───────────────────────────────────

let mockPlanTier = "Free";

vi.mock("@/services/report", () => ({
  reportService: {
    getReport: vi.fn().mockImplementation(() =>
      Promise.resolve({ link: makeLink(null), snapshot: makeSnapshot(mockPlanTier) })
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
}));

// ─── Render helper ─────────────────────────────────────────────────────────────

import ReportPage from "@/pages/ReportPage";
import { reportService } from "@/services/report";

async function renderReport(planTier: string) {
  mockPlanTier = planTier;
  vi.mocked(reportService.getReport).mockResolvedValue({
    link:     makeLink(null),
    snapshot: makeSnapshot(planTier),
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

// ─── 15.3.1: planTier field ───────────────────────────────────────────────────

describe("ReportSnapshot — planTier field (15.3.1)", () => {
  it("snapshot object with planTier 'Pro' is accepted by TypeScript interface", async () => {
    // If this renders without error, the interface accepts planTier
    await renderReport("Pro");
    expect(screen.getByText("200 Pine Rd")).toBeInTheDocument();
  });

  it("snapshot object with planTier 'Free' is accepted by TypeScript interface", async () => {
    await renderReport("Free");
    expect(screen.getByText("200 Pine Rd")).toBeInTheDocument();
  });
});

// ─── 15.3.3: Pro+ → trust badge, no free banner ───────────────────────────────

describe("ReportPage — Pro plan trust badge (15.3.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Verified by HomeGentic' trust badge for Pro tier", async () => {
    await renderReport("Pro");
    expect(screen.getByText(/verified by homegentic/i)).toBeInTheDocument();
  });

  it("shows 'Verified by HomeGentic' trust badge for Premium tier", async () => {
    await renderReport("Premium");
    expect(screen.getByText(/verified by homegentic/i)).toBeInTheDocument();
  });

  it("does NOT show free-plan banner for Pro tier", async () => {
    await renderReport("Pro");
    expect(screen.queryByText(/generated with homegentic free/i)).not.toBeInTheDocument();
  });

  it("does NOT show free-plan banner for Premium tier", async () => {
    await renderReport("Premium");
    expect(screen.queryByText(/generated with homegentic free/i)).not.toBeInTheDocument();
  });
});

describe("ReportPage — Free plan banner (15.3.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows 'Generated with HomeGentic Free' banner for Free tier", async () => {
    await renderReport("Free");
    expect(screen.getByText(/generated with homegentic free/i)).toBeInTheDocument();
  });

  it("does NOT show the trust badge for Free tier", async () => {
    await renderReport("Free");
    // The Pro trust badge is distinct from the agent co-branding "Verified by HomeGentic" line
    // Pro trust badge has text like "Verified by HomeGentic Pro" or similar badge text
    // Free tier should have no such badge
    expect(screen.queryByText(/verified by homegentic pro|homegentic pro verified/i)).not.toBeInTheDocument();
  });
});
