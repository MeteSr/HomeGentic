/**
 * Unit tests for AddPropertyModal component
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/services/property", () => ({
  propertyService: {
    registerProperty:      vi.fn(),
    submitVerification:    vi.fn(),
  },
}));

vi.mock("@/services/photo", () => ({
  photoService: {
    upload:    vi.fn(),
    getQuota:  vi.fn().mockResolvedValue({ used: 0, limit: 10, tier: "Free" }),
  },
}));

vi.mock("@/services/auth", () => ({
  authService: {
    completeOnboarding: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockAddProperty = vi.fn();
vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({
    addProperty: mockAddProperty,
  }),
}));

vi.mock("@/hooks/useBreakpoint", () => ({
  useBreakpoint: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  AddressAutocomplete: ({ onChange, value, id }: any) => (
    <input
      data-testid="address-autocomplete"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock("@/components/ConstructionPhotoUpload", () => ({
  ConstructionPhotoUpload: () => <div data-testid="photo-upload" />,
}));

vi.mock("@/components/PermitCoverageIndicator", () => ({
  default: ({ city }: any) => <div data-testid="permit-indicator">{city}</div>,
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error:   vi.fn(),
  },
  toast: {
    success: vi.fn(),
    error:   vi.fn(),
  },
}));

import AddPropertyModal from "@/components/AddPropertyModal";
import { propertyService } from "@/services/property";

function renderModal(open = true) {
  const onClose = vi.fn();
  render(
    <MemoryRouter>
      <AddPropertyModal open={open} onClose={onClose} />
    </MemoryRouter>
  );
  return { onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── open/closed state ─────────────────────────────────────────────────────────

describe("AddPropertyModal — open/closed", () => {
  it("renders nothing when open is false", () => {
    renderModal(false);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog when open is true", () => {
    renderModal(true);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// ── address step ──────────────────────────────────────────────────────────────

describe("AddPropertyModal — address step", () => {
  it("shows the address step heading by default", () => {
    renderModal();
    expect(screen.getByText(/Where is the home/i)).toBeInTheDocument();
  });

  it("shows required address fields", () => {
    renderModal();
    expect(screen.getByLabelText(/city/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/state/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/zip/i)).toBeInTheDocument();
  });

  it("Continue button is disabled when address fields are empty", () => {
    renderModal();
    const continueBtn = screen.getByRole("button", { name: /Continue/i });
    expect(continueBtn).toBeDisabled();
  });

  it("Continue button remains disabled with only partial address", () => {
    renderModal();
    // Fill only city
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: "Nashville" } });
    const continueBtn = screen.getByRole("button", { name: /Continue/i });
    expect(continueBtn).toBeDisabled();
  });

  it("shows permit coverage indicator once city and state are filled", () => {
    renderModal();
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: "Nashville" } });
    fireEvent.change(screen.getByLabelText(/state/i), { target: { value: "TN" } });
    expect(screen.getByTestId("permit-indicator")).toBeInTheDocument();
  });
});

// ── details step ──────────────────────────────────────────────────────────────

function fillAndAdvanceAddress() {
  // Fill all required address fields
  fireEvent.change(screen.getByTestId("address-autocomplete"), { target: { value: "123 Main St" } });
  fireEvent.change(screen.getByLabelText(/city/i), { target: { value: "Nashville" } });
  fireEvent.change(screen.getByLabelText(/state/i), { target: { value: "TN" } });
  fireEvent.change(screen.getByLabelText(/zip/i), { target: { value: "37201" } });
  fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
}

describe("AddPropertyModal — details step", () => {
  it("navigates to details step after clicking Continue with valid address", () => {
    renderModal();
    fillAndAdvanceAddress();
    expect(screen.getByText(/Year built and size/i)).toBeInTheDocument();
  });

  it("shows year built and square feet fields on details step", () => {
    renderModal();
    fillAndAdvanceAddress();
    expect(screen.getByLabelText(/year built/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/square feet/i)).toBeInTheDocument();
  });

  it("Save button is disabled when year and sqft are empty", () => {
    renderModal();
    fillAndAdvanceAddress();
    const saveBtn = screen.getByRole("button", { name: /Save property/i });
    expect(saveBtn).toBeDisabled();
  });

  it("Save button is enabled with valid year and sqft", () => {
    renderModal();
    fillAndAdvanceAddress();
    fireEvent.change(screen.getByLabelText(/year built/i), { target: { value: "1985" } });
    fireEvent.change(screen.getByLabelText(/square feet/i), { target: { value: "2000" } });
    const saveBtn = screen.getByRole("button", { name: /Save property/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it("calls propertyService.registerProperty when Save is clicked", async () => {
    (propertyService.registerProperty as any).mockResolvedValueOnce({
      id: "prop-new",
      address: "123 Main St",
      city: "Nashville",
      state: "TN",
      zipCode: "37201",
    });

    renderModal();
    fillAndAdvanceAddress();
    fireEvent.change(screen.getByLabelText(/year built/i), { target: { value: "1985" } });
    fireEvent.change(screen.getByLabelText(/square feet/i), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: /Save property/i }));

    await waitFor(() => {
      expect(propertyService.registerProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          address:    "123 Main St",
          city:       "Nashville",
          state:      "TN",
          zipCode:    "37201",
          yearBuilt:  1985,
          squareFeet: 2000,
        })
      );
    });
  });
});

// ── close button ──────────────────────────────────────────────────────────────

describe("AddPropertyModal — close button", () => {
  it("calls onClose when the × button is clicked", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
