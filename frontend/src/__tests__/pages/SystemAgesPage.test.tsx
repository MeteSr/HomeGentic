/**
 * SystemAgesPage — real logic worth locking down:
 *   - fields initialize from stored ages when set, else the property's
 *     yearBuilt (or CURRENT_YEAR - 20 when the property isn't found)
 *   - editing a field marks it "touched"/custom (shows Reset + computed age)
 *   - Reset restores the field to yearBuilt and un-touches it
 *   - Save only persists touched fields whose year is a valid number in
 *     [1900, CURRENT_YEAR] — invalid entries are silently dropped
 *   - Save navigates back afterward
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import SystemAgesPage from "@/pages/SystemAgesPage";
import type { Property } from "@/services/property";

const CURRENT_YEAR = new Date().getFullYear();

const { mockNavigate, mockUseParams } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockUseParams: vi.fn(() => ({ id: "prop-1" })),
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useParams: mockUseParams, useNavigate: () => mockNavigate };
});

// Saves go to the home record (save); load() reads it when the page opens.
const { mockGet, mockSet, mockLoad } = vi.hoisted(() => ({ mockGet: vi.fn(), mockSet: vi.fn(), mockLoad: vi.fn() }));
vi.mock("@/services/systemAges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/systemAges")>();
  return { ...actual, systemAgesService: { get: mockGet, save: mockSet, load: mockLoad } };
});

const STABLE_PROPS: Property[] = [{
  id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
  zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 1998n, squareFeet: 2000n,
  verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
}];
vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: STABLE_PROPS }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({ mockToastSuccess: vi.fn(), mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: mockToastSuccess, error: mockToastError } }));

function renderPage() {
  return render(
    <MemoryRouter>
      <SystemAgesPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockReturnValue({});
  mockLoad.mockImplementation(async () => mockGet());
  mockSet.mockImplementation(async (_pid: string, ages: unknown) => ages);
  mockUseParams.mockReturnValue({ id: "prop-1" });
});

describe("SystemAgesPage — home record", () => {
  it("shows the years saved on the home record", async () => {
    mockLoad.mockResolvedValueOnce({ Roofing: 2011 });
    renderPage();
    expect(await screen.findByDisplayValue("2011")).toBeInTheDocument();
  });

  it("stays on the page and says why when the record refuses the years", async () => {
    mockSet.mockRejectedValueOnce(new Error("The HVAC year is in the future"));
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() => expect(mockToastError).toHaveBeenCalled());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("SystemAgesPage — initialization", () => {
  it("defaults every field to the property's yearBuilt and shows 'house age'", () => {
    renderPage();
    // One field per tracked system, all defaulting to the same yearBuilt value
    expect(screen.getAllByDisplayValue("1998").length).toBe(9);
    expect(screen.getAllByText("house age").length).toBe(9);
  });

  it("initializes a stored system as touched/custom", () => {
    mockGet.mockReturnValue({ HVAC: 2015 });
    renderPage();
    expect(screen.getByDisplayValue("2015")).toBeInTheDocument();
    expect(screen.getByText(`${CURRENT_YEAR - 2015} yrs old`)).toBeInTheDocument();
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("falls back to CURRENT_YEAR - 20 when the property isn't in the store", () => {
    mockUseParams.mockReturnValue({ id: "unknown-prop" });
    renderPage();
    expect(screen.getAllByDisplayValue(String(CURRENT_YEAR - 20)).length).toBeGreaterThan(0);
  });
});

describe("SystemAgesPage — editing", () => {
  it("marks a field touched/custom when edited, showing Reset and computed age", () => {
    renderPage();
    const inputs = screen.getAllByDisplayValue("1998");
    fireEvent.change(inputs[0], { target: { value: "2010" } });

    expect(screen.getByText(`${CURRENT_YEAR - 2010} yrs old`)).toBeInTheDocument();
    expect(screen.getByText("Reset")).toBeInTheDocument();
  });

  it("Reset restores the field to yearBuilt and removes the custom styling", () => {
    mockGet.mockReturnValue({ HVAC: 2015 });
    renderPage();
    expect(screen.getByText("Reset")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reset"));

    expect(screen.queryByText("Reset")).not.toBeInTheDocument();
    expect(screen.getAllByDisplayValue("1998").length).toBeGreaterThan(0);
  });
});

describe("SystemAgesPage — save", () => {
  it("only persists touched systems with valid years, and navigates back", async () => {
    mockGet.mockReturnValue({});
    renderPage();

    const inputs = screen.getAllByDisplayValue("1998");
    // Touch the first field (HVAC) with a valid year
    fireEvent.change(inputs[0], { target: { value: "2012" } });

    fireEvent.click(screen.getByText("Save System Ages"));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("prop-1", { HVAC: 2012 }));
    expect(mockToastSuccess).toHaveBeenCalledWith("System ages saved — maintenance predictions updated.");
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("drops a touched field whose year is out of the valid 1900-current range", async () => {
    mockGet.mockReturnValue({});
    renderPage();

    const inputs = screen.getAllByDisplayValue("1998");
    fireEvent.change(inputs[0], { target: { value: "1850" } }); // touched, but invalid

    fireEvent.click(screen.getByText("Save System Ages"));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("prop-1", {}));
  });

  it("drops a touched field that isn't a number", async () => {
    mockGet.mockReturnValue({});
    renderPage();

    const inputs = screen.getAllByDisplayValue("1998");
    fireEvent.change(inputs[0], { target: { value: "" } }); // touched, blank -> NaN

    fireEvent.click(screen.getByText("Save System Ages"));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("prop-1", {}));
  });

  it("does not include untouched systems even though they show a value", async () => {
    mockGet.mockReturnValue({ HVAC: 2015 });
    renderPage();

    fireEvent.click(screen.getByText("Save System Ages"));

    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("prop-1", { HVAC: 2015 }));
  });
});
