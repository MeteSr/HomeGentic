/**
 * FsboListingManagerPage (/my-listing/:propertyId) with the real FSBO services
 * on their in-memory store: state comes from what the services saved, and every
 * action is checked by reading the services back.
 *
 *  - not activated / setup in progress / live, from the saved record
 *  - readiness uses the property's real score and verified jobs (not 0)
 *  - live: stats, price edit + history, score show/hide, showings, offers,
 *    agent handoff, take down (deletes showings and offers)
 */
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";

const { mockProperty, mockJobs, mockCreateBidRequest } = vi.hoisted(() => ({
  mockProperty: {
    id: "prop-1", owner: "2vxsx-fae", address: "12 Elm St", city: "Orlando", state: "FL", zipCode: "32801",
    propertyType: "SingleFamily", yearBuilt: 1998n, squareFeet: 1850n, verificationLevel: "Basic",
    tier: "Pro", createdAt: 0n, updatedAt: 0n, isActive: true,
  },
  mockJobs: { value: [] as any[] },
  mockCreateBidRequest: vi.fn(async () => ({})),
}));

vi.mock("@/services/property", () => ({ propertyService: { getProperty: vi.fn(async () => mockProperty) } }));
vi.mock("@/services/job", () => ({ jobService: { getByProperty: vi.fn(async () => mockJobs.value) } }));
vi.mock("@/services/report", () => ({ reportService: { listShareLinks: vi.fn(async () => []) } }));
vi.mock("@/services/scoreService", () => ({ computeScore: vi.fn(() => 78) }));
vi.mock("@/components/ListingPhotoManager", () => ({ default: () => <div data-testid="photo-manager" /> }));
vi.mock("@/store/authStore", () => ({
  useAuthStore: (sel: any) => sel({ profile: { email: "seller@example.com" } }),
}));
vi.mock("@/services/listing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/listing")>();
  return {
    ...actual,
    listingService: {
      ...actual.listingService,
      getPanoramas:     vi.fn(async () => []),
      createBidRequest: mockCreateBidRequest,
    },
  };
});

import FsboListingManagerPage from "@/pages/FsboListingManagerPage";
import { fsboService } from "@/services/fsbo";
import { showingRequestService } from "@/services/showingRequest";
import { fsboOfferService } from "@/services/fsboOffer";

const verifiedJob = (id: string) => ({ id, propertyId: "prop-1", verified: true, serviceType: "HVAC", date: "2024-01-01" });

function renderAt(propertyId = "prop-1") {
  return render(
    <MemoryRouter initialEntries={[`/my-listing/${propertyId}`]}>
      <Routes><Route path="/my-listing/:propertyId" element={<FsboListingManagerPage />} /></Routes>
    </MemoryRouter>
  );
}

async function seedLive(price = 42_500_000) {
  const draft = await fsboService.saveDraft("prop-1", price, "Corner lot", 3);
  await fsboService.goLive(mockProperty as any, draft, { bedrooms: 3, bathrooms: 2 });
}

beforeEach(() => {
  vi.clearAllMocks();
  fsboService.__reset();
  showingRequestService.__reset();
  fsboOfferService.__reset();
  mockJobs.value = [verifiedJob("j1"), verifiedJob("j2"), verifiedJob("j3")];
});

describe("listing state", () => {
  it("not activated: CTA and the wizard, which can start because readiness uses real data", async () => {
    renderAt();
    expect(await screen.findByTestId("activate-listing-cta")).toBeInTheDocument();
    expect(screen.getByTestId("listing-status-badge")).toHaveTextContent(/not listed/i);
    // score 78 and 3 verified jobs → Ready, so Get Started is enabled
    await waitFor(() => expect(screen.getByRole("button", { name: /activate fsbo/i })).toBeEnabled());
    expect(screen.queryByTestId("listing-stats-bar")).not.toBeInTheDocument();
  });

  it("is Not Ready when the property has too few verified jobs", async () => {
    mockJobs.value = [verifiedJob("j1")];
    renderAt();
    expect(await screen.findByText("Not Ready")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /activate fsbo/i })).toBeDisabled();
  });

  it("setup in progress: resumes the wizard at the saved step and can discard it", async () => {
    await fsboService.saveDraft("prop-1", 40_000_000, undefined, 2);
    renderAt();
    expect(await screen.findByText(/activating — in progress/i)).toBeInTheDocument();
    expect(screen.getByText("Step 2 — Review Your HomeGentic Report")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("discard-setup-btn"));
    expect(await screen.findByTestId("activate-listing-cta")).toBeInTheDocument();
    expect(await fsboService.getRecord("prop-1")).toBeNull();
  });

  it("live: dashboard with badge, days on market and the public link", async () => {
    await seedLive();
    renderAt();
    expect(await screen.findByTestId("listing-stats-bar")).toBeInTheDocument();
    expect(screen.getByTestId("listing-status-badge")).toHaveTextContent(/live/i);
    expect(screen.getByTestId("days-on-market")).toHaveTextContent(/1 day on market/);
    expect(screen.getByTestId("view-public-listing-link")).toHaveAttribute("href", "/for-sale/prop-1");
    expect(screen.getByTestId("stat-list-price")).toHaveTextContent("$425,000");
  });
});

describe("live dashboard actions", () => {
  it("saves a new price and shows the history from the canister", async () => {
    await seedLive();
    renderAt();
    const input = await screen.findByTestId("price-edit-input");
    expect(input).toHaveValue(425000);
    fireEvent.change(input, { target: { value: "410000" } });
    fireEvent.click(screen.getByTestId("save-price-btn"));
    await waitFor(() => expect(screen.getByTestId("stat-list-price")).toHaveTextContent("$410,000"));
    const history = screen.getByTestId("price-history-list");
    expect(within(history).getByText("$410,000")).toBeInTheDocument();
    expect(within(history).getByText("$425,000")).toBeInTheDocument();
    expect((await fsboService.getRecord("prop-1"))?.listPriceCents).toBe(41_000_000);
  });

  it("ignores an invalid price", async () => {
    await seedLive();
    renderAt();
    fireEvent.change(await screen.findByTestId("price-edit-input"), { target: { value: "-1" } });
    fireEvent.click(screen.getByTestId("save-price-btn"));
    expect((await fsboService.getRecord("prop-1"))?.listPriceCents).toBe(42_500_000);
  });

  it("hides and shows the score on the public listing", async () => {
    await seedLive();
    renderAt();
    const toggle = await screen.findByTestId("score-optin-toggle");
    expect(toggle).toHaveTextContent(/score shown/i);
    fireEvent.click(toggle);
    await waitFor(() => expect(toggle).toHaveTextContent(/score hidden/i));
    expect(await fsboService.isScoreHidden("prop-1")).toBe(true);
  });

  it("lists buyers' showing requests and counts them", async () => {
    await seedLive();
    await showingRequestService.create({ propertyId: "prop-1", name: "Ana", contact: "ana@example.com", preferredTime: "Sat" });
    renderAt();
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByTestId("stat-showings")).toHaveTextContent("1");
  });

  it("counts logged offers", async () => {
    await seedLive();
    await fsboOfferService.logOffer("prop-1", {
      buyerName: "Ben", offerAmountCents: 41_000_000, earnestMoneyCents: 0, contingencies: [], closeDateMs: 0, hasEscalationClause: false,
    });
    renderAt();
    await waitFor(() => expect(screen.getByTestId("stat-offers")).toHaveTextContent("1"));
  });

  it("Find me an agent opens a Bid to List request with the FSBO history (10.7)", async () => {
    await seedLive();
    renderAt();
    fireEvent.click(await screen.findByRole("button", { name: /find me an agent/i }));
    await waitFor(() => expect(mockCreateBidRequest).toHaveBeenCalled());
    const arg = (mockCreateBidRequest.mock.calls[0] as any[])[0];
    expect(arg).toMatchObject({ propertyId: "prop-1", address: "12 Elm St", desiredSalePrice: 42_500_000, homeownerEmail: "seller@example.com" });
    expect(arg.notes).toMatch(/\$425,000.*Days on market: 1.*Offers received: 0/);
    expect(await screen.findByText(/agent request sent/i)).toBeInTheDocument();
  });

  it("take down asks first, then deletes the listing with its showings and offers", async () => {
    await seedLive();
    await showingRequestService.create({ propertyId: "prop-1", name: "Ana", contact: "ana@example.com", preferredTime: "Sat" });
    renderAt();
    fireEvent.click(await screen.findByTestId("take-down-btn"));
    const dialog = screen.getByTestId("take-down-confirm-dialog");
    expect(dialog).toHaveTextContent(/will be deleted/i);

    fireEvent.click(screen.getByTestId("take-down-cancel"));
    expect(screen.queryByTestId("take-down-confirm-dialog")).not.toBeInTheDocument();
    expect(await fsboService.getPublicListing("prop-1")).not.toBeNull();

    fireEvent.click(screen.getByTestId("take-down-btn"));
    fireEvent.click(screen.getByTestId("take-down-confirm"));
    expect(await screen.findByTestId("activate-listing-cta")).toBeInTheDocument();
    expect(await fsboService.getPublicListing("prop-1")).toBeNull();
    expect(await showingRequestService.getByProperty("prop-1")).toEqual([]);
  });
});
