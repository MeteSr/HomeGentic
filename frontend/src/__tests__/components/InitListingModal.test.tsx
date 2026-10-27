/**
 * InitListingModal — real logic worth locking down:
 *   - asking price must parse to a positive dollar amount; invalid/zero
 *     input blocks submission and shows an inline error
 *   - submit converts dollars to cents, saves the setup with
 *     fsboService.saveDraft (real in-memory store) and navigates to
 *     /my-listing/:propertyId; a failed save shows the error
 *   - "Fill in from my records" writes a description from property, job
 *     and score data (a template, not AI)
 *   - backdrop click (not modal content) closes the modal
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import InitListingModal from "@/components/InitListingModal";
import type { Property } from "@/services/property";
import type { Job } from "@/services/job";

import { fsboService } from "@/services/fsbo";

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

beforeEach(() => { vi.clearAllMocks(); fsboService.__reset(); });

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
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows an error for a zero or negative price", () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "0" } });
    fireEvent.click(screen.getByText("Start My Listing →"));
    expect(screen.getByText("Enter a valid asking price.")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
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
  it("saves the setup in cents (next step: report) and opens My Listing", async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "425,000" } });
    fireEvent.click(screen.getByText("Start My Listing →"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith("/my-listing/prop-1"));
    expect(await fsboService.getRecord("prop-1")).toMatchObject({ listPriceCents: 42_500_000, step: 2, isFsbo: false, description: undefined });
  });

  it("keeps a trimmed, non-blank description", async () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "425000" } });
    fireEvent.change(screen.getByPlaceholderText(/Describe your home/), { target: { value: "  Lovely home  " } });
    fireEvent.click(screen.getByText("Start My Listing →"));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect((await fsboService.getRecord("prop-1"))?.description).toBe("Lovely home");
  });

  it("shows the error and stays open when saving fails", async () => {
    const spy = vi.spyOn(fsboService, "saveDraft").mockRejectedValueOnce(new Error("You don't have permission to do that."));
    renderModal();
    fireEvent.change(screen.getByPlaceholderText("e.g. 425000"), { target: { value: "425000" } });
    fireEvent.click(screen.getByText("Start My Listing →"));
    expect(await screen.findByRole("alert")).toHaveTextContent(/permission/);
    expect(mockNavigate).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("InitListingModal — Fill in from my records", () => {
  it("writes a starting description from the property and its verified jobs, at once", () => {
    renderModal({
      jobs: [{ serviceType: "Roofing", verified: true } as Job],
      score: 88,
    });
    expect(screen.queryByText(/draft with ai/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Fill in from my records"));
    expect(screen.getByText(/HomeGentic score: 88\/100\./)).toBeInTheDocument();
    expect(screen.getByText(/1 verified maintenance job on record — including Roofing/)).toBeInTheDocument();
    expect(screen.queryByText(/verified on-chain/)).not.toBeInTheDocument();
  });
});

describe("InitListingModal — dismissal", () => {
  it("closes on backdrop click but not on modal content click", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("List Your Home")); // inner content
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog").parentElement!); // backdrop wraps the dialog panel
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the Cancel button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
  });
});
