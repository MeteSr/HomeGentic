/**
 * GiftPage — Stripe gift subscription flow tests
 * Covers: renders, step navigation, Stripe redirect on submit, error handling.
 */
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi, describe, it, expect, beforeEach } from "vitest";
import GiftPage from "@/pages/GiftPage";
import * as paymentService from "@/services/payment";

// ── mock paymentService ───────────────────────────────────────────────────────
vi.mock("@/services/payment", async (importOriginal) => {
  const actual = await importOriginal<typeof paymentService>();
  return {
    ...actual,
    paymentService: {
      ...actual.paymentService,
      startStripeCheckout: vi.fn(),
    },
  };
});

const mockStartCheckout = vi.mocked(paymentService.paymentService.startStripeCheckout);

function renderPage() {
  return render(
    <MemoryRouter>
      <GiftPage />
    </MemoryRouter>
  );
}

describe("GiftPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders step 1 — tier selection", () => {
    renderPage();
    expect(screen.getByText(/Give the gift of a/i)).toBeTruthy();
    expect(screen.getAllByText(/Pro/i).length).toBeGreaterThan(0);
  });

  it("advances to recipient step on Continue", async () => {
    renderPage();
    // Step 1 is the single "Gift Pro" card — click it to advance
    fireEvent.click(screen.getByRole("button", { name: /gift pro/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Alex Johnson/i)).toBeTruthy();
    });
  });

  it("shows validation error when recipient email is empty", async () => {
    renderPage();
    // step 1 → step 2: click the tier card
    fireEvent.click(screen.getByRole("button", { name: /gift pro/i }));
    await waitFor(() => screen.getByPlaceholderText(/Alex Johnson/i));
    // try to advance without filling required fields (NavButtons "Continue")
    fireEvent.click(screen.getAllByText(/Continue/i)[0]);
    await waitFor(() => {
      expect(screen.getAllByText(/required/i).length).toBeGreaterThan(0);
    });
  });

  it("calls startStripeCheckout with gift metadata on review submit", async () => {
    mockStartCheckout.mockResolvedValue(undefined);
    renderPage();

    // step 1: click "Gift Pro" to select Pro and advance
    fireEvent.click(screen.getByRole("button", { name: /gift pro/i }));
    await waitFor(() => screen.getByPlaceholderText(/Alex Johnson/i));

    // step 2: fill recipient
    fireEvent.change(screen.getByPlaceholderText(/Alex Johnson/i), { target: { value: "Jane Doe" } });
    fireEvent.change(screen.getByPlaceholderText(/alex@email\.com/i), { target: { value: "jane@example.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Sarah Miller/i), { target: { value: "Bob Agent" } });
    fireEvent.change(screen.getByPlaceholderText(/sarah@realty\.com/i), { target: { value: "bob@realty.com" } });
    fireEvent.click(screen.getAllByText(/Continue/i)[0]);

    // step 3: message → continue
    await waitFor(() => screen.getByText(/Gift message/i));
    fireEvent.click(screen.getAllByText(/Continue/i)[0]);

    // step 4: review → submit
    await waitFor(() => screen.getByText(/Pay & Send Gift/i));
    fireEvent.click(screen.getByText(/Pay & Send Gift/i));

    await waitFor(() => {
      expect(mockStartCheckout).toHaveBeenCalledOnce();
      const [tier, billing, gift] = mockStartCheckout.mock.calls[0];
      expect(tier).toBe("Pro");
      expect(billing).toBe("Yearly");
      expect(gift?.recipientEmail).toBe("jane@example.com");
      expect(gift?.recipientName).toBe("Jane Doe");
    });
  });

  it("shows error message when startStripeCheckout throws", async () => {
    mockStartCheckout.mockRejectedValue(new Error("Stripe not configured"));
    renderPage();

    // Navigate to review step — click "Gift Pro" to advance from step 1
    fireEvent.click(screen.getByRole("button", { name: /gift pro/i }));
    await waitFor(() => screen.getByPlaceholderText(/Alex Johnson/i));
    fireEvent.change(screen.getByPlaceholderText(/Alex Johnson/i), { target: { value: "Jane" } });
    fireEvent.change(screen.getByPlaceholderText(/alex@email\.com/i), { target: { value: "j@j.com" } });
    fireEvent.change(screen.getByPlaceholderText(/Sarah Miller/i), { target: { value: "Bob" } });
    fireEvent.change(screen.getByPlaceholderText(/sarah@realty\.com/i), { target: { value: "b@b.com" } });
    fireEvent.click(screen.getAllByText(/Continue/i)[0]);
    await waitFor(() => screen.getByText(/Gift message/i));
    fireEvent.click(screen.getAllByText(/Continue/i)[0]);
    await waitFor(() => screen.getByText(/Pay & Send Gift/i));

    await act(async () => { fireEvent.click(screen.getByText(/Pay & Send Gift/i)); });

    await waitFor(() => {
      expect(screen.getByText(/Stripe not configured/i)).toBeTruthy();
    });
  });
});
