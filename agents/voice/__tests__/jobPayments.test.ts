/**
 * src/jobPayments.ts — paying a contractor in the app (Stripe Connect,
 * destination charges).
 *
 * JP.1 payout setup: contractor profile required; one Express account per
 *      contractor, recorded on the quote canister; an onboarding link back
 * JP.2 account.updated keeps the canister's account flags in step
 * JP.3 checkout: the canister's terms decide the price, the fee and the
 *      destination; bank is the bid, card is the card price
 * JP.4 an open older checkout is expired first; a completed one blocks a new start
 * JP.5 webhook: completed (paid / processing), async succeeded / failed, expired
 * JP.6 a referral fee settled another way is refunded from HomeGentic's share
 * JP.7 the canister's refusal reaches the homeowner as a 400 with its message
 */

import { describe, it, expect, jest } from "@jest/globals";
import {
  startPayoutOnboarding,
  syncPayoutAccount,
  startJobPayment,
  handleJobPaymentEvent,
  type PaymentLedger,
  type PaymentTerms,
} from "../src/jobPayments";

const OWNER = "aaaaa-bbbbb";
const PRO = "abcde-fghij";
const TERMS: PaymentTerms = {
  quoteId: "Q_1",
  requestId: "REQ_1",
  contractor: PRO,
  homeowner: OWNER,
  accountId: "acct_1",
  bidCents: 120_000,
  cardCents: 123_615,
  referralFeeCents: 3_600,
};

function ledger(over: Partial<PaymentLedger> = {}) {
  return {
    contractorEmail: jest.fn(async (_p: string) => "pro@example.com" as string | null),
    getPayoutAccount: jest.fn(async (_p: string) => null as any),
    setPayoutAccount: jest.fn(async (_p: string, _a: any) => {}),
    prepare: jest.fn(async (_q: string, _payer: string) => TERMS),
    getPayment: jest.fn(async (_q: string) => null as any),
    record: jest.fn(async (_q: string, _payer: string, _m: "Bank" | "Card", _r: number, _ref: string) => {}),
    update: jest.fn(async (_q: string, _ref: string, _s: string, _pi: string) => ({ refundCents: 0 })),
    ...over,
  } satisfies PaymentLedger;
}

function stripe(over: Record<string, any> = {}) {
  return {
    accounts: { create: jest.fn(async (_a: any) => ({ id: "acct_new" })) },
    accountLinks: { create: jest.fn(async (_a: any) => ({ url: "https://connect.stripe.com/setup/x" })) },
    checkout: {
      sessions: {
        create: jest.fn(async (_a: any) => ({ id: "cs_new", url: "https://checkout.stripe.com/c/new" })),
        retrieve: jest.fn(async (_id: string) => ({ id: "cs_old", status: "open" })),
        expire: jest.fn(async (_id: string) => ({ id: "cs_old", status: "expired" })),
      },
    },
    paymentIntents: {
      retrieve: jest.fn(async (_id: string, _o: any) => ({ id: "pi_1", latest_charge: { application_fee: "fee_1" } })),
    },
    applicationFees: { createRefund: jest.fn(async (_id: string, _a: any) => ({ id: "fr_1" })) },
    ...over,
  } as any;
}

const RETURN = "https://app.example/quotes/REQ_1";

describe("JP.1 payout setup", () => {
  it("refuses a malformed principal", async () => {
    const out = await startPayoutOnboarding("not a principal", RETURN, stripe(), ledger());
    expect(out.status).toBe(400);
  });

  it("needs a contractor profile", async () => {
    const s = stripe();
    const out = await startPayoutOnboarding(PRO, RETURN, s, ledger({ contractorEmail: jest.fn(async () => null) }));
    expect(out.status).toBe(404);
    expect(s.accounts.create).not.toHaveBeenCalled();
  });

  it("creates one Express account, records it, and returns an onboarding link", async () => {
    const s = stripe();
    const l = ledger();
    const out = await startPayoutOnboarding(PRO, "https://app.example/settings", s, l);
    expect(out).toEqual({ status: 200, body: { url: "https://connect.stripe.com/setup/x" } });
    const args = s.accounts.create.mock.calls[0][0] as any;
    expect(args).toMatchObject({
      type: "express",
      country: "US",
      email: "pro@example.com",
      capabilities: { transfers: { requested: true } },
      metadata: { icp_principal: PRO },
    });
    expect(l.setPayoutAccount).toHaveBeenCalledWith(PRO, {
      accountId: "acct_new",
      transfersActive: false,
      payoutsEnabled: false,
    });
    expect(s.accountLinks.create).toHaveBeenCalledWith({
      account: "acct_new",
      type: "account_onboarding",
      refresh_url: "https://app.example/settings?payouts=refresh",
      return_url: "https://app.example/settings?payouts=done",
    });
  });

  it("reuses an existing account", async () => {
    const s = stripe();
    const l = ledger({
      getPayoutAccount: jest.fn(async () => ({ accountId: "acct_1", transfersActive: false, payoutsEnabled: false })),
    });
    await startPayoutOnboarding(PRO, RETURN, s, l);
    expect(s.accounts.create).not.toHaveBeenCalled();
    expect((s.accountLinks.create.mock.calls[0][0] as any).account).toBe("acct_1");
  });
});

describe("JP.2 account.updated", () => {
  it("records the account's flags for its contractor", async () => {
    const l = ledger();
    const done = await syncPayoutAccount(
      { id: "acct_1", metadata: { icp_principal: PRO }, capabilities: { transfers: "active" }, payouts_enabled: true },
      l,
    );
    expect(done).toBe(true);
    expect(l.setPayoutAccount).toHaveBeenCalledWith(PRO, {
      accountId: "acct_1",
      transfersActive: true,
      payoutsEnabled: true,
    });
  });

  it("ignores accounts that aren't a contractor's", async () => {
    const l = ledger();
    expect(await syncPayoutAccount({ id: "acct_x", metadata: {} }, l)).toBe(false);
    expect(l.setPayoutAccount).not.toHaveBeenCalled();
  });
});

describe("JP.3 checkout", () => {
  it("bank: the bid, with the referral fee as HomeGentic's share, paid to the contractor's account", async () => {
    const s = stripe();
    const l = ledger();
    const out = await startJobPayment(OWNER, "Q_1", "bank", RETURN, s, l);
    expect(out).toEqual({ status: 200, body: { url: "https://checkout.stripe.com/c/new" } });
    expect(l.prepare).toHaveBeenCalledWith("Q_1", OWNER);
    const args = s.checkout.sessions.create.mock.calls[0][0] as any;
    expect(args.mode).toBe("payment");
    expect(args.payment_method_types).toEqual(["us_bank_account"]);
    expect(args.line_items[0].price_data.unit_amount).toBe(120_000);
    expect(args.payment_intent_data).toMatchObject({
      application_fee_amount: 3_600,
      transfer_data: { destination: "acct_1" },
      metadata: { type: "job_payment", quote_id: "Q_1" },
    });
    expect(args.metadata).toEqual({ type: "job_payment", quote_id: "Q_1", principal: OWNER });
    expect(args.success_url).toBe(`${RETURN}?payment=done`);
    expect(args.cancel_url).toBe(RETURN);
    expect(l.record).toHaveBeenCalledWith("Q_1", OWNER, "Bank", 3_600, "cs_new");
  });

  it("card: the card price, and HomeGentic's share covers the card fee", async () => {
    const s = stripe();
    await startJobPayment(OWNER, "Q_1", "card", RETURN, s, ledger());
    const args = s.checkout.sessions.create.mock.calls[0][0] as any;
    expect(args.payment_method_types).toEqual(["card"]);
    expect(args.line_items[0].price_data.unit_amount).toBe(123_615);
    expect(args.payment_intent_data.application_fee_amount).toBe(3_600 + 3_615);
  });

  it("ContractorPro: no application fee by bank", async () => {
    const s = stripe();
    await startJobPayment(
      OWNER,
      "Q_1",
      "bank",
      RETURN,
      s,
      ledger({ prepare: jest.fn(async () => ({ ...TERMS, referralFeeCents: 0 })) }),
    );
    expect(
      (s.checkout.sessions.create.mock.calls[0][0] as any).payment_intent_data.application_fee_amount,
    ).toBeUndefined();
  });

  it("refuses an unknown method", async () => {
    const out = await startJobPayment(OWNER, "Q_1", "cash" as any, RETURN, stripe(), ledger());
    expect(out.status).toBe(400);
  });
});

describe("JP.4 an earlier checkout", () => {
  const started = { status: "Started", checkoutRef: "cs_old" };

  it("expires an open one before opening another", async () => {
    const s = stripe();
    await startJobPayment(OWNER, "Q_1", "bank", RETURN, s, ledger({ getPayment: jest.fn(async () => started) }));
    expect(s.checkout.sessions.expire).toHaveBeenCalledWith("cs_old");
    expect(s.checkout.sessions.create).toHaveBeenCalled();
  });

  it("won't open another when the earlier one was completed", async () => {
    const s = stripe();
    s.checkout.sessions.retrieve = jest.fn(async () => ({ id: "cs_old", status: "complete" }));
    const out = await startJobPayment(
      OWNER,
      "Q_1",
      "bank",
      RETURN,
      s,
      ledger({ getPayment: jest.fn(async () => started) }),
    );
    expect(out.status).toBe(409);
    expect(s.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("JP.5 webhook events", () => {
  const session = (over: Record<string, any> = {}) => ({
    id: "cs_1",
    payment_intent: "pi_1",
    payment_status: "paid",
    metadata: { type: "job_payment", quote_id: "Q_1" },
    ...over,
  });

  it.each([
    ["checkout.session.completed", { payment_status: "paid" }, "Paid"],
    ["checkout.session.completed", { payment_status: "unpaid" }, "Processing"],
    ["checkout.session.async_payment_succeeded", {}, "Paid"],
    ["checkout.session.async_payment_failed", {}, "Failed"],
    ["checkout.session.expired", { payment_intent: null }, "Failed"],
  ])("%s %j → %s", async (type, over, status) => {
    const l = ledger();
    expect(await handleJobPaymentEvent(type, session(over), stripe(), l)).toBe(true);
    expect(l.update).toHaveBeenCalledWith("Q_1", "cs_1", status, (over as any).payment_intent === null ? "" : "pi_1");
  });

  it("ignores other sessions", async () => {
    const l = ledger();
    expect(
      await handleJobPaymentEvent(
        "checkout.session.completed",
        session({ metadata: { type: "referral_card" } }),
        stripe(),
        l,
      ),
    ).toBe(false);
    expect(l.update).not.toHaveBeenCalled();
  });
});

describe("JP.6 refunding HomeGentic's share", () => {
  it("refunds the referral fee from the application fee when the canister says so", async () => {
    const s = stripe();
    const l = ledger({ update: jest.fn(async () => ({ refundCents: 3_600 })) });
    await handleJobPaymentEvent(
      "checkout.session.completed",
      {
        id: "cs_1",
        payment_intent: "pi_1",
        payment_status: "paid",
        metadata: { type: "job_payment", quote_id: "Q_1" },
      },
      s,
      l,
    );
    expect(s.paymentIntents.retrieve).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge"] });
    expect(s.applicationFees.createRefund).toHaveBeenCalledWith(
      "fee_1",
      { amount: 3_600 },
      { idempotencyKey: "jp-refund-pi_1" },
    );
  });
});

describe("JP.7 refusals", () => {
  it("passes the canister's message through", async () => {
    const err = Object.assign(new Error("This job is already paid"), { code: "InvalidInput" });
    const out = await startJobPayment(
      OWNER,
      "Q_1",
      "bank",
      RETURN,
      stripe(),
      ledger({
        prepare: jest.fn(async () => {
          throw err;
        }),
      }),
    );
    expect(out).toEqual({ status: 400, body: { error: "This job is already paid" } });
  });

  it("a stranger is refused with 403", async () => {
    const err = Object.assign(new Error("Not authorized"), { code: "NotAuthorized" });
    const out = await startJobPayment(
      OWNER,
      "Q_1",
      "bank",
      RETURN,
      stripe(),
      ledger({
        prepare: jest.fn(async () => {
          throw err;
        }),
      }),
    );
    expect(out.status).toBe(403);
  });
});
