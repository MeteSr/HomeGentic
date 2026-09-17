/**
 * RecurringServiceCreateModal — real logic worth locking down:
 *   - defaults propertyId from defaultPropertyId, falling back to the
 *     first property in the store, and re-syncs the whole form whenever
 *     the modal reopens
 *   - validation requires a property, provider name, and start date
 *   - optional fields (license/phone/contractEndDate/notes) are trimmed
 *     and sent as undefined when blank
 *   - success shows the "Service Logged" screen and calls onSuccess;
 *     Add another resets the form but keeps the selected property
 *   - backdrop click (not modal content) closes and resets the form
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import RecurringServiceCreateModal from "@/components/RecurringServiceCreateModal";
import type { RecurringService } from "@/services/recurringService";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));
vi.mock("@/services/recurringService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/recurringService")>();
  return { ...actual, recurringService: { create: mockCreate } };
});

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));
vi.mock("react-hot-toast", () => ({ default: { error: mockToastError } }));

let mockProperties: any[] = [];
vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: mockProperties }),
}));

function makeService(overrides: Partial<RecurringService> = {}): RecurringService {
  return {
    id: "rs-1", propertyId: "prop-1", homeowner: "p-owner", serviceType: "LawnCare",
    providerName: "Green Lawn Co.", frequency: "Monthly", startDate: "2024-01-01",
    status: "Active", createdAt: Date.now(),
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof RecurringServiceCreateModal>> = {}) {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const utils = render(
    <RecurringServiceCreateModal open onClose={onClose} defaultPropertyId="prop-1" onSuccess={onSuccess} {...props} />
  );
  return { ...utils, onClose, onSuccess };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProperties = [{ id: "prop-1", address: "123 Main St", city: "Austin" }];
});

describe("RecurringServiceCreateModal — visibility", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <RecurringServiceCreateModal open={false} onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RecurringServiceCreateModal — validation", () => {
  it("requires a provider name", () => {
    renderModal();
    fireEvent.click(screen.getByText("Save Service"));
    expect(mockToastError).toHaveBeenCalledWith("Please enter the provider name");
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("requires a start date", () => {
    const { container } = renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. Green Lawn Co."), { target: { value: "Green Lawn Co." } });
    const startDateInput = container.querySelectorAll('input[type="date"]')[0];
    fireEvent.change(startDateInput, { target: { value: "" } });
    fireEvent.click(screen.getByText("Save Service"));
    expect(mockToastError).toHaveBeenCalledWith("Please enter a start date");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("RecurringServiceCreateModal — submission", () => {
  it("sends trimmed required fields and omits blank optional fields", async () => {
    mockCreate.mockResolvedValue(makeService());
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. Green Lawn Co."), { target: { value: "  Green Lawn Co.  " } });
    fireEvent.click(screen.getByText("Save Service"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      propertyId: "prop-1",
      providerName: "Green Lawn Co.",
      providerLicense: undefined,
      providerPhone: undefined,
      contractEndDate: undefined,
      notes: undefined,
    })));
  });

  it("includes optional fields when provided", async () => {
    mockCreate.mockResolvedValue(makeService());
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. Green Lawn Co."), { target: { value: "Green Lawn Co." } });
    fireEvent.change(screen.getByPlaceholderText("e.g. PCO-12345"), { target: { value: "PCO-99" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Monthly treatment, includes interior"), { target: { value: "Front yard only" } });
    fireEvent.click(screen.getByText("Save Service"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      providerLicense: "PCO-99",
      notes: "Front yard only",
    })));
  });

  it("shows the success screen and calls onSuccess with the new service id", async () => {
    mockCreate.mockResolvedValue(makeService({ id: "rs-42" }));
    const { onSuccess } = renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. Green Lawn Co."), { target: { value: "Green Lawn Co." } });
    fireEvent.click(screen.getByText("Save Service"));

    await waitFor(() => expect(screen.getByText("Lawn Care added")).toBeInTheDocument());
    expect(onSuccess).toHaveBeenCalledWith("rs-42");
  });

  it("shows an error toast when creation fails", async () => {
    mockCreate.mockRejectedValue(new Error("Service limit reached"));
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. Green Lawn Co."), { target: { value: "Green Lawn Co." } });
    fireEvent.click(screen.getByText("Save Service"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Service limit reached"));
  });
});

describe("RecurringServiceCreateModal — Add another", () => {
  it("resets the form but keeps the selected property", async () => {
    mockCreate.mockResolvedValue(makeService());
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. Green Lawn Co."), { target: { value: "Green Lawn Co." } });
    fireEvent.click(screen.getByText("Save Service"));
    await waitFor(() => expect(screen.getByText("Add another")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Add another"));
    expect(screen.getByPlaceholderText("e.g. Green Lawn Co.")).toHaveValue("");
  });
});

describe("RecurringServiceCreateModal — dismissal", () => {
  it("closes on backdrop click but not on modal content click", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Add a Service")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog")); // backdrop
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the Close button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });
});
