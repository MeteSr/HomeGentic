import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { MortgageLoan } from "@homegentic/shared/mortgage";

const { mockGet, mockSave, mockToast } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSave: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/services/mortgageLoan", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/mortgageLoan")>()),
  mortgageLoanService: { get: mockGet, save: mockSave },
}));
vi.mock("react-hot-toast", () => ({ default: mockToast }));

import { MortgageSection } from "@/pages/PropertyDetail/MortgageSection";

const LOAN: MortgageLoan = {
  lender: "Sunshine Bank",
  originalAmount: 300_000,
  annualRatePct: 6.5,
  termMonths: 360,
  firstPaymentDate: "2024-02-01",
  originalValue: 350_000,
  currentValue: 420_000,
  monthlyPmi: 120,
  monthlyEscrow: 600,
  statementBalance: null,
  statementDate: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2025, 0, 15, 15)));
  mockGet.mockResolvedValue(null);
  mockSave.mockResolvedValue(undefined);
  localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("MortgageSection", () => {
  it("says it's a calculator, not advice, and offers to add the loan", async () => {
    render(<MortgageSection propertyId="p1" />);
    expect(await screen.findByText(/no lending advice/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add your loan" })).toBeInTheDocument();
  });

  it("works the payment, escrow share, balance, equity and PMI dates out of the owner's numbers", async () => {
    mockGet.mockResolvedValue(LOAN);
    render(<MortgageSection propertyId="p1" />);
    expect(await screen.findByText("$1,896.20")).toBeInTheDocument(); // principal and interest
    expect(screen.getByText("$2,616.20")).toBeInTheDocument(); // with escrow and PMI
    expect(screen.getByText(/escrow is 23% of the payment/i)).toBeInTheDocument();
    expect(screen.getByText("$296,646.82")).toBeInTheDocument();
    expect(screen.getByText(/on the original schedule after 12 payments/i)).toBeInTheDocument();
    expect(screen.getByText("$123,353.18")).toBeInTheDocument(); // equity
    expect(screen.getByText(/71% loan-to-value/i)).toBeInTheDocument();
    expect(screen.getByText(/80% of the original value on Apr 1, 2029/)).toBeInTheDocument();
    expect(screen.getByText(/78% on Sep 1, 2030/)).toBeInTheDocument();
    expect(screen.getByText(/your lender decides/i)).toBeInTheDocument();
    expect(screen.getByText(/paid off Jan 1, 2054/i)).toBeInTheDocument();
  });

  it("uses the statement balance when there is one, and says PMI could be asked about", async () => {
    mockGet.mockResolvedValue({ ...LOAN, statementBalance: 279_000, statementDate: "2025-01-01" });
    render(<MortgageSection propertyId="p1" />);
    expect(await screen.findByText("$279,000")).toBeInTheDocument();
    expect(screen.getByText(/from your statement of Jan 1, 2025/i)).toBeInTheDocument();
    expect(screen.getByText(/at or under 80% of the original value/i)).toBeInTheDocument();
  });

  it("asks for a home value instead of guessing equity", async () => {
    mockGet.mockResolvedValue({ ...LOAN, currentValue: null });
    render(<MortgageSection propertyId="p1" />);
    expect(await screen.findByText(/add what you think the home is worth/i)).toBeInTheDocument();
  });

  it("saves a loan from the form, prefilling the home value saved on the property", async () => {
    localStorage.setItem("hf_est_val_p1", "410000");
    render(<MortgageSection propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add your loan" }));
    expect((screen.getByLabelText("Home value now (your estimate), $") as HTMLInputElement).value).toBe("410000");
    fireEvent.change(screen.getByLabelText("Amount borrowed, $"), { target: { value: "300,000" } });
    fireEvent.change(screen.getByLabelText("Interest rate, %"), { target: { value: "6.5" } });
    fireEvent.change(screen.getByLabelText("Term, years"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("First payment date"), { target: { value: "2024-02-01" } });
    fireEvent.change(screen.getByLabelText("Monthly escrow, $"), { target: { value: "600" } });
    fireEvent.click(screen.getByRole("button", { name: "Save loan" }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("p1", expect.objectContaining({
        originalAmount: 300_000, annualRatePct: 6.5, termMonths: 360, firstPaymentDate: "2024-02-01",
        currentValue: 410_000, monthlyEscrow: 600, monthlyPmi: null, statementBalance: null,
      })),
    );
    expect(await screen.findByText("$1,896.20")).toBeInTheDocument();
  });

  it("shows the problem instead of saving a bad loan", async () => {
    render(<MortgageSection propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add your loan" }));
    fireEvent.click(screen.getByRole("button", { name: "Save loan" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/amount borrowed/i);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("removes the loan", async () => {
    mockGet.mockResolvedValue(LOAN);
    render(<MortgageSection propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit loan" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove loan" }));
    await waitFor(() => expect(mockSave).toHaveBeenCalledWith("p1", null));
    expect(await screen.findByRole("button", { name: "Add your loan" })).toBeInTheDocument();
  });

  it("offers a retry when loading fails, and reports a failed save", async () => {
    mockGet.mockRejectedValueOnce(new Error("down")).mockResolvedValue(LOAN);
    mockSave.mockRejectedValue(new Error("boom"));
    render(<MortgageSection propertyId="p1" />);
    fireEvent.click(await screen.findByRole("button", { name: /try again/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit loan" }));
    fireEvent.click(screen.getByRole("button", { name: "Save loan" }));
    await waitFor(() => expect(mockToast.error).toHaveBeenCalled());
  });
});
