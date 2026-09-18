/**
 * GiftPage — real logic worth locking down:
 *   - the recipient step blocks advancing until name/email fields validate
 *   - a successful checkout call advances to the "done" confirmation step
 *   - a failed checkout call shows the error and does not advance
 *   - the review step's gift message character counter reflects real length
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import GiftPage from "@/pages/GiftPage";

const { mockStartStripeCheckout } = vi.hoisted(() => ({ mockStartStripeCheckout: vi.fn() }));
vi.mock("@/services/payment", () => ({ paymentService: { startStripeCheckout: mockStartStripeCheckout } }));

function renderPage() {
  return render(<MemoryRouter><GiftPage /></MemoryRouter>);
}

function goToRecipientStep() {
  fireEvent.click(screen.getByText("Gift Pro"));
}

function fillRecipientStep() {
  fireEvent.change(screen.getByPlaceholderText("Alex Johnson"), { target: { value: "Alex Johnson" } });
  fireEvent.change(screen.getByPlaceholderText("alex@email.com"), { target: { value: "alex@email.com" } });
  fireEvent.change(screen.getByPlaceholderText("Sarah Miller"), { target: { value: "Sarah Miller" } });
  fireEvent.change(screen.getByPlaceholderText("sarah@realty.com"), { target: { value: "sarah@realty.com" } });
}

beforeEach(() => vi.clearAllMocks());

describe("GiftPage — recipient step validation", () => {
  it("does not advance past the recipient step when fields are invalid", () => {
    renderPage();
    goToRecipientStep();
    fireEvent.click(screen.getByText("Continue"));
    // still on recipient step
    expect(screen.getByPlaceholderText("Alex Johnson")).toBeInTheDocument();
    expect(screen.getAllByText("Required").length).toBeGreaterThan(0);
  });

  it("rejects an invalid email format", () => {
    renderPage();
    goToRecipientStep();
    fireEvent.change(screen.getByPlaceholderText("Alex Johnson"), { target: { value: "Alex Johnson" } });
    fireEvent.change(screen.getByPlaceholderText("alex@email.com"), { target: { value: "not-an-email" } });
    fireEvent.change(screen.getByPlaceholderText("Sarah Miller"), { target: { value: "Sarah Miller" } });
    fireEvent.change(screen.getByPlaceholderText("sarah@realty.com"), { target: { value: "sarah@realty.com" } });
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Enter a valid email")).toBeInTheDocument();
  });

  it("advances to the message step once all fields are valid", () => {
    renderPage();
    goToRecipientStep();
    fillRecipientStep();
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText(/Gift message/)).toBeInTheDocument();
  });
});

describe("GiftPage — message step", () => {
  it("shows the live character count for the gift message", () => {
    renderPage();
    goToRecipientStep();
    fillRecipientStep();
    fireEvent.click(screen.getByText("Continue"));

    const textarea = screen.getByPlaceholderText(/Congratulations on the new home/);
    fireEvent.change(textarea, { target: { value: "Welcome home!" } });
    expect(screen.getByText("13/280")).toBeInTheDocument();
  });
});

describe("GiftPage — checkout submission", () => {
  function goToReviewStep() {
    goToRecipientStep();
    fillRecipientStep();
    fireEvent.click(screen.getByText("Continue")); // -> message
    fireEvent.click(screen.getByText("Continue")); // -> review
  }

  it("advances to the done step after a successful checkout call", async () => {
    mockStartStripeCheckout.mockResolvedValue(undefined);
    renderPage();
    goToReviewStep();
    fireEvent.click(screen.getByText("Pay & Send Gift"));

    await waitFor(() => expect(screen.getByText("Your gift is on its way.")).toBeInTheDocument());
    expect(mockStartStripeCheckout).toHaveBeenCalledWith(
      "Pro", "Yearly",
      expect.objectContaining({ recipientEmail: "alex@email.com", recipientName: "Alex Johnson" }),
    );
  });

  it("shows the error message and stays on review when checkout fails", async () => {
    mockStartStripeCheckout.mockRejectedValue(new Error("Card declined"));
    renderPage();
    goToReviewStep();
    fireEvent.click(screen.getByText("Pay & Send Gift"));

    expect(await screen.findByText("Card declined")).toBeInTheDocument();
    expect(screen.queryByText("Your gift is on its way.")).not.toBeInTheDocument();
  });
});
