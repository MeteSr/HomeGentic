import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BillRecord } from "@/services/billService";

const { mockBills, mockGetAccessRole } = vi.hoisted(() => ({
  mockBills: {
    getBillsForProperty:             vi.fn(),
    getRecurringExpensesForProperty: vi.fn(),
  },
  mockGetAccessRole: vi.fn(),
}));

vi.mock("@/services/billService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/billService")>();
  return { ...actual, billService: mockBills };
});
vi.mock("@/services/billsIntelligence", () => ({
  getUsageTrend:         vi.fn().mockResolvedValue([]),
  analyzeEfficiencyTrend: vi.fn(),
  findRebates:           vi.fn().mockResolvedValue([]),
  negotiateTelecom:      vi.fn(),
  getBillsNarrative:     vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("@/services/property", () => ({ propertyService: { getAccessRole: mockGetAccessRole } }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: (s: { principal: string }) => unknown) => sel({ principal: "me" }),
}));

vi.mock("@/pages/PropertyDetail/PropertyTaxSection", () => ({
  PropertyTaxSection: ({ propertyId, state }: { propertyId: string; state: string }) => (
    <div data-testid="property-tax">{`${propertyId} ${state}`}</div>
  ),
}));
vi.mock("@/pages/PropertyDetail/MortgageSection", () => ({
  MortgageSection: ({ propertyId }: { propertyId: string }) => <div data-testid="mortgage">{propertyId}</div>,
}));

import { BillsTab } from "@/pages/PropertyDetail/BillsTab";

const OWNERS_BILL: BillRecord = {
  id: "BILL_1", propertyId: "p1", homeowner: "the-owner", billType: "Water", provider: "City Water",
  periodStart: "2026-08-01", periodEnd: "2026-08-31", amountCents: 6_500, uploadedAt: 1, anomalyFlag: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBills.getBillsForProperty.mockResolvedValue([OWNERS_BILL]);
  mockBills.getRecurringExpensesForProperty.mockResolvedValue([]);
});

describe("BillsTab — role-aware", () => {
  it("asks the property canister for the caller's role", async () => {
    mockGetAccessRole.mockResolvedValue("Owner");
    render(<BillsTab propertyId="p1" state="FL" zipCode="32114" />);
    await waitFor(() => expect(mockGetAccessRole).toHaveBeenCalledWith("p1", "me"));
  });

  it("a viewer gets a read-only note and no upload or remove controls", async () => {
    mockGetAccessRole.mockResolvedValue("Viewer");
    render(<BillsTab propertyId="p1" state="FL" zipCode="32114" />);
    expect(await screen.findByText(/view-only access/i)).toBeInTheDocument();
    expect(await screen.findByText("City Water")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload Bill/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove bill" })).not.toBeInTheDocument();
  });

  it("a manager can upload but not remove the owner's bill", async () => {
    mockGetAccessRole.mockResolvedValue("Manager");
    render(<BillsTab propertyId="p1" state="FL" zipCode="32114" />);
    expect(await screen.findByText("City Water")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: /Upload Bill/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Remove bill" })).not.toBeInTheDocument();
  });

  it("shows the mortgage calculator to owners and co-owners only (#722)", async () => {
    for (const [role, shown] of [["Owner", true], ["CoOwner", true], ["Manager", false], ["Viewer", false]] as const) {
      mockGetAccessRole.mockResolvedValue(role);
      const { unmount } = render(<BillsTab propertyId="p1" state="FL" zipCode="32114" />);
      await screen.findByText("City Water");
      await waitFor(() => expect(mockGetAccessRole).toHaveBeenCalled());
      if (shown) expect(await screen.findByTestId("mortgage")).toHaveTextContent("p1");
      else await waitFor(() => expect(screen.queryByTestId("mortgage")).not.toBeInTheDocument());
      unmount();
    }
  });

  it("shows the property tax record to owners and co-owners only (#714)", async () => {
    for (const [role, shown] of [["Owner", true], ["CoOwner", true], ["Manager", false], ["Viewer", false]] as const) {
      mockGetAccessRole.mockResolvedValue(role);
      const { unmount } = render(<BillsTab propertyId="p1" state="FL" zipCode="32114" />);
      await screen.findByText("City Water");
      await waitFor(() => expect(mockGetAccessRole).toHaveBeenCalled());
      if (shown) expect(await screen.findByTestId("property-tax")).toHaveTextContent("p1 FL");
      else await waitFor(() => expect(screen.queryByTestId("property-tax")).not.toBeInTheDocument());
      unmount();
    }
  });

  it("a co-owner can remove anyone's bill", async () => {
    mockGetAccessRole.mockResolvedValue("CoOwner");
    render(<BillsTab propertyId="p1" state="FL" zipCode="32114" />);
    expect(await screen.findByRole("button", { name: "Remove bill" })).toBeInTheDocument();
  });

  it("falls back to full controls when the role can't be fetched", async () => {
    mockGetAccessRole.mockRejectedValue(new Error("unreachable"));
    render(<BillsTab propertyId="p1" state="FL" zipCode="32114" />);
    expect(await screen.findByRole("button", { name: "Remove bill" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload Bill/i })).toBeInTheDocument();
    expect(screen.queryByText(/view-only access/i)).not.toBeInTheDocument();
  });
});
