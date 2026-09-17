/**
 * AgentBidFormPage — real logic worth locking down:
 *   - estimated net to seller = suggestedCents * (10000 - commissionBps) / 10000
 *   - over-comps flag at >4% above the local median, matching the
 *     seller-facing copy shown to the agent up front
 *   - validation blocks submit for a missing commission/price/commitment
 *   - submitProposal receives the parsed cents/bps values
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AgentBidFormPage from "@/pages/AgentBidFormPage";
import type { BidRequestSummary, CompsConfig } from "@/services/listing";
import type { AgentProfile } from "@/services/agent";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate, useParams: () => ({ id: "l1" }) };
});

const { mockGetOpenBidRequests, mockGetCompsMedian, mockSubmitProposal, mockGetMyProfile } = vi.hoisted(() => ({
  mockGetOpenBidRequests: vi.fn(),
  mockGetCompsMedian:     vi.fn(),
  mockSubmitProposal:     vi.fn(),
  mockGetMyProfile:       vi.fn(),
}));

vi.mock("@/services/listing", () => ({
  listingService: {
    getOpenBidRequests: mockGetOpenBidRequests,
    getCompsMedian:     mockGetCompsMedian,
    submitProposal:     mockSubmitProposal,
  },
}));

vi.mock("@/services/agent", () => ({
  agentService: { getMyProfile: mockGetMyProfile },
}));

vi.mock("@/components/Layout", () => ({
  Layout: ({ children }: any) => <div data-testid="layout">{children}</div>,
}));

const { mockToastSuccess, mockToastError } = vi.hoisted(() => ({
  mockToastSuccess: vi.fn(),
  mockToastError:   vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: mockToastSuccess, error: mockToastError },
}));

const LISTING: BidRequestSummary = {
  id: "l1", city: "Austin", county: "Travis", zipCode: "78701",
  beds: 3, baths: 2, sqft: 1800, targetListDate: Date.now(), desiredSalePrice: null,
  notes: "", windowDays: 14 as any, bidDeadline: Date.now() + 86_400_000,
  status: "Open" as any, proposalCount: 0, openSlots: 5,
} as BidRequestSummary;

const PROFILE: AgentProfile = {
  id: "agent-1", name: "Jane", brokerage: "ABC", licenseNumber: "FL1", licenseState: "FL",
  county: "Travis", serviceCities: [], bio: "", phone: "", email: "",
  avgDaysOnMarket: 21, listingsLast12Months: 8, isVerified: true, lastVerifiedAt: Date.now(), cardOnFile: true,
  createdAt: Date.now(), updatedAt: Date.now(),
} as AgentProfile;

function renderPage() {
  return render(
    <MemoryRouter>
      <AgentBidFormPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOpenBidRequests.mockResolvedValue([LISTING]);
  mockGetMyProfile.mockResolvedValue(PROFILE);
  mockGetCompsMedian.mockResolvedValue(null);
});

describe("AgentBidFormPage — comps math", () => {
  it("computes estimated net to seller from commission and suggested price", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit a sealed bid")).toBeInTheDocument());

    const inputs = document.querySelectorAll('input[inputmode="decimal"]');
    fireEvent.change(inputs[0], { target: { value: "3" } });        // commission %
    fireEvent.change(inputs[1], { target: { value: "400000" } });   // suggested list $

    // net = 40,000,000 cents * (10000-300)/10000 = 38,800,000 cents = $38,800,000
    await waitFor(() => expect(screen.getByText("$38,800,000")).toBeInTheDocument());
  });

  it("flags the price as over comps when more than 4% above the local median", async () => {
    const comps: CompsConfig = { medianCents: 40_000_000, saleCount: 12 };
    mockGetCompsMedian.mockResolvedValue(comps);
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit a sealed bid")).toBeInTheDocument());

    const inputs = document.querySelectorAll('input[inputmode="decimal"]');
    fireEvent.change(inputs[1], { target: { value: "425000" } }); // 42.5M vs 40M median -> +6.25%, over 4% threshold

    await waitFor(() => expect(screen.getByText("Yours is flagged.", { exact: false })).toBeInTheDocument());
    expect(screen.getByText("+6.3% OVER COMPS")).toBeInTheDocument();
  });

  it("does not flag a price within the 4% comps threshold", async () => {
    const comps: CompsConfig = { medianCents: 40_000_000, saleCount: 12 };
    mockGetCompsMedian.mockResolvedValue(comps);
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit a sealed bid")).toBeInTheDocument());

    const inputs = document.querySelectorAll('input[inputmode="decimal"]');
    fireEvent.change(inputs[1], { target: { value: "410000" } }); // +2.5%, under threshold

    await waitFor(() => expect(screen.getByText("Yours is not flagged.", { exact: false })).toBeInTheDocument());
    expect(screen.getByText("AT COMPS")).toBeInTheDocument();
  });
});

describe("AgentBidFormPage — validation", () => {
  it("blocks submission with no commission entered", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit sealed bid")).toBeInTheDocument());

    const inputs = document.querySelectorAll('input[inputmode="decimal"]');
    fireEvent.change(inputs[0], { target: { value: "" } });

    fireEvent.click(screen.getByText("Submit sealed bid"));
    expect(mockToastError).toHaveBeenCalledWith("Enter a commission");
    expect(mockSubmitProposal).not.toHaveBeenCalled();
  });

  it("blocks submission with no suggested list price", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit sealed bid")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Submit sealed bid"));
    expect(mockToastError).toHaveBeenCalledWith("Enter a suggested list price");
    expect(mockSubmitProposal).not.toHaveBeenCalled();
  });
});

describe("AgentBidFormPage — submit", () => {
  it("submits the parsed commission bps and price cents, then navigates to My bids", async () => {
    mockSubmitProposal.mockResolvedValue({ id: "proposal-1" });
    renderPage();
    await waitFor(() => expect(screen.getByText("Submit sealed bid")).toBeInTheDocument());

    const inputs = document.querySelectorAll('input[inputmode="decimal"]');
    fireEvent.change(inputs[0], { target: { value: "2.5" } });
    fireEvent.change(inputs[1], { target: { value: "400000" } });

    fireEvent.click(screen.getByText("Submit sealed bid"));

    await waitFor(() => expect(mockSubmitProposal).toHaveBeenCalledWith("l1", expect.objectContaining({
      commissionBps: 250,
      suggestedListCents: 40_000_000,
    })));
    expect(mockToastSuccess).toHaveBeenCalledWith("Sealed bid submitted.");
    expect(mockNavigate).toHaveBeenCalledWith("/agents/bids");
  });
});
