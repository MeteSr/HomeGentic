/**
 * BadgePage — real logic worth locking down:
 *   - loading -> error state (missing token, or a rejected getReport)
 *   - the score: the one the canister stored with the report, else the
 *     shared formula over the snapshot's jobs
 *   - embed mode (?embed=1) renders only the badge card, no page chrome
 *   - full mode shows the report link and the HTML embed snippet
 *   - copy-to-clipboard shows "Copied!" feedback
 *   - expiry label reflects the share link's expiresAt
 */

import { scoreFromReportJobs } from "@/services/scoreService";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import BadgePage from "@/pages/BadgePage";
import type { ReportSnapshot, ShareLink, JobInput } from "@/services/report";

const { mockGetReport, mockExpiryLabel } = vi.hoisted(() => ({
  mockGetReport: vi.fn(),
  mockExpiryLabel: vi.fn(),
}));
vi.mock("@/services/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/report")>();
  return {
    ...actual,
    reportService: { getReport: mockGetReport, expiryLabel: mockExpiryLabel },
  };
});

function makeJob(overrides: Partial<JobInput> = {}): JobInput {
  return {
    serviceType: "HVAC", description: "", contractorName: undefined, amountCents: 100_000,
    date: "2024-01-01", isDiy: false, permitNumber: undefined, warrantyMonths: undefined,
    isVerified: true,
    ...overrides,
  } as JobInput;
}

function makeSnapshot(overrides: Partial<ReportSnapshot> = {}): ReportSnapshot {
  return {
    snapshotId: "snap-1", propertyId: "prop-1", generatedBy: "p-owner",
    address: "123 Main St", city: "Austin", state: "TX", zipCode: "78701",
    propertyType: "SingleFamily", yearBuilt: 2000, squareFeet: 2000,
    verificationLevel: "None", jobs: [], recurringServices: [], rooms: [],
    totalAmountCents: 0, verifiedJobCount: 0,
    ...overrides,
  } as ReportSnapshot;
}

function makeLink(overrides: Partial<ShareLink> = {}): ShareLink {
  return {
    token: "tok-1", snapshotId: "snap-1", propertyId: "prop-1", createdBy: "p-owner",
    expiresAt: null, visibility: "Public" as any, viewCount: 0, isActive: true, createdAt: Date.now(),
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/badge/:token" element={<BadgePage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockExpiryLabel.mockReturnValue("Never expires");
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
});

describe("BadgePage — loading and error states", () => {
  it("shows an error state when getReport rejects", async () => {
    mockGetReport.mockRejectedValue(new Error("This report link has expired"));
    renderAt("/badge/tok-1");
    await waitFor(() => expect(screen.getByText("Badge unavailable")).toBeInTheDocument());
    expect(screen.getByText("This report link has expired")).toBeInTheDocument();
  });

  it("shows a generic fallback message when the error has no text", async () => {
    mockGetReport.mockRejectedValue(new Error());
    renderAt("/badge/tok-1");
    await waitFor(() => expect(screen.getByText("This badge link is invalid or has expired.")).toBeInTheDocument());
  });
});

describe("BadgePage — score", () => {
  afterEach(() => { delete (window as any).__e2e_report_score; });

  it("shows the score the canister stored with the report", async () => {
    (window as any).__e2e_report_score = 77;
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot: makeSnapshot({ jobs: [makeJob({ serviceType: "HVAC" })] }) });
    renderAt("/badge/tok-1");
    await waitFor(() => expect(screen.getByText("77")).toBeInTheDocument());
  });

  it("falls back to the shared formula over the snapshot's jobs", async () => {
    (window as any).__e2e_report_score = null;
    const snapshot = makeSnapshot({
      jobs: [makeJob({ serviceType: "HVAC" }), makeJob({ serviceType: "Roofing" }), makeJob({ serviceType: "Plumbing" })],
    });
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot });
    renderAt("/badge/tok-1");
    const expected = scoreFromReportJobs(snapshot.jobs, Number(snapshot.yearBuilt));
    await waitFor(() => expect(screen.getByText(String(expected))).toBeInTheDocument());
  });

  it("shows 0 for a report with no jobs", async () => {
    (window as any).__e2e_report_score = null;
    mockGetReport.mockResolvedValue({
      link: makeLink(),
      snapshot: makeSnapshot({ verificationLevel: "None", verifiedJobCount: 0, totalAmountCents: 0, jobs: [] }),
    });
    renderAt("/badge/tok-1");
    await waitFor(() => expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(3));
  });
});

describe("BadgePage — embed mode", () => {
  it("renders only the badge card, without the page header or embed instructions", async () => {
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot: makeSnapshot({ address: "123 Main St" }) });
    renderAt("/badge/tok-1?embed=1");

    await waitFor(() => expect(screen.getByText("123 Main St")).toBeInTheDocument());
    expect(screen.queryByText("Embed on your listing")).not.toBeInTheDocument();
    expect(screen.queryByText("View Full HomeGentic Report")).not.toBeInTheDocument();
  });
});

describe("BadgePage — full mode", () => {
  it("shows the report link, embed snippet, and expiry label", async () => {
    mockGetReport.mockResolvedValue({ link: makeLink({ expiresAt: Date.now() + 1000 }), snapshot: makeSnapshot() });
    mockExpiryLabel.mockReturnValue("Expires in 30 days");
    renderAt("/badge/tok-1");

    await waitFor(() => expect(screen.getByText("View Full HomeGentic Report")).toBeInTheDocument());
    expect(screen.getByText(/Expires in 30 days/)).toBeInTheDocument();
    expect(screen.getByText(/<iframe src=/)).toBeInTheDocument();
  });

  it("copies the embed code and shows 'Copied!' feedback", async () => {
    mockGetReport.mockResolvedValue({ link: makeLink(), snapshot: makeSnapshot() });
    renderAt("/badge/tok-1");
    await waitFor(() => expect(screen.getByText("Copy")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Copy"));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("<iframe"));
    await waitFor(() => expect(screen.getByText("Copied!")).toBeInTheDocument());
  });
});
