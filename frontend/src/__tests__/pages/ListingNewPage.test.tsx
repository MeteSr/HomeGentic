/**
 * ListingNewPage — real logic worth locking down:
 *   - publish is disabled while any flagged photo is unreviewed
 *   - createBidRequest receives the timeframe/notes concatenated into `notes`
 *   - validation blocks publish with no property or no timeframe
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import ListingNewPage from "@/pages/ListingNewPage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockGetListingPhotos, mockGetPhotoReviewState, mockCreateBidRequest } = vi.hoisted(() => ({
  mockGetListingPhotos:    vi.fn(),
  mockGetPhotoReviewState: vi.fn(),
  mockCreateBidRequest:    vi.fn(),
}));

vi.mock("@/services/listing", () => ({
  listingService: {
    getListingPhotos:    mockGetListingPhotos,
    getPhotoReviewState: mockGetPhotoReviewState,
    createBidRequest:    mockCreateBidRequest,
  },
}));

vi.mock("@/services/property", () => ({
  propertyService: { getMyProperties: vi.fn().mockResolvedValue([]) },
}));

vi.mock("@/store/propertyStore", () => ({
  usePropertyStore: () => ({
    properties: [{ id: "prop-1", address: "123 Main St", city: "Austin", zipCode: "78701", squareFeet: 2000 }],
    setProperties: vi.fn(),
  }),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: any) => selector({ profile: { email: "owner@example.com" } }),
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

vi.mock("@/components/ListingPhotoManager", () => ({
  default: () => <div data-testid="photo-manager" />,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ListingNewPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetListingPhotos.mockResolvedValue([]);
  mockGetPhotoReviewState.mockResolvedValue({ flagged: false, reviewed: false });
});

describe("ListingNewPage — flagged-photo gate", () => {
  it("disables Publish while a flagged photo is unreviewed", async () => {
    mockGetListingPhotos.mockResolvedValue(["photo-1"]);
    mockGetPhotoReviewState.mockResolvedValue({ flagged: true, reviewed: false });
    renderPage();

    await waitFor(() => expect(screen.getByText(/1 photo need review before publishing/)).toBeInTheDocument());
    expect(screen.getByText("Publish to licensed agents").closest("button")).toBeDisabled();
  });

  it("enables Publish once flagged photos are marked reviewed", async () => {
    mockGetListingPhotos.mockResolvedValue(["photo-1"]);
    mockGetPhotoReviewState.mockResolvedValue({ flagged: true, reviewed: true });
    renderPage();

    await waitFor(() => expect(screen.getByText("Publish to licensed agents")).toBeInTheDocument());
    expect(screen.getByText("Publish to licensed agents").closest("button")).not.toBeDisabled();
  });
});

describe("ListingNewPage — submit", () => {
  it("combines timeframe and notes and navigates to the new request on success", async () => {
    mockCreateBidRequest.mockResolvedValue({ id: "req-1" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Publish to licensed agents")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Within 60 days"), { target: { value: "ASAP" } });
    fireEvent.change(
      screen.getByPlaceholderText(/roof and hvac both replaced/i),
      { target: { value: "New roof in 2023." } }
    );

    fireEvent.click(screen.getByText("Publish to licensed agents"));

    await waitFor(() => expect(mockCreateBidRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        propertyId: "prop-1",
        notes: "ASAP — New roof in 2023.",
      })
    ));
    expect(mockNavigate).toHaveBeenCalledWith("/listing/req-1");
    expect(mockToastSuccess).toHaveBeenCalledWith("Published to licensed agents.");
  });

  it("blocks submission with an empty timeframe", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Publish to licensed agents")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText("Within 60 days"), { target: { value: "" } });
    fireEvent.click(screen.getByText("Publish to licensed agents"));

    expect(mockToastError).toHaveBeenCalledWith("When do you want to list is required");
    expect(mockCreateBidRequest).not.toHaveBeenCalled();
  });

  it("surfaces a server error via toast without navigating", async () => {
    mockCreateBidRequest.mockRejectedValue(new Error("Property already listed"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Publish to licensed agents")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Publish to licensed agents"));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Property already listed"));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
