/**
 * TDD — Epic 15.2: Free-tier expiry messaging
 *
 *   15.2.2 — Warn in ReportPage when share link expires within 48 hours
 *   15.2.3 — Show expiry row in GenerateReportModal success screen
 *   15.2.4 — Expired free report shows upgrade prompt, not generic error
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// ─── Shared mock data ─────────────────────────────────────────────────────────

const NOW = Date.now();

const { mockShareLinkFresh } = vi.hoisted(() => ({
  mockShareLinkFresh: {
    token: "tok-new",
    snapshotId: "snap-2",
    propertyId: "42",
    createdBy: "owner",
    createdAt: Date.now(),
    expiresAt: Date.now() + 7 * 86_400_000,
    visibility: "Public" as const,
    viewCount: 0,
    isActive: true,
  },
}));

const baseSnapshot = {
  propertyId: "42",
  address: "123 Maple St",
  city: "Austin",
  state: "TX",
  zipCode: "78701",
  verificationLevel: "Basic" as const,
  jobs: [],
  verifiedJobCount: 0,
  totalAmountCents: 0,
  score: 72,
  createdAt: NOW,
};

function makeLink(expiresAt: number | null): any {
  return {
    token: "tok-abc",
    snapshotId: "snap-1",
    propertyId: "42",
    createdBy: "owner",
    createdAt: NOW - 5 * 86_400_000,   // created 5 days ago
    expiresAt,
    visibility: "Public",
    viewCount: 3,
    isActive: true,
  };
}

const mockProperty = {
  id: BigInt(42), address: "123 Maple St", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily" as const,
  yearBuilt: BigInt(1998), squareFeet: BigInt(2100),
  verificationLevel: "Basic" as const, tier: "Free" as const,
  owner: "owner", isActive: true, createdAt: BigInt(0), updatedAt: BigInt(0),
};

// ─── Report service mock (mutable per test) ───────────────────────────────────

let mockGetReportResult: (() => Promise<any>) = () =>
  Promise.resolve({ link: makeLink(NOW + 96 * 3600_000), snapshot: baseSnapshot });

vi.mock("@/services/report", () => ({
  reportService: {
    getReport:       vi.fn().mockImplementation(() => mockGetReportResult()),
    generateReport:  vi.fn().mockResolvedValue(mockShareLinkFresh),
    listShareLinks:  vi.fn().mockResolvedValue([]),
    revokeShareLink: vi.fn().mockResolvedValue(undefined),
    shareUrl:        vi.fn().mockReturnValue("https://example.com/report/tok-new"),
    expiryLabel:     vi.fn().mockReturnValue("Expires in 7 days"),
  },
  disclosureFromParams: vi.fn().mockReturnValue({
    hideAmounts: false, hideContractors: false,
    hidePermits: false, hideDescriptions: false,
  }),
  propertyToInput: vi.fn().mockReturnValue({}),
  jobToInput:      vi.fn().mockReturnValue({}),
  roomToInput:     vi.fn().mockReturnValue({}),
}));

vi.mock("@/services/agentProfile", () => ({
  agentProfileService: {
    load:        vi.fn().mockReturnValue(null),
    fromParams:  vi.fn().mockReturnValue(null),
    appendToUrl: vi.fn((url: string) => url),
  },
}));

vi.mock("@/services/scoreService", () => ({
  premiumEstimate: vi.fn().mockReturnValue({ low: 400_000, high: 440_000 }),
  getScoreGrade:   vi.fn().mockReturnValue("B"),
  computeScore:    vi.fn().mockReturnValue(72),
}));

vi.mock("@/services/job", () => ({
  jobService: { getByProperty: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/services/recurringService", () => ({
  recurringService: {
    getByProperty: vi.fn().mockResolvedValue([]),
    getVisitLogs:  vi.fn().mockResolvedValue([]),
    toSummary:     vi.fn().mockReturnValue({}),
  },
}));

vi.mock("@/services/room", () => ({
  roomService: { getRoomsByProperty: vi.fn().mockResolvedValue([]) },
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/notifications", () => ({
  notificationService: { create: vi.fn(), getAll: vi.fn().mockReturnValue([]) },
}));

let mockTier = "Free";
vi.mock("@/services/payment", () => ({
  paymentService: {
    getMySubscription: vi.fn().mockImplementation(() =>
      Promise.resolve({ tier: mockTier })
    ),
  },
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import ReportPage from "@/pages/ReportPage";
import { GenerateReportModal } from "@/components/GenerateReportModal";
import { reportService } from "@/services/report";
import { paymentService } from "@/services/payment";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderReport(token = "tok-abc") {
  return render(
    <MemoryRouter initialEntries={[`/report/${token}`]}>
      <Routes>
        <Route path="/report/:token" element={<ReportPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderModal() {
  return render(
    <MemoryRouter>
      <GenerateReportModal property={mockProperty} onClose={vi.fn()} />
    </MemoryRouter>
  );
}

async function clickGenerate() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /generate report link/i })).not.toBeDisabled()
  );
  fireEvent.click(screen.getByRole("button", { name: /generate report link/i }));
}

// ─── 15.2.2 — ReportPage: 48-hour expiry warning ─────────────────────────────

describe("ReportPage — 48-hour expiry warning (15.2.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows expiry warning when link expires within 24 hours", async () => {
    const soonLink = makeLink(NOW + 20 * 3600_000);   // 20h from now
    vi.mocked(reportService.getReport).mockResolvedValue({ link: soonLink, snapshot: baseSnapshot });
    renderReport();
    await waitFor(() =>
      expect(screen.getByText(/this report link expires/i)).toBeInTheDocument()
    );
  });

  it("expiry warning mentions upgrading to Pro", async () => {
    const soonLink = makeLink(NOW + 20 * 3600_000);
    vi.mocked(reportService.getReport).mockResolvedValue({ link: soonLink, snapshot: baseSnapshot });
    renderReport();
    // "Upgrade to Pro →" link is unique to the 48h banner (7-day banner says "Upgrade →")
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /upgrade to pro/i })).toBeInTheDocument()
    );
  });

  it("shows 'permanent link' in the expiry warning", async () => {
    const soonLink = makeLink(NOW + 20 * 3600_000);
    vi.mocked(reportService.getReport).mockResolvedValue({ link: soonLink, snapshot: baseSnapshot });
    renderReport();
    await waitFor(() =>
      expect(screen.getAllByText(/permanent link/i).length).toBeGreaterThan(0)
    );
  });

  it("does NOT show the 48h warning when link expires in 96 hours", async () => {
    const laterLink = makeLink(NOW + 96 * 3600_000);
    vi.mocked(reportService.getReport).mockResolvedValue({ link: laterLink, snapshot: baseSnapshot });
    renderReport();
    await waitFor(() => expect(screen.getByText(/123 Maple St/i)).toBeInTheDocument());
    expect(screen.queryByText(/this report link expires/i)).not.toBeInTheDocument();
  });

  it("does NOT show the 48h warning when link has no expiry (Pro)", async () => {
    const neverLink = makeLink(null);
    vi.mocked(reportService.getReport).mockResolvedValue({ link: neverLink, snapshot: baseSnapshot });
    renderReport();
    await waitFor(() => expect(screen.getByText(/123 Maple St/i)).toBeInTheDocument());
    expect(screen.queryByText(/this report link expires/i)).not.toBeInTheDocument();
  });
});

// ─── 15.2.3 — GenerateReportModal: success screen expiry row ─────────────────

describe("GenerateReportModal — success screen expiry row (15.2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(paymentService.getMySubscription).mockImplementation(() =>
      Promise.resolve({ tier: mockTier })
    );
  });

  it("free user sees amber expiry row after generating a link", async () => {
    mockTier = "Free";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Free" });
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(screen.getByText(/link ready to share/i)).toBeInTheDocument()
    );
    // The amber row specifically says "This link expires in 7 days"
    expect(screen.getByText(/this link expires in 7 days/i)).toBeInTheDocument();
  });

  it("free user sees 'Upgrade to Pro' link in the expiry row", async () => {
    mockTier = "Free";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Free" });
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(screen.getByText(/link ready to share/i)).toBeInTheDocument()
    );
    // There are multiple "Upgrade to Pro" links (expiry picker hint + amber row)
    expect(screen.getAllByRole("link", { name: /upgrade to pro/i }).length).toBeGreaterThanOrEqual(2);
  });

  it("Pro user sees 'this link never expires' confirmation row", async () => {
    mockTier = "Pro";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Pro" });
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(screen.getByText(/link ready to share/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/this link never expires/i)).toBeInTheDocument();
  });

  it("Premium user also sees 'this link never expires'", async () => {
    mockTier = "Premium";
    vi.mocked(paymentService.getMySubscription).mockResolvedValue({ tier: "Premium" });
    renderModal();
    await clickGenerate();
    await waitFor(() =>
      expect(screen.getByText(/link ready to share/i)).toBeInTheDocument()
    );
    expect(screen.getByText(/this link never expires/i)).toBeInTheDocument();
  });
});

// ─── 15.2.4 — ReportPage: expired link shows upgrade prompt ──────────────────

describe("ReportPage — expired link upgrade prompt (15.2.4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("expired link shows the 'upgrade to Pro' message", async () => {
    vi.mocked(reportService.getReport).mockRejectedValue(new Error("expired"));
    renderReport();
    await waitFor(() =>
      expect(screen.getByText(/upgrade to pro/i)).toBeInTheDocument()
    );
  });

  it("expired link mentions 'permanent link'", async () => {
    vi.mocked(reportService.getReport).mockRejectedValue(new Error("expired"));
    renderReport();
    await waitFor(() =>
      expect(screen.getByText(/permanent link/i)).toBeInTheDocument()
    );
  });

  it("expired link still shows a title about the report being expired", async () => {
    vi.mocked(reportService.getReport).mockRejectedValue(new Error("expired"));
    renderReport();
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /report.*expired|expired.*report/i })).toBeInTheDocument()
    );
  });
});
