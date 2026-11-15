/**
 * Paying a contractor in the app. The homeowner's panel on an accepted quote
 * puts the bank price first and shows the card price as the higher one (a
 * saving for paying by bank, never a surcharge), says a bank payment reaches
 * the contractor once it clears, and shows where the payment stands. The
 * contractor's box in Settings sets up payouts through Stripe.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PayJobPanel, PayoutSetupBox } from "@/components/JobPaymentPanels";
import type { JobPaymentView } from "@/services/jobPayments";

const m = vi.hoisted(() => ({
  getJobPayment: vi.fn(),
  getPayoutReady: vi.fn(),
  getMyPayoutAccount: vi.fn(),
  startJobPayment: vi.fn(),
  startPayoutOnboarding: vi.fn(),
}));
vi.mock("@/services/jobPayments", async (orig) => ({ ...(await orig<any>()), ...m }));

const assign = vi.fn();
const PRO = "aaaaa-aa";
const payment = (over: Partial<JobPaymentView> = {}): JobPaymentView => ({
  quoteId: "q1",
  method: "bank",
  status: "processing",
  bidCents: 120_000,
  amountCents: 120_000,
  updatedAt: Date.now(),
  ...over,
});

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  assign.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign, origin: "https://app.test", href: "https://app.test/quotes/r1", search: "" },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
});

const renderPay = () =>
  render(<PayJobPanel quoteId="q1" requestId="r1" contractor={PRO} bidCents={120_000} contractorName="Ace HVAC" />);

describe("PayJobPanel", () => {
  it("puts the bank price first and the card price second, framed as a saving", async () => {
    m.getJobPayment.mockResolvedValue(null);
    m.getPayoutReady.mockResolvedValue(new Map([[PRO, true]]));
    renderPay();
    await screen.findByText(/pay ace hvac in the app/i);
    const bank = screen.getByRole("radio", { name: /bank.*\$1,200\.00/i });
    const card = screen.getByRole("radio", { name: /card.*\$1,236\.15/i });
    expect(bank).toBeChecked();
    expect(card).not.toBeChecked();
    expect(screen.getByText(/paying by bank saves you \$36\.15/i)).toBeInTheDocument();
    expect(screen.getByText(/once it clears, about 4 business days/i)).toBeInTheDocument();
    expect(screen.queryByText(/surcharge/i)).not.toBeInTheDocument();
  });

  it("opens Stripe with the chosen method and comes back to this quote", async () => {
    m.getJobPayment.mockResolvedValue(null);
    m.getPayoutReady.mockResolvedValue(new Map([[PRO, true]]));
    m.startJobPayment.mockResolvedValue("https://checkout.stripe.com/x");
    renderPay();
    fireEvent.click(await screen.findByRole("radio", { name: /card/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue to stripe/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://checkout.stripe.com/x"));
    expect(m.startJobPayment).toHaveBeenCalledWith("q1", "card", "https://app.test/quotes/r1");
  });

  it("shows the Worker's message when Stripe can't be opened", async () => {
    m.getJobPayment.mockResolvedValue(null);
    m.getPayoutReady.mockResolvedValue(new Map([[PRO, true]]));
    m.startJobPayment.mockRejectedValue(new Error("Your payment for this job is already being processed."));
    renderPay();
    fireEvent.click(await screen.findByRole("button", { name: /continue to stripe/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/already being processed/);
    expect(assign).not.toHaveBeenCalled();
  });

  it("says when the contractor hasn't set up payments in HomeGentic", async () => {
    m.getJobPayment.mockResolvedValue(null);
    m.getPayoutReady.mockResolvedValue(new Map([[PRO, false]]));
    renderPay();
    expect(await screen.findByText(/ace hvac hasn't set up payments in homegentic yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue to stripe/i })).not.toBeInTheDocument();
  });

  it("shows a bank payment on its way, a finished payment, and a failed one with the choice again", async () => {
    m.getPayoutReady.mockResolvedValue(new Map([[PRO, true]]));
    m.getJobPayment.mockResolvedValue(payment());
    const { unmount } = renderPay();
    expect(await screen.findByText(/your bank payment of \$1,200\.00 is on its way/i)).toBeInTheDocument();
    expect(screen.getByText(/once it clears, about 4 business days/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue to stripe/i })).not.toBeInTheDocument();
    unmount();

    m.getJobPayment.mockResolvedValue(payment({ status: "paid", method: "card", amountCents: 123_615 }));
    const second = renderPay();
    expect(await screen.findByText(/you paid \$1,236\.15 by card/i)).toBeInTheDocument();
    second.unmount();

    m.getJobPayment.mockResolvedValue(payment({ status: "failed" }));
    renderPay();
    expect(await screen.findByText(/your last payment didn't go through/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /continue to stripe/i })).toBeInTheDocument();
  });

  it("after Stripe sends the homeowner back, says the payment can take a minute to show", async () => {
    window.location.search = "?payment=done";
    m.getPayoutReady.mockResolvedValue(new Map([[PRO, true]]));
    m.getJobPayment.mockResolvedValue(payment({ status: "started" }));
    renderPay();
    expect(await screen.findByText(/stripe has your payment/i)).toBeInTheDocument();
  });
});

describe("PayoutSetupBox", () => {
  it("offers to set up payouts and opens Stripe, coming back to Settings", async () => {
    m.getMyPayoutAccount.mockResolvedValue(null);
    m.startPayoutOnboarding.mockResolvedValue("https://connect.stripe.com/x");
    render(<PayoutSetupBox />);
    expect(await screen.findByText(/get paid in the app/i)).toBeInTheDocument();
    expect(screen.getByText(/once it clears, about 4 business days/i)).toBeInTheDocument();
    expect(screen.getByText(/3% referral fee comes out of the payment/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /set up payouts/i }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://connect.stripe.com/x"));
    expect(m.startPayoutOnboarding).toHaveBeenCalledWith("https://app.test/settings?tab=subscription");
  });

  it("asks to finish setup while Stripe still needs details", async () => {
    m.getMyPayoutAccount.mockResolvedValue({ ready: false, payoutsEnabled: false });
    render(<PayoutSetupBox />);
    expect(await screen.findByRole("button", { name: /finish setting up payouts/i })).toBeInTheDocument();
  });

  it("says homeowners can pay once Stripe can send money", async () => {
    m.getMyPayoutAccount.mockResolvedValue({ ready: true, payoutsEnabled: true });
    render(<PayoutSetupBox />);
    expect(await screen.findByText(/homeowners can pay you in the app/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /set up payouts/i })).not.toBeInTheDocument();
  });
});
