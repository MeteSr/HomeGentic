/**
 * ResaleReadyPage — real logic worth locking down:
 *   - verified-record stats (count, dollar total, unique service types)
 *     computed directly from job data, not the score service
 *   - the buyer-premium panel and the Certified badge only render when
 *     the score service says so (premiumEstimate truthy / isCertified)
 *   - Generate & Copy Link calls reportService.generateReport, copies the
 *     resulting URL, and relabels itself "Copy Again"
 *   - Copy Certificate Link calls certService.issueCert and copies the URL
 *   - both share buttons are disabled when there's no property yet
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ResaleReadyPage from "@/pages/ResaleReadyPage";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetMyProperties } = vi.hoisted(() => ({ mockGetMyProperties: vi.fn() }));
vi.mock("@/services/property", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/property")>();
  return { ...actual, propertyService: { getMyProperties: mockGetMyProperties } };
});

const { mockGetAllJobs } = vi.hoisted(() => ({ mockGetAllJobs: vi.fn() }));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { getAll: mockGetAllJobs } };
});

const { mockGenerateReport } = vi.hoisted(() => ({ mockGenerateReport: vi.fn() }));
vi.mock("@/services/report", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/report")>();
  return { ...actual, reportService: { generateReport: mockGenerateReport } };
});

const { mockIssueCert } = vi.hoisted(() => ({ mockIssueCert: vi.fn() }));
vi.mock("@/services/cert", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/cert")>();
  return { ...actual, certService: { issueCert: mockIssueCert } };
});

const {
  mockComputeScore, mockComputeBreakdown, mockGetScoreGrade, mockPremiumEstimate, mockIsCertified, mockLoadHistory,
} = vi.hoisted(() => ({
  mockComputeScore: vi.fn(),
  mockComputeBreakdown: vi.fn(),
  mockGetScoreGrade: vi.fn(),
  mockPremiumEstimate: vi.fn(),
  mockIsCertified: vi.fn(),
  mockLoadHistory: vi.fn(),
}));
vi.mock("@/services/scoreService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/scoreService")>();
  return {
    ...actual,
    computeScore: mockComputeScore,
    computeBreakdown: mockComputeBreakdown,
    getScoreGrade: mockGetScoreGrade,
    premiumEstimate: mockPremiumEstimate,
    isCertified: mockIsCertified,
    loadHistory: mockLoadHistory,
  };
});

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { success: mockToastSuccess, error: mockToastError } }));

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "HVAC",
    amount: 100_000, date: "2024-06-01", description: "", isDiy: false,
    status: "verified" as any, verified: true, homeownerSigned: true, contractorSigned: true,
    photos: [], createdAt: Date.now(),
    ...overrides,
  } as Job;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ResaleReadyPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetMyProperties.mockResolvedValue([makeProperty()]);
  mockGetAllJobs.mockResolvedValue([]);
  mockComputeScore.mockReturnValue(80);
  mockComputeBreakdown.mockReturnValue({});
  mockGetScoreGrade.mockReturnValue("Great");
  mockPremiumEstimate.mockReturnValue(null);
  mockIsCertified.mockReturnValue(false);
  mockLoadHistory.mockReturnValue([]);
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe("ResaleReadyPage — record stats", () => {
  it("counts verified records, total value, and unique service types from job data", async () => {
    mockGetAllJobs.mockResolvedValue([
      makeJob({ id: "j1", serviceType: "HVAC", amount: 100_000, status: "verified" as any }),
      makeJob({ id: "j2", serviceType: "Roofing", amount: 200_000, status: "verified" as any }),
      makeJob({ id: "j3", serviceType: "HVAC", amount: 50_000, status: "pending" as any }), // not verified
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText("Verified Records")).toBeInTheDocument());
    expect(screen.getByText("Verified Records").previousElementSibling).toHaveTextContent("blockchain-signed");
    expect(screen.getByText("Verified Records").parentElement).toHaveTextContent("2");
    // total value across ALL jobs (350000 cents), not just verified ones
    expect(screen.getByText("Value Documented").parentElement).toHaveTextContent("$3,500");
    expect(screen.getByText(/2 verified records\. \$3,500 documented\./)).toBeInTheDocument();
  });

  it("shows the score-gain note only when history has at least two snapshots", async () => {
    mockComputeScore.mockReturnValue(85);
    mockLoadHistory.mockReturnValue([{ score: 70, at: 1 }, { score: 85, at: 2 }] as any);
    renderPage();

    await waitFor(() => expect(screen.getByText(/Score up \+15 pts since you joined\./)).toBeInTheDocument());
  });

  it("omits the score-gain note with fewer than two history snapshots", async () => {
    mockLoadHistory.mockReturnValue([{ score: 70, at: 1 }] as any);
    renderPage();

    await waitFor(() => expect(screen.getByText(/documented\./)).toBeInTheDocument());
    expect(screen.queryByText(/pts since you joined/)).not.toBeInTheDocument();
  });
});

describe("ResaleReadyPage — conditional panels", () => {
  it("hides the buyer-premium panel when premiumEstimate returns null", async () => {
    mockPremiumEstimate.mockReturnValue(null);
    renderPage();
    await waitFor(() => expect(screen.getByText("Share Your Record")).toBeInTheDocument());
    expect(screen.queryByText("Estimated Buyer Premium")).not.toBeInTheDocument();
  });

  it("shows the buyer-premium panel with a low-high range", async () => {
    mockPremiumEstimate.mockReturnValue({ low: 5000, high: 12000 });
    renderPage();
    await waitFor(() => expect(screen.getByText("$5,000 – $12,000")).toBeInTheDocument());
  });

  it("hides the Certified badge when isCertified is false", async () => {
    mockIsCertified.mockReturnValue(false);
    renderPage();
    await waitFor(() => expect(screen.getByText("Share Your Record")).toBeInTheDocument());
    expect(screen.queryByText("HomeGentic Certified™")).not.toBeInTheDocument();
  });

  it("shows the Certified badge when isCertified is true", async () => {
    mockIsCertified.mockReturnValue(true);
    renderPage();
    await waitFor(() => expect(screen.getByText("HomeGentic Certified™")).toBeInTheDocument());
  });
});

describe("ResaleReadyPage — share actions", () => {
  it("generates a buyer report link, copies it, and relabels the button", async () => {
    mockGenerateReport.mockResolvedValue({ token: "tok-123" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Generate & Copy Link")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Generate & Copy Link"));

    await waitFor(() => expect(mockGenerateReport).toHaveBeenCalledWith(
      "prop-1", expect.any(Object), expect.any(Array), [], [], null, "Public"
    ));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/report/tok-123")
    ));
    expect(mockToastSuccess).toHaveBeenCalledWith("Buyer report link copied to clipboard!");
    await waitFor(() => expect(screen.getByText("Copy Again")).toBeInTheDocument());
  });

  it("shows an error toast when report generation fails", async () => {
    mockGenerateReport.mockRejectedValue(new Error("network error"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Generate & Copy Link")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Generate & Copy Link"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Could not generate share link"));
  });

  it("issues and copies a lender certificate link", async () => {
    mockIssueCert.mockResolvedValue({ certId: "cert-1", token: "cert-tok" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Copy Certificate Link")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Copy Certificate Link"));

    await waitFor(() => expect(mockIssueCert).toHaveBeenCalledWith("prop-1", expect.any(Object)));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("/cert/cert-tok")
    ));
    expect(mockToastSuccess).toHaveBeenCalledWith("Lender certificate link copied!");
  });

  it("disables both share buttons when there's no property", async () => {
    mockGetMyProperties.mockResolvedValue([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("Generate & Copy Link")).toBeInTheDocument());
    expect(screen.getByText("Generate & Copy Link").closest("button")).toBeDisabled();
    expect(screen.getByText("Copy Certificate Link").closest("button")).toBeDisabled();
  });
});
