/**
 * ReportPage — real logic worth locking down:
 *   - error states are derived from the message thrown by getReport
 *     (expired/revoked/not found/generic error)
 *   - the "HomeGentic Certified" badge requires score >= 88 AND >= 3
 *     verified jobs AND >= 2 verified key systems
 *   - disclosure params (?ha=1 etc.) mask amounts/contractor names in job cards
 *   - the print-ready report renders address, stats, and job timeline
 */

import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ReportPage from "@/pages/ReportPage";
import type { ReportSnapshot, ShareLink, JobInput } from "@/services/report";

const { mockGetReport, mockExpiryLabel } = vi.hoisted(() => ({
  mockGetReport: vi.fn(),
  mockExpiryLabel: vi.fn(() => "Expires in 30 days"),
}));
vi.mock("@/services/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/report")>();
  return { ...actual, reportService: { getReport: mockGetReport, expiryLabel: mockExpiryLabel } };
});
vi.mock("@/components/DocumentedValueSection", () => ({ DocumentedValueSection: () => <div data-testid="value-section" /> }));

function makeJob(overrides: Partial<JobInput> = {}): JobInput {
  return {
    serviceType: "HVAC", description: "AC repair", contractorName: "Cool Air Co.",
    amountCents: 50000, date: "2024-06-01", isDiy: false, permitNumber: undefined,
    warrantyMonths: undefined, isVerified: true, status: "verified",
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    snapshotId: "snap-1", propertyId: "prop-1", generatedBy: "owner",
    address: "123 Main St", city: "Austin", state: "TX", zipCode: "78701",
    propertyType: "SingleFamily", yearBuilt: 2000, squareFeet: 2000,
    verificationLevel: "Unverified", jobs: [], recurringServices: [], rooms: [],
    totalAmountCents: 0, verifiedJobCount: 0, diyJobCount: 0, permitCount: 0,
    generatedAt: Date.now(), planTier: "Free",
    ...overrides,
  };
}

function makeLink(overrides: Partial<ShareLink> = {}): ShareLink {
  return {
    token: "tok-1", snapshotId: "snap-1", propertyId: "prop-1", createdBy: "owner",
    expiresAt: null, visibility: "Public", viewCount: 3, isActive: true, createdAt: Date.now(),
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/report/:token" element={<ReportPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("ReportPage — error states", () => {
  it("shows the expired state when getReport rejects with 'expired'", async () => {
    mockGetReport.mockRejectedValue(new Error("Link expired"));
    renderAt("/report/tok-1");
    expect(await screen.findByText("HomeGentic report expired")).toBeInTheDocument();
  });

  it("shows the revoked state when getReport rejects with 'revoked'", async () => {
    mockGetReport.mockRejectedValue(new Error("Link revoked"));
    renderAt("/report/tok-1");
    expect(await screen.findByText("Report link revoked")).toBeInTheDocument();
  });

  it("shows the not-found state for an unrecognized token error", async () => {
    mockGetReport.mockRejectedValue(new Error("Report not found"));
    renderAt("/report/tok-1");
    expect(await screen.findByText("Report not found")).toBeInTheDocument();
  });

  it("shows the generic error state with the thrown message otherwise", async () => {
    mockGetReport.mockRejectedValue(new Error("Something broke"));
    renderAt("/report/tok-1");
    expect(await screen.findByText("Unable to load report")).toBeInTheDocument();
    expect(screen.getByText("Something broke")).toBeInTheDocument();
  });
});

describe("ReportPage — loaded report", () => {
  it("renders address, stats, and job timeline", async () => {
    const snapshot = makeSnapshot({ jobs: [makeJob()], verifiedJobCount: 1, totalAmountCents: 50000 });
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot });
    renderAt("/report/tok-1");

    expect(await screen.findByText("123 Main St")).toBeInTheDocument();
    expect(screen.getByText("AC repair")).toBeInTheDocument();
  });

  it("shows the HomeGentic Certified badge when score >= 88, >= 3 verified jobs, and >= 2 key systems verified", async () => {
    const jobs = [
      makeJob({ serviceType: "HVAC", isVerified: true }),
      makeJob({ serviceType: "Roofing", isVerified: true }),
      makeJob({ serviceType: "Plumbing", isVerified: true }),
      makeJob({ serviceType: "Electrical", isVerified: true }),
      makeJob({ serviceType: "Windows", isVerified: true }),
    ];
    // verifiedJobCount 10 (capped at 40 pts) + totalAmountCents high enough for
    // the full 20 value pts + Premium's 10 + 5 distinct service types (capped
    // at 20 diversity pts) = 90, clearing the 88 certification threshold.
    const snapshot = makeSnapshot({
      jobs, verifiedJobCount: 10, totalAmountCents: 6_000_000, verificationLevel: "Premium",
    });
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot });
    renderAt("/report/tok-1");

    expect(await screen.findByText(/HomeGentic Certified/)).toBeInTheDocument();
  });

  it("does not show the Certified badge with too few verified jobs", async () => {
    const snapshot = makeSnapshot({ jobs: [makeJob()], verifiedJobCount: 1, verificationLevel: "Premium" });
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot });
    renderAt("/report/tok-1");

    await screen.findByText("123 Main St");
    expect(screen.queryByText(/HomeGentic Certified/)).not.toBeInTheDocument();
  });
});

describe("ReportPage — disclosure masking", () => {
  it("hides job amounts when ?ha=1 is set", async () => {
    const snapshot = makeSnapshot({ jobs: [makeJob({ amountCents: 99999 })], verifiedJobCount: 1 });
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot });
    renderAt("/report/tok-1?ha=1");

    await screen.findByText("123 Main St");
    expect(screen.queryByText("$999.99")).not.toBeInTheDocument();
    expect(screen.getByText(/selective view/)).toBeInTheDocument();
  });

  it("shows amounts normally without disclosure params", async () => {
    const snapshot = makeSnapshot({ jobs: [makeJob({ amountCents: 50000 })], verifiedJobCount: 1 });
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot });
    renderAt("/report/tok-1");

    expect(await screen.findByText("$500")).toBeInTheDocument();
  });
});
