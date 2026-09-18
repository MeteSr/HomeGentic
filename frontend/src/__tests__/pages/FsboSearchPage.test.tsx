/**
 * FsboSearchPage — real logic worth locking down (applyFilters/sort is
 * internal to the module, so it's exercised through the real UI controls):
 *   - the search box filters by address/city/state/zip substring match
 *   - min/max price filters exclude listings outside the entered range
 *   - the sort select re-orders listings by price or score
 *   - "No listings match your filters" shows only when the filtered set is empty
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import FsboSearchPage from "@/pages/FsboSearchPage";
import type { FsboPublicListing } from "@/services/fsbo";

const { mockListPublicFsbos } = vi.hoisted(() => ({ mockListPublicFsbos: vi.fn() }));
vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return { ...actual, listPublicFsbos: mockListPublicFsbos };
});

function makeListing(overrides: Partial<FsboPublicListing> = {}): FsboPublicListing {
  return {
    propertyId: "p1", listPriceCents: 40_000_000, activatedAt: Date.now(),
    address: "1 Main St", city: "Austin", state: "TX", zipCode: "78701",
    propertyType: "SingleFamily" as any, yearBuilt: 2000, squareFeet: 2000,
    bedrooms: 3, bathrooms: 2, verificationLevel: "None" as any,
    verifiedJobCount: 5, hasPublicReport: true,
    ...overrides,
  };
}

function renderPage() {
  return render(<MemoryRouter><FsboSearchPage /></MemoryRouter>);
}

beforeEach(() => vi.clearAllMocks());

describe("FsboSearchPage — search filter", () => {
  it("filters listings by address/city/zip substring match", async () => {
    mockListPublicFsbos.mockResolvedValue([
      makeListing({ propertyId: "p1", address: "1 Main St", city: "Austin", zipCode: "78701" }),
      makeListing({ propertyId: "p2", address: "2 Oak Ave", city: "Dallas", zipCode: "75201" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Search by city, state, or zip code"), { target: { value: "dallas" } });

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(1));
    expect(screen.getByTestId("listing-address")).toHaveTextContent("2 Oak Ave");
  });

  it("shows the no-results message when nothing matches", async () => {
    mockListPublicFsbos.mockResolvedValue([makeListing({ address: "1 Main St", city: "Austin" })]);
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Search by city, state, or zip code"), { target: { value: "nowhere" } });

    expect(await screen.findByText("No listings match your filters")).toBeInTheDocument();
  });
});

describe("FsboSearchPage — price filters", () => {
  it("excludes listings below the minimum price", async () => {
    mockListPublicFsbos.mockResolvedValue([
      makeListing({ propertyId: "cheap", listPriceCents: 10_000_000, address: "Cheap House" }),
      makeListing({ propertyId: "expensive", listPriceCents: 90_000_000, address: "Expensive House" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Minimum price in dollars"), { target: { value: "500000" } });

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(1));
    expect(screen.getByTestId("listing-address")).toHaveTextContent("Expensive House");
  });

  it("excludes listings above the maximum price", async () => {
    mockListPublicFsbos.mockResolvedValue([
      makeListing({ propertyId: "cheap", listPriceCents: 10_000_000, address: "Cheap House" }),
      makeListing({ propertyId: "expensive", listPriceCents: 90_000_000, address: "Expensive House" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Maximum price in dollars"), { target: { value: "500000" } });

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(1));
    expect(screen.getByTestId("listing-address")).toHaveTextContent("Cheap House");
  });
});

describe("FsboSearchPage — sorting", () => {
  it("sorts listings by price ascending when 'price_asc' is selected", async () => {
    mockListPublicFsbos.mockResolvedValue([
      makeListing({ propertyId: "expensive", listPriceCents: 90_000_000, address: "Expensive House" }),
      makeListing({ propertyId: "cheap", listPriceCents: 10_000_000, address: "Cheap House" }),
    ]);
    renderPage();

    await waitFor(() => expect(screen.getAllByTestId("listing-address")).toHaveLength(2));
    fireEvent.change(screen.getByTestId("sort-select"), { target: { value: "price_asc" } });

    await waitFor(() => {
      const addresses = screen.getAllByTestId("listing-address").map((el) => el.textContent);
      expect(addresses[0]).toBe("Cheap House");
    });
  });
});
