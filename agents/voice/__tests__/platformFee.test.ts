/**
 * src/platformFee.ts — the Bid to List platform fee, paid by the winning agent
 * through the app's own Stripe account before the seller's details release.
 *
 * PF.1 checkout: only the agent whose bid the seller chose, only while the fee is
 *      open and the request still open; the amount and metadata come from the fee record
 * PF.2 webhook: a settled payment is reported to the fee canister (which releases
 *      the details); unreachable canisters are retried; an unappliable payment is
 *      logged for a refund instead
 */
import { describe, it, expect, jest } from "@jest/globals";
import { startPlatformFeeCheckout, settlePlatformFee, type PlatformFee, type PlatformFeeLedger } from "../src/platformFee";

const AGENT = "agent-principal";
const FEE: PlatformFee = { id: "FEE_1", requestId: "REQ_1", proposalId: "PROP_1", agentId: AGENT, amountCents: 39_900, status: "Owed" };

function ledger(fee: PlatformFee | null = FEE, open = true, mark: Awaited<ReturnType<PlatformFeeLedger["markPaid"]>> = { ok: true }) {
  return {
    feeFor:      jest.fn(async (_p: string) => fee),
    requestOpen: jest.fn(async (_r: string) => open),
    markPaid:    jest.fn(async (_f: string, _p: string) => mark),
  } satisfies PlatformFeeLedger;
}
const stripe = () => ({ checkout: { sessions: { create: jest.fn(async (_a: any) => ({ url: "https://checkout.stripe.test/s" })) } } });

describe("PF.1 checkout", () => {
  it("opens Checkout for the fee's amount, returning to the bid's page", async () => {
    const s = stripe();
    const out = await startPlatformFeeCheckout(AGENT, "PROP_1", "https://app.test", s, ledger());
    expect(out).toEqual({ status: 200, body: { url: "https://checkout.stripe.test/s" } });
    const args = s.checkout.sessions.create.mock.calls[0][0] as any;
    expect(args.mode).toBe("payment");
    expect(args.line_items).toEqual([{
      quantity: 1,
      price_data: { currency: "usd", unit_amount: 39_900, product_data: { name: "HomeGentic Bid to List platform fee" } },
    }]);
    expect(args.metadata).toEqual({ type: "platform_fee", feeId: "FEE_1", proposalId: "PROP_1", requestId: "REQ_1", agentId: AGENT });
    expect(args.success_url).toBe("https://app.test/agents/bids/PROP_1?fee_paid=1");
    expect(args.cancel_url).toBe("https://app.test/agents/bids/PROP_1?fee_cancelled=1");
  });

  it("refuses anyone but the chosen agent, unknown bids, settled fees and closed requests", async () => {
    const s = stripe();
    expect((await startPlatformFeeCheckout("someone-else", "PROP_1", "https://app.test", s, ledger())).status).toBe(404);
    expect((await startPlatformFeeCheckout(AGENT, "PROP_1", "https://app.test", s, ledger(null))).status).toBe(404);
    expect((await startPlatformFeeCheckout(AGENT, "PROP_1", "https://app.test", s, ledger({ ...FEE, status: "Paid" }))).status).toBe(409);
    expect((await startPlatformFeeCheckout(AGENT, "PROP_1", "https://app.test", s, ledger({ ...FEE, status: "Waived" }))).status).toBe(409);
    expect((await startPlatformFeeCheckout(AGENT, "PROP_1", "https://app.test", s, ledger(FEE, false))).status).toBe(409);
    expect((await startPlatformFeeCheckout(AGENT, "", "https://app.test", s, ledger())).status).toBe(400);
    expect(s.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("PF.2 webhook", () => {
  const session = (metadata: Record<string, string>, payment_status = "paid") => ({ metadata, payment_status });
  const META = { type: "platform_fee", feeId: "FEE_1", proposalId: "PROP_1" };

  it("reports the settled payment for the fee and the bid it was for", async () => {
    const l = ledger();
    expect(await settlePlatformFee(session(META), l)).toBe(true);
    expect(l.markPaid).toHaveBeenCalledWith("FEE_1", "PROP_1");
  });

  it("leaves other sessions alone and waits for a delayed payment to settle", async () => {
    const l = ledger();
    expect(await settlePlatformFee(session({ type: "job_payment" }), l)).toBe(false);
    expect(await settlePlatformFee(session(META, "unpaid"), l)).toBe(true);
    expect(l.markPaid).not.toHaveBeenCalled();
  });

  it("throws so Stripe retries when a canister can't be reached", async () => {
    await expect(settlePlatformFee(session(META), ledger(FEE, true, { err: "listing is down", retry: true }))).rejects.toThrow(/listing is down/);
  });

  it("logs a payment that can't be applied for a refund instead of retrying it", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await settlePlatformFee(session(META), ledger(FEE, true, { err: "a different bid", retry: false }))).toBe(true);
    expect(error.mock.calls.flat().join(" ")).toMatch(/refund/i);
    error.mockRestore();
  });
});
