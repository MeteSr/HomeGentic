/**
 * PropertyAddressBar — real logic worth locking down:
 *   - renders nothing with no active property
 *   - the pill toggles the dropdown open/closed, and a click outside
 *     the component closes it
 *   - the address label is uppercased and combines address/city/
 *     state/zip
 *   - the active property is checkmarked; the type label defaults to
 *     "Primary residence" for the first entry and "Property"
 *     otherwise, unless an explicit type is given
 *   - selecting a property calls onSelect and closes the dropdown
 *   - Add property closes the dropdown and opens the add-property store
 *   - certBadge conditionally renders the CERTIFIED pill
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PropertyAddressBar } from "@/components/PropertyAddressBar";

const { mockOpenAddProp } = vi.hoisted(() => ({ mockOpenAddProp: vi.fn() }));
vi.mock("@/store/addPropertyStore", () => ({
  useAddPropertyStore: () => ({ open: mockOpenAddProp }),
}));

const activeProperty = { id: "p1", address: "123 Main St", city: "Austin", state: "TX", zipCode: "78701" };
const properties = [
  activeProperty,
  { id: "p2", address: "456 Oak Ave", city: "Austin", state: "TX", zipCode: "78702", type: "Rental" },
];

beforeEach(() => vi.clearAllMocks());

describe("PropertyAddressBar — visibility", () => {
  it("renders nothing with no active property", () => {
    const { container } = render(
      <PropertyAddressBar activeProperty={null} properties={[]} onSelect={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PropertyAddressBar — pill", () => {
  it("shows an uppercased address/city/state/zip label", () => {
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} />);
    expect(screen.getByText("123 MAIN ST · AUSTIN TX 78701")).toBeInTheDocument();
  });

  it("toggles the dropdown open and closed on click", () => {
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} />);
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("SWITCH"));
    expect(screen.getByText("Add property")).toBeInTheDocument();

    fireEvent.click(screen.getByText("SWITCH"));
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
  });

  it("closes the dropdown on an outside click", () => {
    render(
      <div>
        <PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} />
        <div data-testid="outside">Outside</div>
      </div>
    );
    fireEvent.click(screen.getByText("SWITCH"));
    expect(screen.getByText("Add property")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
  });
});

describe("PropertyAddressBar — property list", () => {
  it("labels the first property Primary residence by default and shows the checkmark for the active one", () => {
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText("SWITCH"));

    expect(screen.getByText("Primary residence")).toBeInTheDocument();
  });

  it("uses an explicit type label when provided", () => {
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText("SWITCH"));
    expect(screen.getByText("Rental")).toBeInTheDocument();
  });

  it("selects a property and closes the dropdown", () => {
    const onSelect = vi.fn();
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("SWITCH"));

    fireEvent.click(screen.getByText("456 Oak Ave"));

    expect(onSelect).toHaveBeenCalledWith("p2");
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
  });
});

describe("PropertyAddressBar — add property", () => {
  it("closes the dropdown and opens the add-property store", () => {
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText("SWITCH"));

    fireEvent.click(screen.getByText("Add property"));

    expect(mockOpenAddProp).toHaveBeenCalled();
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
  });
});

describe("PropertyAddressBar — cert badge", () => {
  it("shows the CERTIFIED pill when certBadge is true", () => {
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} certBadge />);
    expect(screen.getByText("✓ CERTIFIED")).toBeInTheDocument();
  });

  it("hides the CERTIFIED pill by default", () => {
    render(<PropertyAddressBar activeProperty={activeProperty} properties={properties} onSelect={vi.fn()} />);
    expect(screen.queryByText("✓ CERTIFIED")).not.toBeInTheDocument();
  });
});
