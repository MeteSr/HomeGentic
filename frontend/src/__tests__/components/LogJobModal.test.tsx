/**
 * LogJobModal — real logic worth locking down:
 *   - step 0 (What): no-properties empty state; DIY vs Contractor toggle
 *     drives what step 1 asks for; insurance-relevant badge for certain
 *     service types
 *   - step 1 (Details) validation: amount required and non-negative,
 *     contractor name required unless DIY; amount converts dollars to
 *     cents; permit/warranty become undefined (not "") when blank
 *   - permit callout only shows for permit-requiring service types
 *   - success screen and "Log another" resets the form but keeps the
 *     selected property
 *   - Escape key and backdrop click both close the modal
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { LogJobModal } from "@/components/LogJobModal";
import type { Property } from "@/services/property";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@/services/job", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/job")>();
  return { ...actual, jobService: { create: mockCreate } };
});

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: vi.fn() } }));

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof LogJobModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <LogJobModal
      isOpen
      onClose={onClose}
      onSuccess={onSuccess}
      properties={[makeProperty()]}
      {...props}
    />
  );
  return { ...utils, onClose, onSuccess };
}

async function goToDetails() {
  fireEvent.click(screen.getByText("Next: Add Details →"));
  await waitFor(() => expect(screen.getByText("Save Record")).toBeInTheDocument());
}

beforeEach(() => vi.clearAllMocks());

describe("LogJobModal — visibility", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <LogJobModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} properties={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the no-properties empty state", () => {
    renderModal({ properties: [] });
    expect(screen.getByText("Add a property before logging jobs.")).toBeInTheDocument();
  });
});

describe("LogJobModal — step 0 (What)", () => {
  it("shows an insurance-relevant badge for HVAC but not for Painting", () => {
    renderModal();
    expect(screen.getByText("Insurance-relevant record")).toBeInTheDocument(); // default service type is HVAC

    fireEvent.change(screen.getByLabelText("Service Type"), { target: { value: "Painting" } });
    expect(screen.queryByText("Insurance-relevant record")).not.toBeInTheDocument();
  });

  it("defaults to Contractor (not DIY)", () => {
    renderModal();
    expect(screen.getByText("I hired a pro").closest("button")).toHaveStyle({ borderColor: "#0B0D1A" });
  });
});

describe("LogJobModal — step 1 validation", () => {
  it("requires a non-negative amount", async () => {
    renderModal();
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Cool Air Co" } });

    fireEvent.click(screen.getByText("Save Record"));

    expect(mockToastError).toHaveBeenCalledWith("Enter the amount");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("requires a contractor name unless DIY", async () => {
    renderModal();
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });

    fireEvent.click(screen.getByText("Save Record"));

    expect(mockToastError).toHaveBeenCalledWith("Enter the contractor name");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not require a contractor name for DIY", async () => {
    mockCreate.mockResolvedValue({ id: "job-1" });
    renderModal();
    fireEvent.click(screen.getByText("I did it myself"));
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "50" } });

    fireEvent.click(screen.getByText("Save Record"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(mockToastError).not.toHaveBeenCalled();
  });
});

describe("LogJobModal — submission", () => {
  it("converts dollars to cents and coerces blank optional fields to undefined", async () => {
    mockCreate.mockResolvedValue({ id: "job-1" });
    renderModal();
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Cool Air Co" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "125.50" } });

    fireEvent.click(screen.getByText("Save Record"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        contractorName: "Cool Air Co",
        amount: 12550,
        permitNumber: undefined,
        warrantyMonths: undefined,
        isDiy: false,
      })
    ));
  });

  it("shows the permit callout for HVAC but not for a non-permit service type", async () => {
    renderModal();
    await goToDetails();
    expect(screen.getByText(/HVAC work typically requires a permit/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("← Back"));
    fireEvent.change(screen.getByLabelText("Service Type"), { target: { value: "Painting" } });
    fireEvent.click(screen.getByText("Next: Add Details →"));

    await waitFor(() => expect(screen.getByText("Save Record")).toBeInTheDocument());
    expect(screen.queryByText(/typically requires a permit/)).not.toBeInTheDocument();
  });

  it("sends the trimmed permit number and parsed warranty months when provided", async () => {
    mockCreate.mockResolvedValue({ id: "job-1" });
    renderModal();
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Cool Air Co" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. HVAC-2024-0412"), { target: { value: "  HVAC-2024-0412  " } });
    fireEvent.change(screen.getByPlaceholderText("e.g. 12"), { target: { value: "24" } });

    fireEvent.click(screen.getByText("Save Record"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ permitNumber: "HVAC-2024-0412", warrantyMonths: 24 })
    ));
  });

  it("shows an error toast and stays on step 1 when the service call fails", async () => {
    mockCreate.mockRejectedValue(new Error("Network error"));
    renderModal();
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Cool Air Co" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });

    fireEvent.click(screen.getByText("Save Record"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Network error"));
    expect(screen.getByText("Save Record")).toBeInTheDocument();
  });
});

describe("LogJobModal — success screen", () => {
  it("shows the success screen and calls onSuccess after saving", async () => {
    mockCreate.mockResolvedValue({ id: "job-1" });
    const { onSuccess } = renderModal();
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Cool Air Co" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });

    fireEvent.click(screen.getByText("Save Record"));

    await waitFor(() => expect(screen.getByText("Record Saved")).toBeInTheDocument());
    expect(onSuccess).toHaveBeenCalled();
  });

  it("resets the form to step 0 when 'Log another' is clicked", async () => {
    mockCreate.mockResolvedValue({ id: "job-1" });
    renderModal();
    await goToDetails();
    fireEvent.change(screen.getByPlaceholderText("e.g. Cool Air Services LLC"), { target: { value: "Cool Air Co" } });
    fireEvent.change(screen.getByPlaceholderText("0.00"), { target: { value: "100" } });
    fireEvent.click(screen.getByText("Save Record"));
    await waitFor(() => expect(screen.getByText("Record Saved")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Log another"));

    expect(screen.getByText("What was done?")).toBeInTheDocument();
  });
});

describe("LogJobModal — dismissal", () => {
  it("closes on Escape key", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click but not on modal content click", () => {
    const { onClose, container } = renderModal();
    fireEvent.click(screen.getByText("What was done?")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstChild as Element); // backdrop is the component's root element
    expect(onClose).toHaveBeenCalled();
  });
});
