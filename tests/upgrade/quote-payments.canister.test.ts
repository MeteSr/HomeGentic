/**
 * Paying a contractor in the app (Stripe Connect), on real quote and fee
 * canisters wired to each other. The voice Worker's identity is the payment
 * relay; Stripe itself is outside this test.
 *
 *  QP.1 only admins add the payment relay; only the relay sets payout
 *       accounts, prepares, records and updates payments
 *  QP.2 a quote can be paid only by its homeowner, once it is accepted and
 *       the contractor's payout account can receive transfers
 *  QP.3 the terms: the bid by bank, the card price (2.9% + 30¢ covered) by
 *       card, and the 3% referral fee of a free-plan contractor's bid
 *  QP.4 while a payment is in progress the referral fee is held, so the
 *       saved-card charge skips it; a failed payment releases it
 *  QP.5 a paid payment marks the referral fee Paid on the fee canister and
 *       notifies both sides; repeating it changes nothing
 *  QP.6 a referral fee settled another way first is reported for refund
 *  QP.7 getJobPayments shows a payment only to its homeowner, contractor and
 *       the relay; getPayoutReady and getMyPayoutAccount
 *  QP.8 payments survive an upgrade; deleteMyData drops them
 *
 * Run: cd tests/upgrade && npx vitest run quote-payments.canister.test.ts
 * (needs .dfx/local/canisters/{quote,fee}/*.wasm)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "fs";
import { PocketIc, createIdentity } from "@dfinity/pic";
import { IDL } from "@icp-sdk/core/candid";
import type { Identity } from "@icp-sdk/core/agent";
import { createPic, wasmPath, CONTROLLER } from "./__helpers__/setup";
import { serviceFromWasm } from "./__helpers__/candid";

type R<T> = { ok: T } | { err: Record<string, unknown> };
function ok<T>(r: R<T>): T {
  if ("err" in r)
    throw new Error(
      `Expected ok, got err: ${JSON.stringify(r.err, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`,
    );
  return r.ok;
}
const errKey = (r: R<unknown>) => ("err" in r ? Object.keys(r.err)[0] : "ok");
const tag = (v: object) => Object.keys(v)[0];

const CANISTERS = ["quote", "fee"] as const;
type Name = (typeof CANISTERS)[number];
const DAY_NS = 86_400_000_000_000n;
const BID = 120_000n; // $1,200
const CARD = 123_615n; // ceil((120000 + 30) / 0.971)
const REFERRAL = 3_600n; // 3% of $1,200

describe("quote: paying a contractor in the app", () => {
  let pic: PocketIc;
  const ids = {} as Record<Name, any>;
  const svcs = {} as Record<Name, IDL.ServiceClass>;

  const admin = createIdentity("qp-admin");
  const relay = createIdentity("qp-relay");
  const owner = createIdentity("qp-owner");
  const pro = createIdentity("qp-pro");
  const other = createIdentity("qp-other-pro");
  const stranger = createIdentity("qp-stranger");

  const as = (name: Name, who: Identity) => {
    const a = pic.createActor<any>((() => svcs[name]) as any, ids[name]);
    a.setIdentity(who);
    return a;
  };
  const nowNs = async () => BigInt(await pic.getTime()) * 1_000_000n;
  const account = (transfersActive = true) => ({
    accountId: "acct_123",
    transfersActive,
    payoutsEnabled: transfersActive,
    updatedAt: 0n,
  });
  let seq = 0n;
  const newEvents = async () => {
    const page = ok<any>(await as("quote", admin).getNotificationEvents(seq, 200n));
    if (page.events.length) seq = page.events[page.events.length - 1].seq;
    return page.events.map((e: any) => [e.kind, e.recipient[0]?.toText() ?? null]);
  };
  const referralFee = async (quoteId: string) =>
    ok<any[]>(await as("fee", admin).getAllReferralFees()).find((f) => f.quoteId === quoteId);

  /** A new request by `owner`, a bid by `who`, accepted. Returns the quote id. */
  async function acceptedQuote(who: Identity, amount = BID): Promise<string> {
    const req = ok<any>(
      await as("quote", owner).createQuoteRequest(
        "PROP-QP",
        { HVAC: null },
        "AC out",
        { High: null },
        [],
        [],
        [],
        [],
        [],
      ),
    );
    const q = ok<any>(await as("quote", who).submitQuote(req.id, amount, 3n, (await nowNs()) + 30n * DAY_NS));
    ok(await as("quote", owner).acceptQuote(q.id));
    return q.id;
  }

  beforeAll(async () => {
    pic = await createPic();
    for (const name of CANISTERS) {
      const { idlFactory, initArgs } = serviceFromWasm(wasmPath(name));
      svcs[name] = idlFactory({ IDL });
      const arg = new Uint8Array(
        IDL.encode(
          initArgs,
          initArgs.map(() => admin.getPrincipal()),
        ),
      );
      ids[name] = (
        await pic.setupCanister({ idlFactory: (() => svcs[name]) as any, wasm: wasmPath(name), arg })
      ).canisterId;
      const methods = new Map(svcs[name]._fields);
      if (methods.has("setBootstrapNonce")) await as(name, CONTROLLER).setBootstrapNonce("n");
      if (methods.has("initAdmins")) ok(await as(name, admin).initAdmins([admin.getPrincipal()], "n"));
      else ok(await as(name, admin).addAdmin(admin.getPrincipal(), "n"));
    }
    // Many calls from one identity: turn the per-minute limit off.
    for (const name of CANISTERS) ok(await as(name, admin).setUpdateRateLimit(0n));
    ok(await as("quote", admin).setFeeCanisterId(ids.fee));
    ok(await as("fee", admin).setQuoteCanisterId(ids.quote.toText()));
    // Free-plan contractors need a saved card before they bid.
    for (const c of [pro, other]) {
      ok(
        await as("fee", admin).relaySetReferralCard(c.getPrincipal(), {
          customerId: "cus_1",
          paymentMethodId: "pm_1",
          brand: "visa",
          last4: "4242",
          agreedAt: 0n,
          termsVersion: "2026-10-26",
        }),
      );
    }
    await newEvents();
  });

  afterAll(async () => {
    await pic?.tearDown();
  });

  it("QP.1 only admins add the relay, and only the relay moves payments", async () => {
    expect(errKey(await as("quote", stranger).addPaymentRelay(stranger.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await as("quote", relay).relaySetPayoutAccount(pro.getPrincipal(), account()))).toBe("NotAuthorized");
    ok(await as("quote", admin).addPaymentRelay(relay.getPrincipal()));
    ok(await as("quote", admin).addPaymentRelay(stranger.getPrincipal()));
    ok(await as("quote", admin).removePaymentRelay(stranger.getPrincipal()));
    const q = await acceptedQuote(pro);
    for (const call of [
      () => as("quote", stranger).relaySetPayoutAccount(stranger.getPrincipal(), account()),
      () => as("quote", stranger).relayPrepareJobPayment(q, owner.getPrincipal()),
      () => as("quote", stranger).relayRecordJobPayment(q, owner.getPrincipal(), { Bank: null }, 0n, "cs_1"),
      () => as("quote", stranger).relayUpdateJobPayment(q, "cs_1", { Paid: null }, "pi_1"),
      () => as("fee", stranger).holdReferralFeeInApp(q),
      () => as("fee", stranger).settleReferralFeeInApp(q, "x"),
      () => as("fee", stranger).releaseReferralFeeInApp(q),
    ]) {
      expect(errKey(await call())).toBe("NotAuthorized");
    }
    expect(
      errKey(await as("quote", relay).relaySetPayoutAccount(pro.getPrincipal(), { ...account(), accountId: "" })),
    ).toBe("InvalidInput");
  });

  it("QP.2 only the homeowner pays an accepted quote, to a contractor who can receive it", async () => {
    const q = await acceptedQuote(pro);
    // No payout account yet.
    expect(errKey(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()))).toBe("InvalidInput");
    ok(await as("quote", relay).relaySetPayoutAccount(pro.getPrincipal(), account(false)));
    expect(errKey(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()))).toBe("InvalidInput");
    ok(await as("quote", relay).relaySetPayoutAccount(pro.getPrincipal(), account(true)));
    expect(errKey(await as("quote", relay).relayPrepareJobPayment(q, stranger.getPrincipal()))).toBe("NotAuthorized");
    expect(errKey(await as("quote", relay).relayPrepareJobPayment("no-such-quote", owner.getPrincipal()))).toBe(
      "NotFound",
    );
    // A bid that wasn't accepted.
    const req = ok<any>(
      await as("quote", owner).createQuoteRequest("PROP-QP", { HVAC: null }, "Duct", { Low: null }, [], [], [], [], []),
    );
    const open = ok<any>(await as("quote", pro).submitQuote(req.id, BID, 3n, (await nowNs()) + DAY_NS)).id;
    expect(errKey(await as("quote", relay).relayPrepareJobPayment(open, owner.getPrincipal()))).toBe("InvalidInput");
  });

  it("QP.3 terms: bid by bank, card price by card, and the free plan's 3% fee", async () => {
    expect(await as("quote", stranger).cardPriceFor(BID)).toBe(CARD);
    const q = await acceptedQuote(pro);
    const t = ok<any>(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()));
    expect(t).toMatchObject({
      quoteId: q,
      accountId: "acct_123",
      bidCents: BID,
      cardCents: CARD,
      referralFeeCents: REFERRAL,
    });
    expect(t.contractor.toText()).toBe(pro.getPrincipal().toText());

    const bank = ok<any>(
      await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Bank: null }, REFERRAL, "cs_bank"),
    );
    expect(bank).toMatchObject({ amountCents: BID, platformFeeCents: REFERRAL, referralFeeCents: REFERRAL });
    expect(tag(bank.status)).toBe("Started");
    // Switching to card replaces the unpaid attempt.
    const card = ok<any>(
      await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Card: null }, REFERRAL, "cs_card"),
    );
    expect(card).toMatchObject({
      amountCents: CARD,
      platformFeeCents: REFERRAL + (CARD - BID),
      checkoutRef: "cs_card",
    });
    expect(
      errKey(await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Bank: null }, 0n, "")),
    ).toBe("InvalidInput");
  });

  it("QP.4 the referral fee is held while paying, and released when the payment fails", async () => {
    const q = await acceptedQuote(pro);
    ok(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()));
    ok(await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Bank: null }, REFERRAL, "cs_4"));
    const fee = await referralFee(q);
    expect(fee).toBeDefined();
    // Past the 60-day fallback the fee is Due, but it is held.
    await pic.advanceTime(61 * 24 * 3600 * 1000);
    await pic.tick();
    ok(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal())); // renews the hold
    const due = ok<any[]>(await as("fee", admin).takeDueReferralFees());
    expect(due.map((d) => d.fee.quoteId)).not.toContain(q);

    await newEvents();
    const failed = ok<any>(await as("quote", relay).relayUpdateJobPayment(q, "cs_4", { Failed: null }, "pi_4"));
    expect(tag(failed.payment.status)).toBe("Failed");
    expect(await newEvents()).toEqual([["job_payment_failed", owner.getPrincipal().toText()]]);
    const afterRelease = ok<any[]>(await as("fee", admin).takeDueReferralFees());
    expect(afterRelease.map((d) => d.fee.quoteId)).toContain(q);
  });

  it("QP.5 a paid payment settles the referral fee and notifies both sides, once", async () => {
    const q = await acceptedQuote(pro);
    ok(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()));
    ok(await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Bank: null }, REFERRAL, "cs_5"));
    await newEvents();
    const processing = ok<any>(await as("quote", relay).relayUpdateJobPayment(q, "cs_5", { Processing: null }, "pi_5"));
    expect(tag(processing.payment.status)).toBe("Processing");
    expect(await newEvents()).toEqual([["job_payment_processing", pro.getPrincipal().toText()]]);
    // A bank payment on its way blocks a second one.
    expect(errKey(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()))).toBe("InvalidInput");

    const paid = ok<any>(await as("quote", relay).relayUpdateJobPayment(q, "cs_5", { Paid: null }, "pi_5"));
    expect(tag(paid.payment.status)).toBe("Paid");
    expect(paid.refundCents).toBe(0n);
    expect(await newEvents()).toEqual([
      ["job_payment_paid", pro.getPrincipal().toText()],
      ["job_payment_receipt", owner.getPrincipal().toText()],
    ]);
    const fee = await referralFee(q);
    expect(tag(fee.status)).toBe("Paid");
    expect(fee.paymentRef).toBe("inapp:pi_5");

    const again = ok<any>(await as("quote", relay).relayUpdateJobPayment(q, "cs_5", { Paid: null }, "pi_5"));
    expect(again.refundCents).toBe(0n);
    expect(await newEvents()).toEqual([]);
    expect(errKey(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()))).toBe("InvalidInput");
    // An event for an older checkout of the same quote changes nothing.
    const stale = ok<any>(await as("quote", relay).relayUpdateJobPayment(q, "cs_old", { Failed: null }, "pi_x"));
    expect(tag(stale.payment.status)).toBe("Paid");
  });

  it("QP.6 a referral fee already settled another way is reported for refund", async () => {
    const q = await acceptedQuote(pro);
    ok(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()));
    ok(await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Card: null }, REFERRAL, "cs_6"));
    const fee = await referralFee(q);
    ok(await as("fee", admin).waiveReferralFee(fee.id, "goodwill"));
    const paid = ok<any>(await as("quote", relay).relayUpdateJobPayment(q, "cs_6", { Paid: null }, "pi_6"));
    expect(paid.refundCents).toBe(REFERRAL);
  });

  it("QP.7 who sees payments and payout setup", async () => {
    const q = await acceptedQuote(pro);
    ok(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()));
    ok(await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Bank: null }, REFERRAL, "cs_7"));
    for (const who of [owner, pro, relay, admin]) {
      expect(((await as("quote", who).getJobPayments([q, "nope"])) as any[]).map((p) => p.quoteId)).toEqual([q]);
    }
    expect(await as("quote", stranger).getJobPayments([q])).toEqual([]);
    expect(await as("quote", other).getJobPayments([q])).toEqual([]);

    expect(((await as("quote", pro).getMyPayoutAccount()) as any[])[0].accountId).toBe("acct_123");
    expect(((await as("quote", relay).relayGetPayoutAccount(pro.getPrincipal())) as any[])[0].accountId).toBe(
      "acct_123",
    );
    expect(await as("quote", stranger).relayGetPayoutAccount(pro.getPrincipal())).toEqual([]);
    expect(await as("quote", other).getMyPayoutAccount()).toEqual([]);
    const ready = (await as("quote", stranger).getPayoutReady([pro.getPrincipal(), other.getPrincipal()])) as any[];
    expect(ready.map(([p, r]) => [p.toText(), r])).toEqual([
      [pro.getPrincipal().toText(), true],
      [other.getPrincipal().toText(), false],
    ]);
  });

  it("QP.8 payments survive an upgrade, and deleteMyData drops them", async () => {
    const q = await acceptedQuote(pro);
    ok(await as("quote", relay).relayPrepareJobPayment(q, owner.getPrincipal()));
    ok(await as("quote", relay).relayRecordJobPayment(q, owner.getPrincipal(), { Bank: null }, REFERRAL, "cs_8"));
    const before = await as("quote", owner).getJobPayments([q]);
    await pic.upgradeCanister({ canisterId: ids.quote, wasm: readFileSync(wasmPath("quote")) });
    expect(await as("quote", owner).getJobPayments([q])).toEqual(before);
    ok(await as("quote", pro).deleteMyData());
    expect(await as("quote", pro).getMyPayoutAccount()).toEqual([]);
    ok(await as("quote", owner).deleteMyData());
    expect(await as("quote", admin).getJobPayments([q])).toEqual([]);
  });
});
