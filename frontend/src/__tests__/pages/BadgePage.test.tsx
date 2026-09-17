/**
 * BadgePage — real logic worth locking down:
 *   - loading -> error state (missing token, or a rejected getReport)
 *   - the composite score formula: verified jobs (capped 40) + spend tier
 *     (capped 20) + verification-level bonus + distinct service types
 *     (capped 20)
 *   - embed mode (?embed=1) renders only the badge card, no page chrome
 *   - full mode shows the report link and the HTML embed snippet
 *   - copy-to-clipboard shows "Copied!" feedback
 *   - expiry label reflects the share link's expiresAt
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
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

describe("BadgePage — score formula", () => {
  it("computes the composite score from verified jobs, spend, verification level, and service variety", async () => {
    mockGetReport.mockResolvedValue({
      link: makeLink(),
      snapshot: makeSnapshot({
        verifiedJobCount: 5,             // min(5*4, 40) = 20
        totalAmountCents: 500_000,       // $5000 -> floor(5000/2500) = 2
        verificationLevel: "Premium",    // +10
        jobs: [
          makeJob({ serviceType: "HVAC" }),
          makeJob({ serviceType: "Roofing" }),
          makeJob({ serviceType: "Plumbing" }),
        ], // 3 distinct -> min(3*4, 20) = 12
      }),
    });
    renderAt("/badge/tok-1");

    // 20 + 2 + 10 + 12 = 44
    await waitFor(() => expect(screen.getByText("44")).toBeInTheDocument());
  });

  it("caps each term independently rather than the sum exceeding each cap", async () => {
    mockGetReport.mockResolvedValue({
      link: makeLink(),
      snapshot: makeSnapshot({
        verifiedJobCount: 50,            // capped at 40
        totalAmountCents: 100_000_000,   // capped at 20
        verificationLevel: "Premium",    // +10
        jobs: Array.from({ length: 10 }, (_, i) => makeJob({ serviceType: `Type${i}` })), // capped at 20
      }),
    });
    renderAt("/badge/tok-1");

    // 40 + 20 + 10 + 20 = 90
    await waitFor(() => expect(screen.getByText("90")).toBeInTheDocument());
  });

  it("gives a smaller bonus for Basic verification than Premium", async () => {
    mockGetReport.mockResolvedValue({
      link: makeLink(),
      snapshot: makeSnapshot({ verificationLevel: "Basic", verifiedJobCount: 0, totalAmountCents: 0, jobs: [] }),
    });
    renderAt("/badge/tok-1");
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
  });

  it("gives no verification bonus for an unverified property", async () => {
    mockGetReport.mockResolvedValue({
      link: makeLink(),
      snapshot: makeSnapshot({ verificationLevel: "None", verifiedJobCount: 0, totalAmountCents: 0, jobs: [] }),
    });
    renderAt("/badge/tok-1");
    // "0" also appears for verified-jobs and total-records counts (empty jobs list)
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
