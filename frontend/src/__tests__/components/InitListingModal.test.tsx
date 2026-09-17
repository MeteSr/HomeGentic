/**
 * InitListingModal — real logic worth locking down:
 *   - asking price must parse to a positive dollar amount; invalid/zero
 *     input blocks submission and shows an inline error
 *   - submit converts dollars to cents, trims the description to
 *     undefined when blank, calls fsboService.setFsboMode, and
 *     navigates to /my-listing/:propertyId
 *   - Draft with AI fills the description from property/job/score data
 *     after a short delay, and disables itself while drafting
 *   - backdrop click (not modal content) closes the modal
 */

import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InitListingModal from "@/components/InitListingModal";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

const { mockSetFsboMode } = vi.hoisted(() => ({ mockSetFsboMode: vi.fn() }));
vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return { ...actual, fsboService: { setFsboMode: mockSetFsboMode } };
});

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "prop-1", owner: "p-owner", address: "123 Main St", city: "Austin", state: "TX",
    zipCode: "78701", propertyType: "SingleFamily" as any, yearBuilt: 2000n, squareFeet: 2000n,
    verificationLevel: "None" as any, tier: "Free" as any, createdAt: 0n, updatedAt: 0n, isActive: true,
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof InitListingModal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <InitListingModal open onClose={onClose} property={makeProperty()} jobs={[]} score={72} {...props} />
  );
  return { ...utils, onClose };
}

beforeEach(() => vi.clearAllMocks());

describe("InitListingModal — visibility", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <InitListingModal open={false} onClose={vi.fn()} property={makeProperty()} jobs={[]} score={72} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InitListingModal — price validation", () => {
  it("shows an error and blocks submission for a blank price", () => {
    renderModal();
    fireEvent.click(screen.getByText("Start My Listing →"));
    expect(screen.getByText("Enter a valid asking price.")).toBeInTheDocument();
    expect(mockSetFsboMode).not.toHaveBeenCalled();
  });

  it("shows an error for a zero or negative price", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Start My Listing →"));
    expect(screen.getByText("Enter a valid asking price.")).toBeInTheDocument();
    expect(mockSetFsboMode).not.toHaveBeenCalled();
  });

  it("clears the error once the price is edited again", () => {
    renderModal();
    fireEvent.click(screen.getByText("Start My Listing →"));
    expect(screen.getByText("Enter a valid asking price.")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "425000" } });
    expect(screen.queryByText("Enter a valid asking price.")).not.toBeInTheDocument();
  });
});

describe("InitListingModal — submission", () => {
  it("converts dollars to cents and navigates to the new listing", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "425,000" } });
    fireEvent.click(screen.getByText("Start My Listing →"));

    expect(mockSetFsboMode).toHaveBeenCalledWith("prop-1", 42_500_000, undefined);
    expect(mockNavigate).toHaveBeenCalledWith("/my-listing/prop-1");
  });

  it("trims and includes a non-blank description", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "425000" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe your home/), { target: { value: "  Lovely home  " } });
    fireEvent.click(screen.getByText("Start My Listing →"));

    expect(mockSetFsboMode).toHaveBeenCalledWith("prop-1", 42_500_000, "Lovely home");
  });
});

describe("InitListingModal — Draft with AI", () => {
  it("fills the description after the drafting delay and disables itself meanwhile", () => {
    vi.useFakeTimers();
    try {
      renderModal({
        jobs: [{ serviceType: "Roofing", verified: true } as Job],
        score: 88,
      });

      fireEvent.click(screen.getByText("Draft with AI"));
      expect(screen.getByText("Drafting…")).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(600); });

      expect(screen.getByText(/HomeGentic score: 88\/100/)).toBeInTheDocument();
      expect(screen.getByText(/1 verified maintenance job on record — including Roofing/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("InitListingModal — dismissal", () => {
  it("closes on backdrop click but not on modal content click", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("List Your Home")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog")); // backdrop
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the Cancel button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
