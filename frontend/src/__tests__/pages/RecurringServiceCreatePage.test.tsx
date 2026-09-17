/**
 * RecurringServiceCreatePage — real logic worth locking down:
 *   - optional fields (license/phone/end date/notes) become undefined when
 *     blank, never empty strings, before being sent to recurringService.create
 *   - validation blocks submit for a missing provider name
 *   - success screen shows the created service type and auto-redirects
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import RecurringServiceCreatePage from "@/pages/RecurringServiceCreatePage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@/services/recurringService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/recurringService")>();
  return { ...actual, recurringService: { create: mockCreate } };
});

// Stable reference required — usePropertyStore is called every render; a new
// array each call changes the [properties] useEffect dep and causes infinite re-renders.
const STABLE_PROPS = [{ id: "prop-1", address: "123 Main St" }];
vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({ properties: STABLE_PROPS }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastError } = vi.hoisted(() => ({ mockToastError: vi.fn() }));

vi.mock("react-hot-toast", () => ({
  default: { error: mockToastError, success: vi.fn() },
}));

const PROVIDER_PLACEHOLDER = "e.g. Green Lawn Co.";

function renderPage() {
  return render(
    <MemoryRouter>
      <RecurringServiceCreatePage />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("RecurringServiceCreatePage — optional field coercion", () => {
  it("sends undefined for blank optional fields, not empty strings", async () => {
    mockCreate.mockResolvedValue({ id: "svc-1" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Save Service")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(PROVIDER_PLACEHOLDER), { target: { value: "Lawn Care Co" } });
    fireEvent.click(screen.getByText("Save Service"));

    await waitFor(() => expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        providerName: "Lawn Care Co",
        providerLicense: undefined,
        providerPhone: undefined,
        contractEndDate: undefined,
        notes: undefined,
      })
    ));
  });
});

describe("RecurringServiceCreatePage — validation", () => {
  it("blocks submission with no provider name", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Save Service")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Save Service"));

    expect(mockToastError).toHaveBeenCalledWith("Please enter the provider name");
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("RecurringServiceCreatePage — success flow", () => {
  // Real timers throughout: testing-library's waitFor polls via setTimeout,
  // which fake timers would also intercept and never advance — simpler and
  // more reliable to just wait out the real 3s redirect than fight that.
  it("shows the success screen and redirects to /dashboard after 3s", async () => {
    mockCreate.mockResolvedValue({ id: "svc-1" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Save Service")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(PROVIDER_PLACEHOLDER), { target: { value: "Lawn Care Co" } });
    fireEvent.click(screen.getByText("Save Service"));

    await waitFor(() => expect(screen.getByText("Lawn Care added")).toBeInTheDocument());
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/dashboard"), { timeout: 4000 });
  }, 8000);
});
