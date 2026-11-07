import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BillRecord } from "@/services/billService";

const { mockBills, mockFindRebates } = vi.hoisted(() => ({
  mockBills: {
    getBillsForProperty: vi.fn(),
    getRecurringExpensesForProperty: vi.fn(),
  },
  mockFindRebates: vi.fn(),
}));

vi.mock("@/services/billService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/billService")>();
  return { ...actual, billService: mockBills };
});
vi.mock("@/services/billsIntelligence", () => ({
  getUsageTrend: vi.fn().mockResolvedValue([]),
  analyzeEfficiencyTrend: vi.fn(),
  findRebates: mockFindRebates,
  negotiateTelecom: vi.fn(),
  getBillsNarrative: vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("@/services/property", () => ({ propertyService: { getAccessRole: vi.fn().mockResolvedValue("Owner") } }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { principal: string }) => unknown) => sel({ principal: "me" }),
}));

vi.mock("@/pages/PropertyDetail/MortgageSection", () => ({
  MortgageSection: ({ propertyId }: { propertyId: string }) => <div data-testid="mortgage">{propertyId}</div>,
}));

import { BillsTab } from "@/pages/PropertyDetail/BillsTab";

const ELECTRIC: BillRecord = {
  id: "BILL_1",
  propertyId: "p1",
  homeowner: "me",
  billType: "Electric",
  provider: "Duke Energy",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  amountCents: 14_000,
  uploadedAt: 1,
  anomalyFlag: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBills.getBillsForProperty.mockResolvedValue([ELECTRIC]);
  mockBills.getRecurringExpensesForProperty.mockResolvedValue([]);
  mockFindRebates.mockResolvedValue([
    {
      name: "Home Energy Check",
      description: "Free audit.",
      estimatedAmount: "Free",
      provider: "Duke Energy",
      url: "https://example.com/hec",
    },
  ]);
});

describe("BillsTab — rebate suggestions", () => {
  it("asks about the property's own state and zip", async () => {
    render(<BillsTab propertyId="p1" state="NC" zipCode="27601" />);
    await waitFor(() =>
      expect(mockFindRebates).toHaveBeenCalledWith({
        state: "NC",
        zipCode: "27601",
        utilityProvider: "Duke Energy",
        billType: "Electric",
      }),
    );
  });

  it("doesn't ask without a state and zip", async () => {
    render(<BillsTab propertyId="p1" state="" zipCode="" />);
    expect(await screen.findByText("Duke Energy")).toBeInTheDocument();
    expect(mockFindRebates).not.toHaveBeenCalled();
  });

  it("labels the list as AI suggestions to check", async () => {
    render(<BillsTab propertyId="p1" state="NC" zipCode="27601" />);
    expect(await screen.findByText("Home Energy Check")).toBeInTheDocument();
    expect(screen.getByText("Rebates to look into")).toBeInTheDocument();
    expect(screen.getByText(/suggested by AI/i)).toBeInTheDocument();
    expect(screen.getByText(/check each one/i)).toBeInTheDocument();
    expect(screen.queryByText("Available Rebates")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /program page/i })).toHaveAttribute("href", "https://example.com/hec");
    expect(screen.queryByRole("link", { name: /^apply/i })).not.toBeInTheDocument();
  });
});
