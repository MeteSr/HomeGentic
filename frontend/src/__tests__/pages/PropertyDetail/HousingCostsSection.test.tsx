import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RecurringExpense } from "@/services/billService";

const { mockSvc, mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockSvc: {
    getRecurringExpensesForProperty: vi.fn(),
    addRecurringExpense:             vi.fn(),
    updateRecurringExpense:          vi.fn(),
    deleteRecurringExpense:          vi.fn(),
  },
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("@/services/billService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/billService")>();
  return { ...actual, billService: mockSvc };
});

vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

import { HousingCostsSection } from "@/pages/PropertyDetail/HousingCostsSection";
import { TierLimitReachedError } from "@/services/billService";
import { billsPermissions } from "@/services/billsAccess";

function expense(overrides: Partial<RecurringExpense>): RecurringExpense {
  return {
    id: "REC_1", propertyId: "prop-1", homeowner: "owner", category: "Mortgage",
    provider: "Rocket Mortgage", amountCents: 245_000, frequency: "Monthly",
    startDate: "2020-01-01", endDate: undefined, createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

// Far-past / far-future dates keep "active today" deterministic without fake timers.
const MORTGAGE = expense({});
const TAX      = expense({ id: "REC_2", category: "PropertyTax", provider: "Hillsborough County", amountCents: 612_000, frequency: "Annual" });
const OLD_HOA  = expense({ id: "REC_3", category: "HOA", provider: "Old HOA", amountCents: 30_000, frequency: "Quarterly", endDate: "2021-01-01" });
const FUTURE   = expense({ id: "REC_4", category: "HomeInsurance", provider: "State Farm", amountCents: 180_000, frequency: "Annual", startDate: "2099-01-01" });

function renderSection() {
  return render(<HousingCostsSection propertyId="prop-1" />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSvc.getRecurringExpensesForProperty.mockResolvedValue([]);
});

describe("HousingCostsSection", () => {
  it("shows an empty state when no housing costs exist", async () => {
    renderSection();
    expect(await screen.findByText(/No housing costs yet/i)).toBeInTheDocument();
    expect(mockSvc.getRecurringExpensesForProperty).toHaveBeenCalledWith("prop-1");
  });

  it("totals only currently-active costs, normalised to per month", async () => {
    mockSvc.getRecurringExpensesForProperty.mockResolvedValue([MORTGAGE, TAX, OLD_HOA, FUTURE]);
    renderSection();
    // $2,450 mortgage + $6,120/yr tax ($510/mo); ended HOA and future insurance excluded.
    expect(await screen.findByTestId("housing-monthly-total")).toHaveTextContent("$2,960.00/mo");
    expect(screen.getByText("Ended 2021-01-01")).toBeInTheDocument();
    expect(screen.getByText("Starts 2099-01-01")).toBeInTheDocument();
    expect(screen.getByText("$6,120.00 / yr")).toBeInTheDocument();
  });

  it("adds a housing cost with the entered fields", async () => {
    const saved = expense({ id: "REC_9", provider: "Chase", amountCents: 219_000, startDate: "2024-02-01" });
    mockSvc.addRecurringExpense.mockResolvedValue(saved);
    renderSection();
    await screen.findByText(/No housing costs yet/i);

    fireEvent.click(screen.getByRole("button", { name: /Add Housing Cost/i }));
    const save = screen.getByRole("button", { name: "Add Cost" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Lender"), { target: { value: "  Chase " } });
    fireEvent.change(screen.getByLabelText(/Amount per payment/i), { target: { value: "2190" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2024-02-01" } });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(mockSvc.addRecurringExpense).toHaveBeenCalledWith("prop-1", {
      category: "Mortgage", provider: "Chase", amountCents: 219_000,
      frequency: "Monthly", startDate: "2024-02-01", endDate: undefined,
    }));
    expect(await screen.findByText("Chase")).toBeInTheDocument();
    expect(mockToastSuccess).toHaveBeenCalled();
  });

  it("relabels the payee field for the chosen category and shows the monthly equivalent", async () => {
    renderSection();
    await screen.findByText(/No housing costs yet/i);
    fireEvent.click(screen.getByRole("button", { name: /Add Housing Cost/i }));

    fireEvent.change(screen.getByLabelText("Category"), { target: { value: "PropertyTax" } });
    expect(screen.getByLabelText("Tax authority")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Frequency"), { target: { value: "Annual" } });
    fireEvent.change(screen.getByLabelText(/Amount per payment/i), { target: { value: "6000" } });
    expect(screen.getByText(/≈ \$500\.00 per month/)).toBeInTheDocument();
  });

  it("blocks saving when the end date precedes the start date", async () => {
    renderSection();
    await screen.findByText(/No housing costs yet/i);
    fireEvent.click(screen.getByRole("button", { name: /Add Housing Cost/i }));
    fireEvent.change(screen.getByLabelText("Lender"), { target: { value: "Chase" } });
    fireEvent.change(screen.getByLabelText(/Amount per payment/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2024-02-01" } });
    fireEvent.change(screen.getByLabelText(/End date/i), { target: { value: "2023-02-01" } });
    expect(screen.getByRole("button", { name: "Add Cost" })).toBeDisabled();
  });

  it("edits an existing cost in place", async () => {
    mockSvc.getRecurringExpensesForProperty.mockResolvedValue([MORTGAGE]);
    mockSvc.updateRecurringExpense.mockImplementation(async (id, f) => ({ ...MORTGAGE, ...f, id }));
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Edit Mortgage" }));
    expect(screen.getByLabelText("Lender")).toHaveValue("Rocket Mortgage");
    fireEvent.change(screen.getByLabelText(/Amount per payment/i), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await waitFor(() => expect(mockSvc.updateRecurringExpense).toHaveBeenCalledWith(
      "REC_1", expect.objectContaining({ amountCents: 200_000, provider: "Rocket Mortgage" }),
    ));
    expect(await screen.findByTestId("housing-monthly-total")).toHaveTextContent("$2,000.00/mo");
  });

  it("removes a cost", async () => {
    mockSvc.getRecurringExpensesForProperty.mockResolvedValue([MORTGAGE, TAX]);
    mockSvc.deleteRecurringExpense.mockResolvedValue(undefined);
    renderSection();

    fireEvent.click(await screen.findByRole("button", { name: "Remove Mortgage" }));
    await waitFor(() => expect(mockSvc.deleteRecurringExpense).toHaveBeenCalledWith("REC_1"));
    const table = screen.getByRole("table");
    await waitFor(() => expect(within(table).queryByText("Rocket Mortgage")).not.toBeInTheDocument());
    expect(within(table).getByText("Hillsborough County")).toBeInTheDocument();
  });

  it("surfaces the subscription prompt when the tier gate rejects the save", async () => {
    mockSvc.addRecurringExpense.mockRejectedValue(new TierLimitReachedError("Subscribe to Pro"));
    renderSection();
    await screen.findByText(/No housing costs yet/i);
    fireEvent.click(screen.getByRole("button", { name: /Add Housing Cost/i }));
    fireEvent.change(screen.getByLabelText("Lender"), { target: { value: "Chase" } });
    fireEvent.change(screen.getByLabelText(/Amount per payment/i), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2024-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Cost" }));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Subscribe to Pro", expect.anything()));
    expect(screen.getByRole("button", { name: "Add Cost" })).toBeInTheDocument();
  });

  it("reports the list upward once loaded and after each change", async () => {
    mockSvc.getRecurringExpensesForProperty.mockResolvedValue([MORTGAGE, TAX]);
    mockSvc.deleteRecurringExpense.mockResolvedValue(undefined);
    const onChange = vi.fn();
    render(<HousingCostsSection propertyId="prop-1" onExpensesChange={onChange} />);

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([MORTGAGE, TAX]));
    expect(onChange).not.toHaveBeenCalledWith([]);   // not before load completes

    fireEvent.click(screen.getByRole("button", { name: "Remove Mortgage" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith([TAX]));
  });

  describe("role-aware controls", () => {
    it("a viewer sees costs but no add, edit or remove controls", async () => {
      mockSvc.getRecurringExpensesForProperty.mockResolvedValue([TAX]);
      render(<HousingCostsSection propertyId="prop-1" permissions={billsPermissions("Viewer", "me")} />);
      expect(await screen.findByText("Hillsborough County")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Add Housing Cost/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    });

    it("a viewer with nothing shared gets a read-only empty state", async () => {
      render(<HousingCostsSection propertyId="prop-1" permissions={billsPermissions("Viewer", "me")} />);
      expect(await screen.findByText(/No housing costs have been shared/i)).toBeInTheDocument();
    });

    it("a manager can't pick Mortgage and can only edit their own entries", async () => {
      const mine = expense({ id: "REC_7", category: "HOA", provider: "Mine HOA", homeowner: "me" });
      mockSvc.getRecurringExpensesForProperty.mockResolvedValue([TAX, mine]);
      render(<HousingCostsSection propertyId="prop-1" permissions={billsPermissions("Manager", "me")} />);

      expect(await screen.findByRole("button", { name: "Edit HOA Dues" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Edit Property Tax" })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Add Housing Cost/i }));
      const options = within(screen.getByLabelText("Category")).getAllByRole("option").map((o) => o.textContent);
      expect(options).not.toContain("Mortgage");
      expect(screen.getByLabelText("Category")).toHaveValue("PropertyTax");
    });
  });
});
