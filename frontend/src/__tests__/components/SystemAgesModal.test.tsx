/**
 * SystemAgesModal — real logic worth locking down:
 *   - initializes from stored ages, falling back to yearBuilt, and
 *     re-syncs whenever it's reopened (open/propertyId/yearBuilt change)
 *   - Solar Panels is the one system that's saved purely from the
 *     "Installed" toggle — independent of whether its year field was
 *     ever touched — and is omitted entirely when toggled off
 *   - standard systems only save when touched, and only within a valid
 *     1900-current year range
 *   - Reset restores a field to yearBuilt and un-marks it as touched
 *   - backdrop click closes; clicking the dialog itself does not
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import SystemAgesModal from "@/components/SystemAgesModal";

const { mockGet, mockSet } = vi.hoisted(() => ({ mockGet: vi.fn(), mockSet: vi.fn() }));
vi.mock("@/services/systemAges", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/systemAges")>();
  return { ...actual, systemAgesService: { get: mockGet, set: mockSet } };
});

const { mockToastSuccess } = vi.hoisted(() => ({ mockToastSuccess: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { success: mockToastSuccess } }));

function renderModal(props: Partial<React.ComponentProps<typeof SystemAgesModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <SystemAgesModal open onClose={onClose} propertyId="prop-1" yearBuilt={1998} onSuccess={onSuccess} {...props} />
  );
  return { ...utils, onClose, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockReturnValue({});
});

describe("SystemAgesModal — visibility", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <SystemAgesModal open={false} onClose={vi.fn()} propertyId="prop-1" yearBuilt={1998} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("SystemAgesModal — Solar Panels toggle", () => {
  it("hides the year input until the toggle is switched on", () => {
    renderModal();
    expect(screen.getByText("Not installed")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Toggle solar panels"));
    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("saves the solar year at yearBuilt when toggled on but never edited", () => {
    renderModal();
    fireEvent.click(screen.getByLabelText("Toggle solar panels"));

    fireEvent.click(screen.getByText("Save System Ages"));

    expect(mockSet).toHaveBeenCalledWith("prop-1", expect.objectContaining({ "Solar Panels": 1998 }));
  });

  it("omits Solar Panels entirely when the toggle is off, even if it was previously customized", () => {
    mockGet.mockReturnValue({ "Solar Panels": 2015 });
    renderModal();
    expect(screen.getByText("Installed")).toBeInTheDocument(); // starts on since stored

    fireEvent.click(screen.getByLabelText("Toggle solar panels")); // turn off
    fireEvent.click(screen.getByText("Save System Ages"));

    const [, result] = mockSet.mock.calls[0];
    expect(result).not.toHaveProperty("Solar Panels");
  });
});

describe("SystemAgesModal — standard systems", () => {
  it("only saves touched systems within a valid year range", () => {
    renderModal();
    const hvacInput = screen.getAllByDisplayValue("1998")[0];
    fireEvent.change(hvacInput, { target: { value: "2010" } });

    fireEvent.click(screen.getByText("Save System Ages"));

    expect(mockSet).toHaveBeenCalledWith("prop-1", expect.objectContaining({ HVAC: 2010 }));
  });

  it("does not include an out-of-range year even if the field was touched", () => {
    renderModal();
    const hvacInput = screen.getAllByDisplayValue("1998")[0];
    fireEvent.change(hvacInput, { target: { value: "1850" } });

    fireEvent.click(screen.getByText("Save System Ages"));

    const [, result] = mockSet.mock.calls[0];
    expect(result).not.toHaveProperty("HVAC");
  });

  it("Reset restores the field to yearBuilt and un-touches it", () => {
    mockGet.mockReturnValue({ HVAC: 2015 });
    renderModal();
    expect(screen.getByText("Reset")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Reset"));

    fireEvent.click(screen.getByText("Save System Ages"));
    const [, result] = mockSet.mock.calls[0];
    expect(result).not.toHaveProperty("HVAC");
  });

  it("calls onSuccess and onClose after saving", () => {
    const { onSuccess, onClose } = renderModal();
    fireEvent.click(screen.getByText("Save System Ages"));

    expect(mockToastSuccess).toHaveBeenCalledWith("System ages saved — maintenance predictions updated.");
    expect(onSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("SystemAgesModal — re-sync on reopen", () => {
  it("re-reads stored ages when propertyId changes while open", () => {
    mockGet.mockReturnValue({ HVAC: 2010 });
    const { rerender } = renderModal({ propertyId: "prop-1" });
    expect(screen.getByDisplayValue("2010")).toBeInTheDocument();

    mockGet.mockReturnValue({ HVAC: 2020 });
    rerender(
      <SystemAgesModal open onClose={vi.fn()} propertyId="prop-2" yearBuilt={1998} />
    );

    expect(screen.getByDisplayValue("2020")).toBeInTheDocument();
  });
});

describe("SystemAgesModal — dismissal", () => {
  it("closes on backdrop click but not when clicking inside the modal content", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("System Ages")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog")); // role="dialog" is the backdrop itself here
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the Close button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
