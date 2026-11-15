/**
 * Paying a contractor in the app: the card price formula (the same as the
 * quote canister's cardPriceFor), reading payments and payout accounts from a
 * mocked quote actor, the two Worker calls, and the in-memory e2e mode.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const a = {
  getJobPayments: vi.fn(),
  getMyPayoutAccount: vi.fn(),
  getPayoutReady: vi.fn(),
};
const fetchMock = vi.fn();
vi.mock("@/services/actor", () => ({ getAgent: vi.fn().mockResolvedValue({}) }));
vi.mock("@icp-sdk/core/agent", () => ({ Actor: { createActor: vi.fn(() => a) }, HttpAgent: vi.fn() }));
vi.mock("@/services/voiceAgentHeaders", () => ({ voiceAgentFetch: (...args: unknown[]) => fetchMock(...args) }));

import { Principal } from "@icp-sdk/core/principal";
import {
  cardPriceCents,
  getJobPayment,
  getMyPayoutAccount,
  getPayoutReady,
  startJobPayment,
  startPayoutOnboarding,
} from "@/services/jobPayments";

const NS = 1_000_000n;
const PRO = "aaaaa-aa";

const raw = (over: Record<string, unknown> = {}) => ({
  quoteId: "q1",
  requestId: "r1",
  contractor: Principal.fromText(PRO),
  homeowner: Principal.fromText(PRO),
  method: { Bank: null },
  status: { Processing: null },
  bidCents: 120_000n,
  amountCents: 120_000n,
  platformFeeCents: 3_600n,
  referralFeeCents: 3_600n,
  checkoutRef: "cs_1",
  paymentRef: "pi_1",
  createdAt: 1_000n * NS,
  updatedAt: 2_000n * NS,
  ...over,
});

const response = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });

beforeEach(() => {
  Object.values(a).forEach((f) => f.mockReset());
  fetchMock.mockReset();
  delete (window as any).__e2e_job_payments;
});
afterEach(() => {
  delete (window as any).__e2e_job_payments;
});

describe("cardPriceCents", () => {
  it("grosses the bid up for Stripe's 2.9% + 30¢, the same as the canister", () => {
    expect(cardPriceCents(120_000)).toBe(123_615);
    expect(cardPriceCents(10_000)).toBe(10_330);
    expect(cardPriceCents(0)).toBe(31);
  });
});

describe("reading from the quote canister", () => {
  it("getJobPayment decodes the caller's payment, or null", async () => {
    a.getJobPayments.mockResolvedValue([raw()]);
    expect(await getJobPayment("q1")).toEqual({
      quoteId: "q1",
      method: "bank",
      status: "processing",
      bidCents: 120_000,
      amountCents: 120_000,
      updatedAt: 2_000,
    });
    expect(a.getJobPayments).toHaveBeenCalledWith(["q1"]);
    a.getJobPayments.mockResolvedValue([]);
    expect(await getJobPayment("q1")).toBeNull();
  });

  it("getMyPayoutAccount says whether the contractor can be paid yet", async () => {
    a.getMyPayoutAccount.mockResolvedValue([]);
    expect(await getMyPayoutAccount()).toBeNull();
    a.getMyPayoutAccount.mockResolvedValue([
      { accountId: "acct_1", transfersActive: false, payoutsEnabled: false, updatedAt: 0n },
    ]);
    expect(await getMyPayoutAccount()).toEqual({ ready: false, payoutsEnabled: false });
    a.getMyPayoutAccount.mockResolvedValue([
      { accountId: "acct_1", transfersActive: true, payoutsEnabled: true, updatedAt: 0n },
    ]);
    expect(await getMyPayoutAccount()).toEqual({ ready: true, payoutsEnabled: true });
  });

  it("getPayoutReady maps principals to whether they can be paid in the app", async () => {
    a.getPayoutReady.mockResolvedValue([[Principal.fromText(PRO), true]]);
    expect(await getPayoutReady([PRO])).toEqual(new Map([[PRO, true]]));
    expect(await getPayoutReady([])).toEqual(new Map());
    expect(a.getPayoutReady).toHaveBeenCalledTimes(1);
  });
});

describe("the Worker calls", () => {
  it("startJobPayment posts the quote, method and return URL and returns Stripe's URL", async () => {
    fetchMock.mockResolvedValue(response(200, { url: "https://checkout.stripe.com/x" }));
    expect(await startJobPayment("q1", "bank", "https://app/quotes/r1")).toBe("https://checkout.stripe.com/x");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/payments\/start$/);
    expect(JSON.parse(init.body)).toEqual({ quoteId: "q1", method: "bank", returnUrl: "https://app/quotes/r1" });
  });

  it("startJobPayment throws the Worker's message on a refusal", async () => {
    fetchMock.mockResolvedValue(response(409, { error: "Your payment for this job is already being processed." }));
    await expect(startJobPayment("q1", "card", "https://app")).rejects.toThrow(/already being processed/);
    fetchMock.mockResolvedValue(response(500, {}));
    await expect(startJobPayment("q1", "card", "https://app")).rejects.toThrow(/couldn't open/i);
  });

  it("startPayoutOnboarding posts the return URL and returns Stripe's URL", async () => {
    fetchMock.mockResolvedValue(response(200, { url: "https://connect.stripe.com/x" }));
    expect(await startPayoutOnboarding("https://app/settings")).toBe("https://connect.stripe.com/x");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/api\/payments\/payout-onboarding$/);
    expect(JSON.parse(init.body)).toEqual({ returnUrl: "https://app/settings" });
  });
});

describe("e2e mode (window.__e2e_job_payments)", () => {
  it("reads and starts payments without a canister or the Worker", async () => {
    (window as any).__e2e_job_payments = {
      payments: {},
      payout: { ready: false, payoutsEnabled: false },
      ready: { [PRO]: true },
    };
    expect(await getJobPayment("q1")).toBeNull();
    expect(await getMyPayoutAccount()).toEqual({ ready: false, payoutsEnabled: false });
    expect(await getPayoutReady([PRO, "other"])).toEqual(
      new Map([
        [PRO, true],
        ["other", false],
      ]),
    );

    const url = await startJobPayment("q1", "bank", "https://app/quotes/r1");
    expect(url).toBe("https://app/quotes/r1?payment=done");
    expect(await getJobPayment("q1")).toMatchObject({ status: "processing", method: "bank" });
    expect(await startPayoutOnboarding("https://app/settings")).toBe("https://app/settings?payouts=done");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(a.getJobPayments).not.toHaveBeenCalled();
  });
});
