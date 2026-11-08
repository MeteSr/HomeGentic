import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TaxYear } from "@/services/propertyTax";

const { mockList, mockSave, mockRemove, mockToast } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockSave: vi.fn(),
  mockRemove: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/services/propertyTax", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/propertyTax")>()),
  propertyTaxService: { list: mockList, save: mockSave, remove: mockRemove },
}));
vi.mock("react-hot-toast", () => ({ default: mockToast }));

import { PropertyTaxSection } from "@/pages/PropertyDetail/PropertyTaxSection";

const Y2026: TaxYear = {
  year: 2026,
  marketValue: 412_500,
  assessedValue: 318_000,
  taxableValue: 268_000,
  exemption: "Granted",
  petitionDeadline: "2026-09-15",
  notes: "",
};
const Y2025: TaxYear = { ...Y2026, year: 2025, assessedValue: 300_000, petitionDeadline: "" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(Date.UTC(2027, 1, 1, 15)));
  mockList.mockResolvedValue([]);
  mockSave.mockImplementation(async (_p: string, y: TaxYear) => y);
  mockRemove.mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

describe("PropertyTaxSection", () => {
  it("says it's the owner's own record, not tax advice, and offers to add a year", async () => {
    render(<PropertyTaxSection propertyId="p1" state="GA" />);
    expect(await screen.findByText(/not tax advice/i)).toBeInTheDocument();
    expect(screen.getByText(/doesn't check them with the county/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a tax year" })).toBeInTheDocument();
    // No Florida dates outside Florida.
    expect(screen.queryByText(/March 1/)).not.toBeInTheDocument();
  });

  it("shows Florida's dates with their official sources, and what's due now", async () => {
    render(<PropertyTaxSection propertyId="p1" state="FL" />);
    const dates = await screen.findByRole("region", { name: "Florida dates" });
    expect(within(dates).getByText(/apply by March 1/i)).toBeInTheDocument();
    expect(within(dates).getByText(/25 days after/i)).toBeInTheDocument();
    expect(within(dates).getByRole("link", { name: /s\. 196\.011/ })).toHaveAttribute(
      "href",
      "https://www.flsenate.gov/Laws/Statutes/2026/196.011",
    );
    expect(within(dates).getByRole("link", { name: /Value Adjustment Board/ })).toHaveAttribute(
      "href",
      "https://floridarevenue.com/property/Documents/pt101.pdf",
    );
    expect(
      await within(dates).findByText(/Due now: apply for the homestead exemption by Mar 1, 2027/),
    ).toBeInTheDocument();
    expect(dates.textContent).not.toMatch(/savings|you'll save|\$/i);
  });

  it("lists the saved years with the change in assessed value", async () => {
    mockList.mockResolvedValue([Y2026, Y2025]);
    render(<PropertyTaxSection propertyId="p1" state="FL" />);
    const row = (await screen.findByText("2026")).closest("tr")!;
    expect(within(row).getByText("$412,500")).toBeInTheDocument();
    expect(within(row).getByText("$318,000")).toBeInTheDocument();
    expect(within(row).getByText("+6.0% vs 2025")).toBeInTheDocument();
    expect(within(row).getByText("Granted")).toBeInTheDocument();
    expect(within(row).getByText("Sep 15, 2026")).toBeInTheDocument();
    // Last year was granted, so no homestead line is due now.
    expect(screen.queryByText(/Due now/)).not.toBeInTheDocument();
  });

  it("saves a year from the form, and refuses one the canister would refuse", async () => {
    render(<PropertyTaxSection propertyId="p1" state="FL" />);
    fireEvent.click(await screen.findByRole("button", { name: "Add a tax year" }));
    fireEvent.change(screen.getByLabelText("Tax year"), { target: { value: "2027" } });
    fireEvent.change(screen.getByLabelText("Assessed value, $"), { target: { value: "325,000" } });
    fireEvent.change(screen.getByLabelText("Homestead exemption"), { target: { value: "Applied" } });
    fireEvent.change(screen.getByLabelText("Petition deadline on the TRIM notice"), {
      target: { value: "2026-09-15" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save year" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/in the tax year/i);
    expect(mockSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Petition deadline on the TRIM notice"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save year" }));
    await waitFor(() =>
      expect(mockSave).toHaveBeenCalledWith("p1", {
        year: 2027,
        marketValue: null,
        assessedValue: 325_000,
        taxableValue: null,
        exemption: "Applied",
        petitionDeadline: "",
        notes: "",
      }),
    );
    expect(await screen.findByText("2027")).toBeInTheDocument();
    expect(mockToast.success).toHaveBeenCalledWith("Tax year saved");
  });

  it("deletes a year", async () => {
    mockList.mockResolvedValue([Y2026]);
    render(<PropertyTaxSection propertyId="p1" state="FL" />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete 2026" }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalledWith("p1", 2026));
    await waitFor(() => expect(screen.queryByText("2026")).not.toBeInTheDocument());
  });
});
