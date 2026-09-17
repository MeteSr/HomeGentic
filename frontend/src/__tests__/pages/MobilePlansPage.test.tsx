/**
 * MobilePlansPage — real logic worth locking down:
 *   - pre-selects the plan from a ?tier= query param, falling back to
 *     Pro when the param names an unknown tier
 *   - Back on the confirm step returns to plan selection instead of
 *     navigating away; Back on plan selection navigates(-1)
 *   - Continue advances to the confirm step
 *   - Pay calls startStripeCheckout with the selected tier/cycle and
 *     shows the redirecting state while in flight
 *   - a failed checkout shows an error and re-enables the Pay button
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { MemoryRouter } from "react-router-dom";
import MobilePlansPage from "@/pages/MobilePlansPage";

const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const { mockStartStripeCheckout } = vi.hoisted(() => ({ mockStartStripeCheckout: vi.fn() }));
vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/payment")>();
  return { ...actual, paymentService: { startStripeCheckout: mockStartStripeCheckout } };
});

function renderAt(path = "/plans") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobilePlansPage />
    </MemoryRouter>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("MobilePlansPage — plan pre-selection", () => {
  it("pre-selects Pro by default", () => {
    renderAt("/plans");
    expect(screen.getByText("Continue with Pro")).toBeInTheDocument();
  });

  it("falls back to Pro for an unknown ?tier= value", () => {
    renderAt("/plans?tier=NotARealTier");
    expect(screen.getByText("Continue with Pro")).toBeInTheDocument();
  });
});

describe("MobilePlansPage — navigation", () => {
  it("navigates back (-1) from the plan-selection step", () => {
    renderAt();
    fireEvent.click(screen.getByText("Back"));
    expect(mockNavigate).toHaveBeenCalledWith(-1);
  });

  it("advances to the confirm step on Continue", () => {
    renderAt();
    fireEvent.click(screen.getByText("Continue with Pro"));
    expect(screen.getByText("STEP 2 OF 2 · CONFIRM ORDER")).toBeInTheDocument();
  });

  it("returns to plan selection (not away from the page) when Back is clicked on confirm", () => {
    renderAt();
    fireEvent.click(screen.getByText("Continue with Pro"));
    expect(screen.getByText("STEP 2 OF 2 · CONFIRM ORDER")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Plans"));
    expect(screen.getByText("STEP 1 OF 2 · CHOOSE A PLAN")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe("MobilePlansPage — checkout", () => {
  it("starts a Stripe checkout for the selected tier and yearly cycle", async () => {
    mockStartStripeCheckout.mockImplementation(() => new Promise(() => {})); // never resolves (real redirect)
    renderAt();
    fireEvent.click(screen.getByText("Continue with Pro"));
    fireEvent.click(screen.getByText("Pay $59 with Stripe"));

    await waitFor(() => expect(mockStartStripeCheckout).toHaveBeenCalledWith("Pro", "Yearly"));
    expect(screen.getByText("Redirecting to payment…")).toBeInTheDocument();
  });

  it("shows an error and re-enables Pay when checkout fails", async () => {
    mockStartStripeCheckout.mockRejectedValue(new Error("Card declined"));
    renderAt();
    fireEvent.click(screen.getByText("Continue with Pro"));
    fireEvent.click(screen.getByText("Pay $59 with Stripe"));

    await waitFor(() => expect(screen.getByText("Card declined")).toBeInTheDocument());
    expect(screen.getByText("Pay $59 with Stripe")).toBeInTheDocument();
    expect(screen.getByText("Pay $59 with Stripe").closest("button")).not.toBeDisabled();
  });

  it("shows a generic error message when the rejection isn't an Error instance", async () => {
    mockStartStripeCheckout.mockRejectedValue("network down");
    renderAt();
    fireEvent.click(screen.getByText("Continue with Pro"));
    fireEvent.click(screen.getByText("Pay $59 with Stripe"));

    await waitFor(() => expect(screen.getByText("Payment failed. Please try again.")).toBeInTheDocument());
  });
});
