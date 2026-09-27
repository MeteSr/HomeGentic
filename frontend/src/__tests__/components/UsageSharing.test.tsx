import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const { getBills, attachUsage } = vi.hoisted(() => ({
  getBills:    vi.fn(),
  attachUsage: vi.fn(),
}));
vi.mock("@/services/billService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/billService")>()),
  billService: { getBillsForProperty: getBills },
}));
vi.mock("@/services/quote", () => ({ quoteService: { attachUsage } }));

import { ShareUsageToggle } from "@/components/ShareUsageToggle";
import { UsageHistory } from "@/components/UsageHistory";
import { shareBillsWithRequest } from "@/services/quoteUsage";

beforeEach(() => vi.clearAllMocks());

describe("ShareUsageToggle", () => {
  it("names the relevant utilities and toggles", () => {
    const onChange = vi.fn();
    render(<ShareUsageToggle serviceType="HVAC" checked={false} onChange={onChange} />);
    expect(screen.getByText("Share my electricity and gas usage")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /share my electricity and gas usage/i }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders nothing for services with no relevant utilities", () => {
    const { container } = render(<ShareUsageToggle serviceType="Roofing" checked={false} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("UsageHistory", () => {
  const summary = {
    asOf: "2026-09-15",
    series: [{ category: "Electric" as const, unit: "kWh", months: [
      { month: "2026-07", amountCents: 21_400, usage: 1480 },
      { month: "2026-08", amountCents: 23_900, usage: null },
    ] }],
  };

  it("shows each month's cost and usage, and the averages", () => {
    render(<UsageHistory summary={summary} />);
    expect(screen.getByText("Electricity")).toBeInTheDocument();
    expect(screen.getByText("Jul 26")).toBeInTheDocument();
    expect(screen.getByText("$214")).toBeInTheDocument();
    expect(screen.getByText("1,480 kWh")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("avg $227/mo · 1,480 kWh/mo")).toBeInTheDocument();
  });

  it("offers Stop sharing only when handed a handler", () => {
    const onStop = vi.fn();
    const { rerender } = render(<UsageHistory summary={summary} />);
    expect(screen.queryByRole("button", { name: /stop sharing/i })).not.toBeInTheDocument();
    rerender(<UsageHistory summary={summary} onStopSharing={onStop} />);
    fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }));
    expect(onStop).toHaveBeenCalled();
  });
});

describe("shareBillsWithRequest", () => {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const electric = {
    id: "b1", propertyId: "P", homeowner: "o", billType: "Electric" as const, provider: "Grid",
    periodStart: `${thisMonth}-01`, periodEnd: `${thisMonth}-10`, amountCents: 12_000,
    usageAmount: 800, usageUnit: "kWh", uploadedAt: 0, anomalyFlag: false,
  };

  it("attaches the relevant history", async () => {
    getBills.mockResolvedValue([electric]);
    expect(await shareBillsWithRequest("REQ_1", "P", "Electrical")).toBe(true);
    expect(getBills).toHaveBeenCalledWith("P");
    expect(attachUsage.mock.calls[0][0]).toBe("REQ_1");
    expect(attachUsage.mock.calls[0][1].series).toEqual([
      { category: "Electric", unit: "kWh", months: [{ month: thisMonth, amountCents: 12_000, usage: 800 }] },
    ]);
  });

  it("doesn't read bills for services with nothing relevant", async () => {
    expect(await shareBillsWithRequest("REQ_1", "P", "Painting")).toBe(false);
    expect(getBills).not.toHaveBeenCalled();
  });

  it("returns false without calling the canister when there are no matching bills", async () => {
    getBills.mockResolvedValue([electric]);
    expect(await shareBillsWithRequest("REQ_1", "P", "Plumbing")).toBe(false);
    expect(attachUsage).not.toHaveBeenCalled();
  });
});
