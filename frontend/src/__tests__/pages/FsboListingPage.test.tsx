/**
 * FsboListingPage (/for-sale/:propertyId, public) — everything shown comes
 * from the live listing on the listing canister (fsboService.getPublicListing),
 * plus the public report for the address. Showing requests go through
 * showingRequestService, which notifies the seller on the canister side.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { FsboPublicListing } from "@/services/fsbo";

const { mockGetPublicListing, mockFindPublicReport, mockCreate } = vi.hoisted(() => ({
  mockGetPublicListing: vi.fn(),
  mockFindPublicReport: vi.fn(),
  mockCreate:           vi.fn(),
}));

vi.mock("@/services/fsbo", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/fsbo")>();
  return { ...actual, fsboService: { getPublicListing: mockGetPublicListing } };
});
vi.mock("@/services/report", () => ({ reportService: { findPublicReport: mockFindPublicReport } }));
vi.mock("@/services/showingRequest", () => ({ showingRequestService: { create: mockCreate } }));
vi.mock("@/services/listing", () => ({ listingService: { getPanoramas: vi.fn(async () => []) } }));
vi.mock("@/components/ListingPhotoManager", () => ({ default: () => <div data-testid="photo-gallery" /> }));

import FsboListingPage, { ShowingRequestForm } from "@/pages/FsboListingPage";

const LISTING: FsboPublicListing = {
  propertyId: "prop-1", listPriceCents: 48_500_000, activatedAt: Date.now() - 86_400_000,
  address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701",
  propertyType: "SingleFamily", yearBuilt: 2001, squareFeet: 2400, bedrooms: 4, bathrooms: 3,
  verificationLevel: "Basic", score: 82, verifiedJobCount: 3, description: "Shady backyard",
  hasPublicReport: true, systemHighlights: ["Roof replaced 2021"],
};

function renderPage(id = "prop-1") {
  return render(
    <MemoryRouter initialEntries={[`/for-sale/${id}`]}>
      <Routes><Route path="/for-sale/:propertyId" element={<FsboListingPage />} /></Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPublicListing.mockResolvedValue(LISTING);
  mockFindPublicReport.mockResolvedValue({ token: "tok-1", address: "123 Maple Street", city: "Austin", state: "TX", zipCode: "78701" });
  mockCreate.mockImplementation(async (input) => ({ ...input, id: "sr-1", createdAt: Date.now(), status: "Pending" }));
});

describe("FsboListingPage — not listed", () => {
  it("shows Loading… then Not Listed For Sale when there's no live listing", async () => {
    mockGetPublicListing.mockResolvedValue(null);
    renderPage();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(await screen.findByText("Not Listed For Sale")).toBeInTheDocument();
    expect(mockGetPublicListing).toHaveBeenCalledWith("prop-1");
  });
});

describe("FsboListingPage — listed (10.3.1 / 10.3.2)", () => {
  it("shows price, address and home details from the listing", async () => {
    renderPage();
    expect(await screen.findByText("$485,000")).toBeInTheDocument();
    expect(screen.getByText("123 Maple Street")).toBeInTheDocument();
    expect(screen.getByText("Austin, TX 78701")).toBeInTheDocument();
    for (const v of ["Single Family", "4", "3", "2001", "2,400"]) expect(screen.getAllByText(v).length).toBeGreaterThan(0);
    expect(screen.getByText("Shady backyard")).toBeInTheDocument();
    expect(screen.getByTestId("photo-gallery")).toBeInTheDocument();
  });

  it("shows the canister's score and verified job count, with honest wording", async () => {
    renderPage();
    const badge = await screen.findByRole("region", { name: "HomeGentic Score" });
    expect(badge).toHaveTextContent("82");
    expect(badge).toHaveTextContent(/calculated by homegentic from this home's records/i);
    expect(screen.getByText(/3 verified/)).toBeInTheDocument();
    expect(screen.getByText("Roof replaced 2021")).toBeInTheDocument();
  });

  it("hides the score section when the seller hid the score", async () => {
    mockGetPublicListing.mockResolvedValue({ ...LISTING, score: undefined });
    renderPage();
    await screen.findByText("$485,000");
    expect(screen.queryByRole("region", { name: "HomeGentic Score" })).not.toBeInTheDocument();
  });

  it("sets the page title and og tags from the listing (10.3.5)", async () => {
    renderPage();
    await waitFor(() => expect(document.title).toMatch(/123 Maple Street.*For Sale by Owner/));
    await waitFor(() => {
      const og = document.querySelector('meta[property="og:description"]');
      expect(og?.getAttribute("content")).toMatch(/\$485,000.*Austin/);
    });
  });
});

describe("FsboListingPage — report link (10.3.3)", () => {
  it("links the public report found for the listing's address", async () => {
    renderPage();
    const link = await screen.findByRole("link", { name: /view full maintenance history/i });
    expect(link).toHaveAttribute("href", "/report/tok-1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(mockFindPublicReport).toHaveBeenCalledWith("123 Maple Street, Austin, TX 78701");
  });

  it("doesn't look up a report when the listing has none", async () => {
    mockGetPublicListing.mockResolvedValue({ ...LISTING, hasPublicReport: false });
    renderPage();
    await screen.findByText("$485,000");
    expect(mockFindPublicReport).not.toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: /view full maintenance history/i })).not.toBeInTheDocument();
  });

  it("shows no link when no public report matches", async () => {
    mockFindPublicReport.mockResolvedValue(null);
    renderPage();
    await screen.findByText("$485,000");
    await waitFor(() => expect(mockFindPublicReport).toHaveBeenCalled());
    expect(screen.queryByRole("link", { name: /view full maintenance history/i })).not.toBeInTheDocument();
  });
});

describe("ShowingRequestForm (10.3.4)", () => {
  function fill(contact = "jane@example.com") {
    fireEvent.change(screen.getByLabelText(/your name/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByLabelText(/email or phone/i), { target: { value: contact } });
    fireEvent.change(screen.getByLabelText(/preferred showing time/i), { target: { value: "Sat am" } });
    fireEvent.submit(screen.getByRole("form", { name: "Showing Request" }));
  }

  it("rejects an invalid contact", () => {
    render(<ShowingRequestForm propertyId="prop-1" />);
    fill("nope");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(screen.getByText(/enter a valid email or phone/i)).toBeInTheDocument();
  });

  it("sends the request and says the seller will reply directly", async () => {
    render(<ShowingRequestForm propertyId="prop-1" />);
    expect(screen.getByText(/we pass your name, contact and preferred time to the seller/i)).toBeInTheDocument();
    fill();
    expect(await screen.findByText(/the seller has your contact details and will reply to you directly/i)).toBeInTheDocument();
    expect(mockCreate).toHaveBeenCalledWith({ propertyId: "prop-1", name: "Jane", contact: "jane@example.com", preferredTime: "Sat am" });
  });

  it("shows the canister's error and keeps the form", async () => {
    mockCreate.mockRejectedValue(new Error("You already have requests open for this home"));
    render(<ShowingRequestForm propertyId="prop-1" />);
    fill();
    expect(await screen.findByRole("alert")).toHaveTextContent(/already have requests open/i);
    expect(screen.getByRole("form", { name: "Showing Request" })).toBeInTheDocument();
  });
});
