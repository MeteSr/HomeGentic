/**
 * src/referralFees.ts — Contractor Free referral fee (3% of a winning bid, $20 minimum).
 *
 * RF.1  card setup: contractor profile required; Checkout in setup mode with the terms on the button
 * RF.2  the webhook stores the saved card (setup sessions only)
 * RF.3  due fees are charged off-session to the saved card, once per fee
 * RF.4  a declined card gets a 30-day Stripe invoice; a paid invoice marks the fee paid
 * RF.5  Stripe outages and fees with no card are left for the next run
 */

import { describe, it, expect, jest } from "@jest/globals";
import {
  startCardSetup, saveCardFromSession, chargeDueFees, markInvoicePaid, REFERRAL_TERMS_VERSION,
  type FeeLedger, type DueFee,
} from "../src/referralFees";

const P = "abcde-fghij";
const CARD = { customerId: "cus_1", paymentMethodId: "pm_1", brand: "visa", last4: "4242", agreedAt: 1n, termsVersion: "v" };

function ledger(due: DueFee[] = [], email: string | null = "pro@example.com") {
  return {
    takeDue:         jest.fn(async () => due),
    markPaid:        jest.fn(async (_id: string, _ref: string) => {}),
    markFailed:      jest.fn(async (_id: string, _ref: string, _url: string) => {}),
    setCard:         jest.fn(async (_p: string, _c: any) => {}),
    contractorEmail: jest.fn(async (_p: string) => email),
  } satisfies FeeLedger;
}

function stripe(over: Record<string, any> = {}) {
  return {
    customers:      { create: jest.fn(async (_a: any) => ({ id: "cus_new" })), update: jest.fn(async (_id: string, _a: any) => ({})) },
    checkout:       { sessions: { create: jest.fn(async (_a: any) => ({ url: "https://checkout.stripe.com/c/x" })) } },
    setupIntents:   { retrieve: jest.fn(async (_id: string, _o: any) => ({ payment_method: { id: "pm_9", card: { brand: "mastercard", last4: "5555" } } })) },
    paymentIntents: { create: jest.fn(async (_a: any, _o: any) => ({ id: "pi_1", status: "succeeded" })) },
    invoices: {
      create:         jest.fn(async (_a: any, _o: any) => ({ id: "in_1", status: "draft" })),
      retrieve:       jest.fn(async (_id: string) => ({ id: "in_1", status: "draft" })),
      finalizeInvoice: jest.fn(async (_id: string) => ({ id: "in_1", status: "open" })),
      sendInvoice:    jest.fn(async (_id: string) => ({ id: "in_1", status: "open", hosted_invoice_url: "https://invoice.stripe.com/i/1" })),
    },
    invoiceItems:   { create: jest.fn(async (_a: any, _o: any) => ({ id: "ii_1" })) },
    ...over,
  } as any;
}

const fee = (over: Partial<DueFee> = {}): DueFee =>
  ({ id: "RF_1", contractor: P, serviceType: "Plumbing", bidCents: 150_000, feeCents: 4_500, card: CARD, ...over });

describe("RF.1 card setup", () => {
  it("needs a contractor profile", async () => {
    const s = stripe();
    const out = await startCardSetup(P, "https://app.example/settings", s, ledger([], null));
    expect(out.status).toBe(404);
    expect(s.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("opens Checkout in setup mode for a new customer, with the fee terms on the button", async () => {
    const s = stripe();
    const out = await startCardSetup(P, "https://app.example/settings?tab=billing", s, ledger());
    expect(out).toEqual({ status: 200, body: { url: "https://checkout.stripe.com/c/x" } });
    expect(s.customers.create).toHaveBeenCalledWith({ email: "pro@example.com", metadata: { icp_principal: P, purpose: "referral_fee" } });
    const args = s.checkout.sessions.create.mock.calls[0][0];
    expect(args.mode).toBe("setup");
    expect(args.customer).toBe("cus_new");
    expect(args.success_url).toBe("https://app.example/settings?tab=billing&referral_card=saved");
    expect(args.metadata).toEqual({ type: "referral_card", principal: P, terms_version: REFERRAL_TERMS_VERSION });
    expect(args.custom_text.submit.message).toContain("3% of each bid");
  });
});

describe("RF.2 webhook stores the card", () => {
  const session = { metadata: { type: "referral_card", principal: P, terms_version: "2026-10-26" }, status: "complete", setup_intent: "seti_1", customer: "cus_new", created: 1_800_000_000 };

  it("saves brand, last four and when the terms were agreed", async () => {
    const s = stripe(); const l = ledger();
    expect(await saveCardFromSession(session, s, l)).toBe(true);
    expect(s.customers.update).toHaveBeenCalledWith("cus_new", { invoice_settings: { default_payment_method: "pm_9" } });
    expect(l.setCard).toHaveBeenCalledWith(P, {
      customerId: "cus_new", paymentMethodId: "pm_9", brand: "mastercard", last4: "5555",
      agreedAt: 1_800_000_000n * 1_000_000_000n, termsVersion: "2026-10-26",
    });
  });

  it("ignores other sessions and unfinished ones", async () => {
    const l = ledger();
    expect(await saveCardFromSession({ ...session, metadata: { type: "agent_credits" } }, stripe(), l)).toBe(false);
    expect(await saveCardFromSession({ ...session, status: "open" }, stripe(), l)).toBe(false);
    expect(l.setCard).not.toHaveBeenCalled();
  });
});

describe("RF.3 charging due fees", () => {
  it("charges the saved card off-session with one idempotency key per fee", async () => {
    const s = stripe(); const l = ledger([fee()]);
    expect(await chargeDueFees(s, l)).toEqual({ paid: 1, invoiced: 0, skipped: 0, errors: 0 });
    const [args, opts] = s.paymentIntents.create.mock.calls[0];
    expect(args).toMatchObject({ amount: 4_500, currency: "usd", customer: "cus_1", payment_method: "pm_1", off_session: true, confirm: true });
    expect(args.metadata).toEqual({ type: "referral_fee", fee_id: "RF_1", icp_principal: P });
    expect(args.description).toBe("HomeGentic referral fee: 3% of your $1500.00 Plumbing bid ($20 minimum)");
    expect(opts).toEqual({ idempotencyKey: "rf-RF_1" });
    expect(l.markPaid).toHaveBeenCalledWith("RF_1", "pi_1");
  });
});

describe("RF.4 declined cards", () => {
  const declined = () => stripe({
    paymentIntents: { create: jest.fn(async () => { throw Object.assign(new Error("Your card was declined."), { type: "StripeCardError", code: "card_declined" }); }) },
  });

  it("sends a 30-day invoice and records its link", async () => {
    const s = declined(); const l = ledger([fee()]);
    expect(await chargeDueFees(s, l)).toEqual({ paid: 0, invoiced: 1, skipped: 0, errors: 0 });
    expect(s.invoices.create.mock.calls[0][0]).toMatchObject({ customer: "cus_1", collection_method: "send_invoice", days_until_due: 30 });
    expect(s.invoiceItems.create.mock.calls[0][0]).toMatchObject({ invoice: "in_1", amount: 4_500, currency: "usd" });
    expect(s.invoices.sendInvoice).toHaveBeenCalledWith("in_1");
    expect(l.markFailed).toHaveBeenCalledWith("RF_1", "in_1", "https://invoice.stripe.com/i/1");
    expect(l.markPaid).not.toHaveBeenCalled();
  });

  it("doesn't finalize or send an invoice twice when a run is retried", async () => {
    const s = declined();
    s.invoices.retrieve = jest.fn(async () => ({ id: "in_1", status: "open", hosted_invoice_url: "https://invoice.stripe.com/i/1" }));
    const l = ledger([fee()]);
    await chargeDueFees(s, l);
    expect(s.invoices.finalizeInvoice).not.toHaveBeenCalled();
    expect(s.invoices.sendInvoice).not.toHaveBeenCalled();
    expect(l.markFailed).toHaveBeenCalledWith("RF_1", "in_1", "https://invoice.stripe.com/i/1");
  });

  it("a paid referral invoice marks the fee paid; other invoices are left alone", async () => {
    const l = ledger();
    expect(await markInvoicePaid({ id: "in_1", metadata: { type: "referral_fee", fee_id: "RF_7" } }, l)).toBe(true);
    expect(l.markPaid).toHaveBeenCalledWith("RF_7", "in_1");
    expect(await markInvoicePaid({ id: "in_2", metadata: {} }, l)).toBe(false);
    expect(await markInvoicePaid({ id: "in_3", metadata: { type: "referral_fee", fee_id: "FEE_1" } }, l)).toBe(false);
  });
});

describe("RF.5 left for the next run", () => {
  it("a Stripe outage leaves the fee due", async () => {
    const s = stripe({ paymentIntents: { create: jest.fn(async () => { throw Object.assign(new Error("down"), { type: "StripeConnectionError" }); }) } });
    const l = ledger([fee()]);
    expect(await chargeDueFees(s, l)).toEqual({ paid: 0, invoiced: 0, skipped: 0, errors: 1 });
    expect(s.invoices.create).not.toHaveBeenCalled();
    expect(l.markFailed).not.toHaveBeenCalled();
  });

  it("a fee with no saved card is skipped", async () => {
    const s = stripe(); const l = ledger([fee({ card: null })]);
    expect(await chargeDueFees(s, l)).toEqual({ paid: 0, invoiced: 0, skipped: 1, errors: 0 });
    expect(s.paymentIntents.create).not.toHaveBeenCalled();
  });
});
