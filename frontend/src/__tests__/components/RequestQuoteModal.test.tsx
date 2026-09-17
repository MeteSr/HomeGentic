/**
 * RequestQuoteModal — real logic worth locking down:
 *   - no-properties empty state
 *   - prefill applies serviceType/description when the modal opens
 *   - validation: property and a non-blank description are required
 *   - urgency selection updates the highlighted option
 *   - success calls onSuccess with the new request id; failure shows a
 *     toast and keeps the modal open
 *   - Escape key and backdrop click both close the modal
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { RequestQuoteModal } from "@/components/RequestQuoteModal";
import type { Property } from "@/services/property";

const { mockCreateRequest } = vi.hoisted(() => ({ mockCreateRequest: vi.fn() }));
vi.mock("@/services/quote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/quote")>();
  return { ...actual, quoteService: { createRequest: mockCreateRequest } };
});

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError, success: mockToastSuccess } }));

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof RequestQuoteModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <RequestQuoteModal isOpen onClose={onClose} onSuccess={onSuccess} properties={[makeProperty()]} {...props} />
  );
  return { ...utils, onClose, onSuccess };
}

beforeEach(() => vi.clearAllMocks());

describe("RequestQuoteModal — visibility", () => {
  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <RequestQuoteModal isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} properties={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the no-properties empty state", () => {
    renderModal({ properties: [] });
    expect(screen.getByText("Add a property before requesting quotes.")).toBeInTheDocument();
  });
});

describe("RequestQuoteModal — prefill", () => {
  it("applies a prefilled service type and description", () => {
    renderModal({ prefill: { serviceType: "Roofing", description: "Leak near chimney" } });
    expect(screen.getByDisplayValue("Roofing")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Leak near chimney")).toBeInTheDocument();
  });
});

describe("RequestQuoteModal — validation", () => {
  it("requires a non-blank description", () => {
    renderModal();
    fireEvent.click(screen.getByText("Send Quote Request"));
    expect(mockToastError).toHaveBeenCalledWith("Describe the work needed");
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

});

describe("RequestQuoteModal — urgency selection", () => {
  it("defaults to Medium and highlights the selected option", () => {
    renderModal();
    expect(screen.getByText("Medium").closest("div")).toHaveStyle({ borderColor: "#2B34FF" });

    fireEvent.click(screen.getByText("Emergency"));
    expect(screen.getByText("Emergency").closest("div")).toHaveStyle({ borderColor: "#2B34FF" });
    expect(screen.getByText("Medium").closest("div")).not.toHaveStyle({ borderColor: "#2B34FF" });
  });
});

describe("RequestQuoteModal — submission", () => {
  it("sends the request and calls onSuccess with the new id", async () => {
    mockCreateRequest.mockResolvedValue({ id: "quote-1" });
    const { onSuccess } = renderModal();

    fireEvent.change(screen.getByPlaceholderText(/Describe the issue or project/), { target: { value: "Leak near chimney" } });
    fireEvent.click(screen.getByText("Emergency"));
    fireEvent.click(screen.getByText("Send Quote Request"));

    await waitFor(() => expect(mockCreateRequest).toHaveBeenCalledWith({
      propertyId: "prop-1", serviceType: "HVAC", urgency: "emergency", description: "Leak near chimney",
    }));
    expect(mockToastSuccess).toHaveBeenCalledWith("Quote request sent to contractors!");
    expect(onSuccess).toHaveBeenCalledWith("quote-1");
  });

  it("shows an error toast and keeps the modal open when the request fails", async () => {
    mockCreateRequest.mockRejectedValue(new Error("Network error"));
    const { onClose } = renderModal();

    fireEvent.change(screen.getByPlaceholderText(/Describe the issue or project/), { target: { value: "Leak" } });
    fireEvent.click(screen.getByText("Send Quote Request"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Network error"));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("RequestQuoteModal — dismissal", () => {
  it("closes on Escape key", () => {
    const { onClose } = renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on backdrop click but not on modal content click", () => {
    const { onClose, container } = renderModal();
    fireEvent.click(screen.getByText("Request a Quote")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstChild as Element); // backdrop is the root element
    expect(onClose).toHaveBeenCalled();
  });
});
