import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { BillRecord, RecurringExpense } from "@/services/billService";

const { mockGetNarrative } = vi.hoisted(() => ({ mockGetNarrative: vi.fn() }));

vi.mock("@/services/billsIntelligence", () => ({ getBillsNarrative: mockGetNarrative }));

import { BillsForecastPanel } from "@/pages/PropertyDetail/BillsForecastPanel";

const MORTGAGE: RecurringExpense = {
  id: "R1", propertyId: "p", homeowner: "o", category: "Mortgage", provider: "Lender",
  amountCents: 200_000, frequency: "Monthly", startDate: "2020-01-05", createdAt: 0, updatedAt: 0,
};

// Annual tax due next month relative to whenever the test runs, so it's always "upcoming".
function nextMonthStart(): string {
  const d = new Date();
  const n = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return `2019-${String(n.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
const TAX: RecurringExpense = {
  ...MORTGAGE, id: "R2", category: "PropertyTax", provider: "County", amountCents: 600_000,
  frequency: "Annual", startDate: nextMonthStart(),
};

function recentWaterBill(): BillRecord {
  const d = new Date();
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return {
    id: "B1", propertyId: "p", homeowner: "o", billType: "Water", provider: "City",
    periodStart: `${ym}-01`, periodEnd: `${ym}-02`, amountCents: 6_000, uploadedAt: 0, anomalyFlag: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetNarrative.mockResolvedValue({ summary: "Steady costs ahead.", tips: ["Save for the tax bill."], source: "ai" });
});

describe("BillsForecastPanel", () => {
  it("renders nothing when there is no data to forecast", () => {
    const { container } = render(<BillsForecastPanel bills={[]} expenses={[]} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockGetNarrative).not.toHaveBeenCalled();
  });

  it("shows the 12-month total, monthly average and per-category breakdown", () => {
    render(<BillsForecastPanel bills={[recentWaterBill()]} expenses={[MORTGAGE, TAX]} />);
    // $24,000 mortgage + $6,000 tax + 12 × $60 water
    expect(screen.getByTestId("forecast-total")).toHaveTextContent("$30,720");
    expect(screen.getByTestId("forecast-avg")).toHaveTextContent("$2,560");
    expect(screen.getByText("Mortgage")).toBeInTheDocument();
    expect(screen.getByText(/Recent average, low confidence/)).toBeInTheDocument();
    expect(screen.getByText(/forecast will sharpen/i)).toBeInTheDocument();
  });

  it("lists an upcoming lump-sum payment as a pattern", () => {
    render(<BillsForecastPanel bills={[]} expenses={[MORTGAGE, TAX]} />);
    const patterns = screen.getByRole("list", { name: "Patterns" });
    expect(within(patterns).getByText("Property Tax · $6,000 due")).toBeInTheDocument();
  });

  it("shows a tooltip with the month's split on hover and on keyboard focus", () => {
    render(<BillsForecastPanel bills={[]} expenses={[MORTGAGE, TAX]} />);
    const columns = screen.getAllByLabelText(/total — housing/);
    expect(columns).toHaveLength(12);

    fireEvent.pointerEnter(columns[0]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("$8,000");
    fireEvent.pointerLeave(columns[0]);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.focus(columns[1]);
    expect(screen.getByRole("tooltip")).toHaveTextContent("$2,000");
  });

  it("offers the same numbers as a table", () => {
    render(<BillsForecastPanel bills={[]} expenses={[MORTGAGE]} />);
    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(13);
    expect(rows[1]).toHaveTextContent("$2,000");
  });

  it("requests the narrative once (debounced) and renders it with its AI attribution", async () => {
    render(<BillsForecastPanel bills={[]} expenses={[MORTGAGE, TAX]} />);
    expect(screen.getByText("Analyzing your costs…")).toBeInTheDocument();
    expect(await screen.findByText("Steady costs ahead.")).toBeInTheDocument();
    expect(screen.getByText("Save for the tax bill.")).toBeInTheDocument();
    expect(screen.getByText(/Written by AI/)).toBeInTheDocument();
    expect(mockGetNarrative).toHaveBeenCalledTimes(1);
    expect(mockGetNarrative.mock.calls[0][0].next12TotalCents).toBe(3_000_000);
  });

  it("omits the AI attribution for the rule-based fallback", async () => {
    mockGetNarrative.mockResolvedValueOnce({ summary: "Rule summary.", tips: [], source: "rules" });
    render(<BillsForecastPanel bills={[]} expenses={[MORTGAGE]} />);
    expect(await screen.findByText("Rule summary.")).toBeInTheDocument();
    expect(screen.queryByText(/Written by AI/)).not.toBeInTheDocument();
  });

  it("hides the narrative box when the request fails, keeping the forecast", async () => {
    mockGetNarrative.mockRejectedValueOnce(new Error("offline"));
    render(<BillsForecastPanel bills={[]} expenses={[MORTGAGE]} />);
    await waitFor(() => expect(screen.queryByText("What this means")).not.toBeInTheDocument());
    expect(screen.getByTestId("forecast-total")).toHaveTextContent("$24,000");
  });
});
