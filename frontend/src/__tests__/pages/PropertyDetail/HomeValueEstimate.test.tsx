/**
 * HomeValueEstimate: the index-based home value under the mortgage card. It
 * moves the value when the loan was made by the state's FHFA index change,
 * says it's an estimate and not an appraisal, and the owner can use it as
 * their home value (or keep typing their own).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MortgageLoan } from "@homegentic/shared/mortgage";

const { mockHpi } = vi.hoisted(() => ({ mockHpi: vi.fn() }));
vi.mock("@/services/homeValueIndex", () => ({ getStateHpi: mockHpi }));

import { HomeValueEstimate } from "@/pages/PropertyDetail/HomeValueEstimate";

const LOAN: MortgageLoan = {
  lender: "Sunshine Bank",
  originalAmount: 240_000,
  annualRatePct: 4,
  termMonths: 360,
  firstPaymentDate: "2019-07-01",
  originalValue: 300_000,
  currentValue: 380_000,
  monthlyPmi: null,
  monthlyEscrow: null,
  statementBalance: null,
  statementDate: "",
};
const SERIES = [
  [2019, 2, 250],
  [2026, 2, 345],
];

beforeEach(() => vi.clearAllMocks());

describe("HomeValueEstimate", () => {
  it("shows the estimate with its source and says it isn't an appraisal", async () => {
    mockHpi.mockResolvedValue(SERIES);
    render(<HomeValueEstimate loan={LOAN} homeState="FL" onUse={vi.fn()} />);
    expect(await screen.findByText("$414,000")).toBeInTheDocument();
    expect(mockHpi).toHaveBeenCalledWith("FL");
    expect(screen.getByText(/up 38% in FL from Q2 2019 to Q2 2026/)).toBeInTheDocument();
    expect(screen.getByText(/FHFA House Price Index/)).toBeInTheDocument();
    expect(screen.getByText(/not an appraisal/i)).toBeInTheDocument();
  });

  it("lets the owner use it as their home value", async () => {
    mockHpi.mockResolvedValue(SERIES);
    const onUse = vi.fn();
    render(<HomeValueEstimate loan={LOAN} homeState="FL" onUse={onUse} />);
    fireEvent.click(await screen.findByRole("button", { name: "Use $414,000 as my home value" }));
    expect(onUse).toHaveBeenCalledWith(414_000);
  });

  it("hides the button when the owner's value already matches, and says when prices fell", async () => {
    mockHpi.mockResolvedValue([
      [2019, 2, 250],
      [2026, 2, 240],
    ]);
    render(<HomeValueEstimate loan={{ ...LOAN, currentValue: 288_000 }} homeState="FL" onUse={vi.fn()} />);
    expect(await screen.findByText("$288,000")).toBeInTheDocument();
    expect(screen.getByText(/down 4% in FL/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows nothing without a state, a value at the start, or index data", async () => {
    const { container, rerender } = render(<HomeValueEstimate loan={LOAN} homeState="" onUse={vi.fn()} />);
    expect(mockHpi).not.toHaveBeenCalled();
    rerender(<HomeValueEstimate loan={{ ...LOAN, originalValue: null }} homeState="FL" onUse={vi.fn()} />);
    expect(mockHpi).not.toHaveBeenCalled();
    mockHpi.mockResolvedValue(null);
    rerender(<HomeValueEstimate loan={LOAN} homeState="FL" onUse={vi.fn()} />);
    await vi.waitFor(() => expect(mockHpi).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
