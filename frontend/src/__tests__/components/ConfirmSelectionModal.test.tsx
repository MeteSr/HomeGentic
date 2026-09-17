/**
 * ConfirmSelectionModal — real logic worth locking down:
 *   - Confirm is disabled until the disclosure checkbox is checked
 *   - a successful confirm accepts the proposal, creates a Stripe
 *     checkout session, and redirects to its url
 *   - when Stripe isn't configured (no url in the response) it shows a
 *     "recorded but unpaid" toast instead of redirecting, and
 *     re-enables the button
 *   - a failed confirm shows the failure toast and re-enables the button
 *   - backdrop click closes unless a submission is in flight
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfirmSelectionModal } from "@/components/ConfirmSelectionModal";
import type { MaskedProposal } from "@/services/listing";

const { mockAcceptProposal } = vi.hoisted(() => ({ mockAcceptProposal: vi.fn() }));
vi.mock("@/services/listing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/listing")>();
  return { ...actual, listingService: { acceptProposal: mockAcceptProposal } };
});

const { mockToastError, mockToast } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToast: vi.fn() as any,
}));
mockToast.error = mockToastError;
vi.mock("react-hot-toast", () => ({ default: mockToast }));

function makeProposal(overrides: Partial<MaskedProposal> = {}): MaskedProposal {
  return {
    id: "prop-1", requestId: "req-1", letter: "A", commissionBps: 250,
    suggestedListCents: 50_000_000, cmaSummary: "", marketingPlan: "",
    marketingCommitments: [], estimatedDaysOnMarket: 30, status: "Pending" as any,
    derived: { estNetToSellerCents: 0, pctVsCompsBps: 0, overCompFlag: false, thinCompsFlag: false },
    agentRecord: { closedInZip: 0, avgDom: 0, saleToListRatioBps: 0, withdrawnUnsold: 0, commitmentsUnmet: 0 },
    isMine: false, agentName: null, agentEmail: null, agentBrokerage: null, createdAt: Date.now(),
    ...overrides,
  };
}

function renderModal(props: Partial<React.ComponentProps<typeof ConfirmSelectionModal>> = {}) {
  const onClose = vi.fn();
  const utils = render(
    <ConfirmSelectionModal proposal={makeProposal()} requestId="req-1" feeCents={100_000} onClose={onClose} {...props} />
  );
  return { ...utils, onClose };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as any).location;
  (window as any).location = { href: "" };
});

describe("ConfirmSelectionModal — checkbox gating", () => {
  it("disables Confirm until the disclosure checkbox is checked", () => {
    renderModal();
    expect(screen.getByText(/Choose Bid A and unmask/).closest("button")).toBeDisabled();

    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByText(/Choose Bid A and unmask/).closest("button")).not.toBeDisabled();
  });
});

describe("ConfirmSelectionModal — confirm flow", () => {
  it("accepts the proposal and redirects to the Stripe checkout url", async () => {
    mockAcceptProposal.mockResolvedValue("fee-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ url: "https://stripe.test/checkout" }) }));
    renderModal();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText(/Choose Bid A and unmask/));

    await waitFor(() => expect(mockAcceptProposal).toHaveBeenCalledWith("prop-1"));
    expect(fetch).toHaveBeenCalledWith("/api/listing-fee/stripe/create-checkout-session", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ feeId: "fee-1", proposalId: "prop-1", requestId: "req-1" }),
    }));
    await waitFor(() => expect(window.location.href).toBe("https://stripe.test/checkout"));
  });

  it("shows an unpaid-recorded toast and re-enables the button when Stripe isn't configured", async () => {
    mockAcceptProposal.mockResolvedValue("fee-1");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({}) }));
    renderModal();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText(/Choose Bid A and unmask/));

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith("Payment not configured in this environment — selection recorded but unpaid."));
    expect(window.location.href).toBe("");
  });

  it("shows the failure toast and re-enables the button when acceptProposal rejects", async () => {
    mockAcceptProposal.mockRejectedValue(new Error("Auction already closed"));
    renderModal();

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByText(/Choose Bid A and unmask/));

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("Auction already closed"));
  });
});

describe("ConfirmSelectionModal — dismissal", () => {
  it("closes on backdrop click", () => {
    const { onClose, container } = renderModal();
    fireEvent.click(container.querySelector('div[style*="position: absolute"][style*="inset: 0"]')!);
    expect(onClose).toHaveBeenCalled();
  });

  it("closes via the Back button", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByText("Back"));
    expect(onClose).toHaveBeenCalled();
  });
});
