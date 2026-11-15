/**
 * src/jobPayments.ts — canisterPaymentLedger: the quote and contractor canister
 * calls behind the payment routes, through the Worker's identity.
 *
 * JPL.1 each method calls the right canister method with Candid-shaped
 *       arguments and turns the result into plain values
 * JPL.2 a canister error becomes a CanisterError; a missing canister ID throws
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { Principal } from "@icp-sdk/core/principal";

const quote: Record<string, jest.Mock<any>> = {
  relayGetPayoutAccount: jest.fn(),
  relaySetPayoutAccount: jest.fn(),
  relayPrepareJobPayment: jest.fn(),
  getJobPayments: jest.fn(),
  relayRecordJobPayment: jest.fn(),
  relayUpdateJobPayment: jest.fn(),
};
const contractor = { getContractor: jest.fn<any>() };
const mockCreateActor = jest.fn((_idl: unknown, opts: { canisterId: string }) =>
  opts.canisterId === "contractor-id" ? contractor : quote,
);

jest.mock("@icp-sdk/core/agent", () => {
  const actual = jest.requireActual("@icp-sdk/core/agent") as Record<string, unknown>;
  return { ...actual, Actor: { createActor: (...args: unknown[]) => (mockCreateActor as any)(...args) } };
});
jest.mock("../paymentCanister", () => ({
  getAgent: async () => ({}),
  PRINCIPAL_RE: /^[a-z0-9-]+$/,
}));

import { canisterPaymentLedger } from "../src/jobPayments";

const PRO = "aaaaa-aa";
const pro = Principal.fromText(PRO);

beforeEach(() => {
  Object.values(quote).forEach((f) => f.mockReset());
  contractor.getContractor.mockReset();
  process.env.CANISTER_ID_QUOTE = "quote-id";
  process.env.CANISTER_ID_CONTRACTOR = "contractor-id";
});

describe("JPL.1 canister calls", () => {
  it("contractorEmail reads the profile's email, or null without a profile", async () => {
    const l = canisterPaymentLedger();
    contractor.getContractor.mockResolvedValueOnce({ ok: { email: "pro@example.com" } });
    expect(await l.contractorEmail(PRO)).toBe("pro@example.com");
    contractor.getContractor.mockResolvedValueOnce({ err: { NotFound: null } });
    expect(await l.contractorEmail(PRO)).toBeNull();
  });

  it("reads and writes payout accounts", async () => {
    const l = canisterPaymentLedger();
    quote.relayGetPayoutAccount.mockResolvedValueOnce([]);
    expect(await l.getPayoutAccount(PRO)).toBeNull();
    quote.relayGetPayoutAccount.mockResolvedValueOnce([
      { accountId: "acct_1", transfersActive: true, payoutsEnabled: false, updatedAt: 5n },
    ]);
    expect(await l.getPayoutAccount(PRO)).toEqual({
      accountId: "acct_1",
      transfersActive: true,
      payoutsEnabled: false,
    });

    quote.relaySetPayoutAccount.mockResolvedValueOnce({ ok: null });
    await l.setPayoutAccount(PRO, { accountId: "acct_1", transfersActive: true, payoutsEnabled: true });
    expect(quote.relaySetPayoutAccount).toHaveBeenCalledWith(pro, {
      accountId: "acct_1",
      transfersActive: true,
      payoutsEnabled: true,
      updatedAt: 0n,
    });
  });

  it("prepare turns the canister's terms into numbers and text", async () => {
    quote.relayPrepareJobPayment.mockResolvedValueOnce({
      ok: {
        quoteId: "Q_1",
        requestId: "REQ_1",
        contractor: pro,
        homeowner: pro,
        accountId: "acct_1",
        bidCents: 120_000n,
        cardCents: 123_615n,
        referralFeeCents: 3_600n,
      },
    });
    expect(await canisterPaymentLedger().prepare("Q_1", PRO)).toEqual({
      quoteId: "Q_1",
      requestId: "REQ_1",
      contractor: PRO,
      homeowner: PRO,
      accountId: "acct_1",
      bidCents: 120_000,
      cardCents: 123_615,
      referralFeeCents: 3_600,
    });
    expect(quote.relayPrepareJobPayment).toHaveBeenCalledWith("Q_1", pro);
  });

  it("getPayment, record and update", async () => {
    const l = canisterPaymentLedger();
    quote.getJobPayments.mockResolvedValueOnce([]);
    expect(await l.getPayment("Q_1")).toBeNull();
    quote.getJobPayments.mockResolvedValueOnce([{ status: { Started: null }, checkoutRef: "cs_1" }]);
    expect(await l.getPayment("Q_1")).toEqual({ status: "Started", checkoutRef: "cs_1" });

    quote.relayRecordJobPayment.mockResolvedValueOnce({ ok: {} });
    await l.record("Q_1", PRO, "Card", 3_600, "cs_1");
    expect(quote.relayRecordJobPayment).toHaveBeenCalledWith("Q_1", pro, { Card: null }, 3_600n, "cs_1");

    quote.relayUpdateJobPayment.mockResolvedValueOnce({ ok: { payment: {}, refundCents: 3_600n } });
    expect(await l.update("Q_1", "cs_1", "Paid", "pi_1")).toEqual({ refundCents: 3_600 });
    expect(quote.relayUpdateJobPayment).toHaveBeenCalledWith("Q_1", "cs_1", { Paid: null }, "pi_1");
  });
});

describe("JPL.2 failures", () => {
  it("a canister error becomes a CanisterError with its code", async () => {
    quote.relayPrepareJobPayment.mockResolvedValueOnce({ err: { NotAuthorized: null } });
    await expect(canisterPaymentLedger().prepare("Q_1", PRO)).rejects.toMatchObject({ code: "NotAuthorized" });
  });

  it("missing canister IDs throw", async () => {
    delete process.env.CANISTER_ID_QUOTE;
    delete process.env.CANISTER_ID_CONTRACTOR;
    const l = canisterPaymentLedger();
    await expect(l.getPayment("Q_1")).rejects.toThrow(/CANISTER_ID_QUOTE/);
    await expect(l.contractorEmail(PRO)).rejects.toThrow(/CANISTER_ID_CONTRACTOR/);
  });
});
