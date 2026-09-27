/**
 * GenerateReportModal — "Monthly costs" opt-in.
 *
 * The summary is stored with the snapshot, so it has to be chosen at
 * generation time; it's off by default and never carries the mortgage.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

const { mockShareLink } = vi.hoisted(() => ({
  mockShareLink: {
    token: "tok-123", snapshotId: "snap-1", propertyId: "42",
    createdBy: "owner", expiresAt: null,
    visibility: "Public" as const, viewCount: 0, isActive: true, createdAt: Date.now(),
  },
}));

const mockProperty = {
  id: "42", address: "123 Maple St", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily" as const,
  yearBuilt: BigInt(1998), squareFeet: BigInt(2100),
  verificationLevel: "Basic" as const, tier: "Pro" as const,
  owner: "owner", isActive: true, createdAt: BigInt(0), updatedAt: BigInt(0),
};

vi.mock("@/services/report", () => ({
  reportService: {
    listShareLinks:  vi.fn().mockResolvedValue([]),
    generateReport:  vi.fn().mockResolvedValue(mockShareLink),
    shareUrl:        vi.fn().mockReturnValue("https://example.com/report/tok-123"),
    revokeShareLink: vi.fn().mockResolvedValue(undefined),
    expiryLabel:     vi.fn().mockReturnValue("Never expires"),
  },
  propertyToInput: vi.fn().mockReturnValue({}),
  jobToInput:      vi.fn().mockReturnValue({}),
  roomToInput:     vi.fn().mockReturnValue({}),
}));
vi.mock("@/services/job", () => ({ jobService: { getByProperty: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/recurringService", () => ({
  recurringService: { getByProperty: vi.fn().mockResolvedValue([]), getVisitLogs: vi.fn(), toSummary: vi.fn() },
}));
vi.mock("@/services/room", () => ({ roomService: { getRoomsByProperty: vi.fn().mockResolvedValue([]) } }));
vi.mock("@/services/scoreService", () => ({
  computeScore: vi.fn().mockReturnValue(72), getScoreGrade: vi.fn().mockReturnValue("B"),
}));
vi.mock("@/services/payment", () => ({
  paymentService: { getMySubscription: vi.fn().mockResolvedValue({ tier: "Pro", expiresAt: null, cancelledAt: null }) },
}));
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

const thisMonth = new Date().toISOString().slice(0, 7);
vi.mock("@/services/billService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/billService")>();
  return {
    ...actual,
    billService: {
      getBillsForProperty: vi.fn(async () => [{
        id: "b1", propertyId: "42", homeowner: "o", billType: "Electric", provider: "Grid",
        periodStart: `${thisMonth}-01`, periodEnd: `${thisMonth}-10`, amountCents: 12_000,
        uploadedAt: 0, anomalyFlag: false,
      }]),
      getRecurringExpensesForProperty: vi.fn(async () => [
        { id: "m", propertyId: "42", homeowner: "o", category: "Mortgage", provider: "Bank",
          amountCents: 250_000, frequency: "Monthly", startDate: "2020-01-01", createdAt: 0, updatedAt: 0 },
        { id: "h", propertyId: "42", homeowner: "o", category: "HOA", provider: "HOA",
          amountCents: 30_000, frequency: "Monthly", startDate: "2020-01-01", createdAt: 0, updatedAt: 0 },
      ]),
    },
  };
});

import { GenerateReportModal } from "@/components/GenerateReportModal";
import { reportService } from "@/services/report";
import { billService } from "@/services/billService";
import toast from "react-hot-toast";

function renderModal() {
  return render(
    <MemoryRouter>
      <GenerateReportModal property={mockProperty as any} onClose={vi.fn()} />
    </MemoryRouter>
  );
}

async function clickGenerate() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /generate report link/i })).not.toBeDisabled()
  );
  fireEvent.click(screen.getByRole("button", { name: /generate report link/i }));
  await waitFor(() => expect(reportService.generateReport).toHaveBeenCalled());
}

describe("GenerateReportModal — monthly costs opt-in", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is off by default and doesn't read bills", async () => {
    renderModal();
    expect(screen.getByRole("checkbox", { name: /include monthly costs/i })).toHaveAttribute("aria-checked", "false");
    await clickGenerate();
    expect(vi.mocked(reportService.generateReport).mock.calls[0][7]).toBeNull();
    expect(billService.getBillsForProperty).not.toHaveBeenCalled();
  });

  it("says the mortgage is never shared", () => {
    renderModal();
    expect(screen.getByText(/mortgage is never shared/i)).toBeInTheDocument();
  });

  it("attaches a summary without the mortgage when checked", async () => {
    renderModal();
    fireEvent.click(screen.getByText("Monthly costs"));
    await clickGenerate();
    const summary = vi.mocked(reportService.generateReport).mock.calls[0][7];
    expect(summary?.lines).toEqual([
      { category: "Electric", avgMonthlyCents: 12_000, statementMonths: 1 },
      { category: "HOA",      avgMonthlyCents: 30_000, statementMonths: null },
    ]);
  });

  it("tells the owner when there's nothing to include", async () => {
    vi.mocked(billService.getBillsForProperty).mockResolvedValueOnce([]);
    vi.mocked(billService.getRecurringExpensesForProperty).mockResolvedValueOnce([]);
    renderModal();
    fireEvent.click(screen.getByText("Monthly costs"));
    await clickGenerate();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/no bills/i));
  });
});
