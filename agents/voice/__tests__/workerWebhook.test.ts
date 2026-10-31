/**
 * POST /api/stripe/webhook: every event type the Worker acts on, and the
 * delivery rules around them (testing-gaps audit 2026-10-29, item 2).
 *
 * WH.1 signature, configuration and size checks come before any work
 * WH.2 subscription lifecycle: updated / deleted / invoice paid / failed
 * WH.3 checkout.session.completed: credit packs, gifts, referral cards
 * WH.4 referral-fee invoice and payment intent go to the fee ledger
 * WH.5 delivery: a redelivered event does nothing, an event still being
 *      processed is refused (409) so Stripe retries, and a handler error
 *      releases the event so the retry runs it again
 */

const mockConstructEvent = jest.fn();
const mockSubsRetrieve   = jest.fn();

jest.mock("stripe", () => {
  const Stripe: any = jest.fn().mockImplementation(() => ({
    checkout:      { sessions: { create: jest.fn(), retrieve: jest.fn() } },
    subscriptions: { search: jest.fn(), update: jest.fn(), retrieve: mockSubsRetrieve },
    identity:      { verificationSessions: { create: jest.fn(), retrieve: jest.fn() } },
    webhooks:      { constructEventAsync: mockConstructEvent },
  }));
  Stripe.createSubtleCryptoProvider = jest.fn(() => ({ subtle: true }));
  return { __esModule: true, default: Stripe };
});

jest.mock("../paymentCanister", () => {
  class AlreadyConsumedError extends Error {}
  return {
    activateInCanister:        jest.fn().mockResolvedValue(undefined),
    activateSubscriptionUntil: jest.fn().mockResolvedValue(undefined),
    consumeAgentCredit:        jest.fn().mockRejectedValue(new Error("none")),
    grantAgentCreditsOnce:     jest.fn().mockResolvedValue(undefined),
    recordGift:                jest.fn().mockResolvedValue(undefined),
    AlreadyConsumedError,
    PAID_TIERS:                new Set(["Pro", "ContractorPro"]),
    PRINCIPAL_RE:              /^(?=.{1,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/,
    fetchSubscriptionTier:     jest.fn().mockResolvedValue("Free"),
    getAgent:                  jest.fn(),
  };
});
jest.mock("../monitoringCanister", () => ({
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels:       jest.fn().mockResolvedValue([]),
  recordFrontendError:    jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
jest.mock("../src/tier", () => ({ resolveTier: jest.fn().mockResolvedValue("Free") }));
jest.mock("../src/propertyCanister", () => ({ markIdentityCleared: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../src/referralFees", () => {
  const actual = jest.requireActual("../src/referralFees");
  return {
    ...actual,
    canisterLedger:        jest.fn(() => ({ ledger: true })),
    markInvoicePaid:       jest.fn().mockResolvedValue(undefined),
    markPaymentIntentPaid: jest.fn().mockResolvedValue(undefined),
    saveCardFromSession:   jest.fn().mockResolvedValue(undefined),
  };
});
jest.mock("../src/offchainOutcalls", () => {
  const actual = jest.requireActual("../src/offchainOutcalls");
  return { ...actual, sendGiftEmail: jest.fn().mockResolvedValue(true) };
});

import { describe, it, expect, beforeEach } from "@jest/globals";
import worker from "../src/index";
import {
  activateInCanister, activateSubscriptionUntil, grantAgentCreditsOnce, recordGift, AlreadyConsumedError,
} from "../paymentCanister";
import { markInvoicePaid, markPaymentIntentPaid, saveCardFromSession } from "../src/referralFees";
import { sendGiftEmail } from "../src/offchainOutcalls";

function fakeKV() {
  const store = new Map<string, string>();
  return {
    get:    async (k: string) => store.get(k) ?? null,
    put:    async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
  } as unknown as KVNamespace;
}

function makeEnv(over: Record<string, unknown> = {}): any {
  return {
    ANTHROPIC_API_KEY: "sk-ant", VOICE_AGENT_API_KEY: "pubkey", FRONTEND_ORIGIN: "https://app.test",
    NODE_ENV: "production", CANISTER_ID_AUTH: "auth-id", STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x", RATE_LIMIT: fakeKV(), ...over,
  };
}

const ctx: any = { waitUntil: () => {} };
let n = 0;

/** Delivers `event` (given a fresh id unless it has one) to the webhook. */
function deliver(event: Record<string, any>, env = makeEnv()) {
  mockConstructEvent.mockResolvedValueOnce({ id: `evt_${++n}`, ...event });
  return worker.fetch(new Request("https://worker.test/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}",
  }), env, ctx);
}

const PERIOD_END = 1_900_000_000;
const sub = (over: Record<string, any> = {}) => ({
  id: "sub_1", status: "active", current_period_end: PERIOD_END,
  metadata: { icp_principal: "user-aaa", tier: "Pro" }, ...over,
});

beforeEach(() => { jest.clearAllMocks(); });

describe("WH.1 — before any work", () => {
  it("refuses an unconfigured webhook, a missing signature and a bad signature", async () => {
    const r1 = await worker.fetch(new Request("https://worker.test/api/stripe/webhook", { method: "POST", body: "{}" }),
      makeEnv({ STRIPE_WEBHOOK_SECRET: undefined }), ctx);
    expect(r1.status).toBe(500);
    const r2 = await worker.fetch(new Request("https://worker.test/api/stripe/webhook", { method: "POST", body: "{}" }), makeEnv(), ctx);
    expect(r2.status).toBe(400);
    mockConstructEvent.mockRejectedValueOnce(new Error("bad sig"));
    const r3 = await worker.fetch(new Request("https://worker.test/api/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": "t=1,v1=forged" }, body: "{}",
    }), makeEnv(), ctx);
    expect(r3.status).toBe(400);
    expect(activateInCanister).not.toHaveBeenCalled();
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
  });

  it("acknowledges an event type it doesn't handle without acting", async () => {
    const res = await deliver({ type: "customer.created", data: { object: {} } });
    expect(res.status).toBe(200);
    expect(activateInCanister).not.toHaveBeenCalled();
  });
});

describe("WH.2 — subscription lifecycle", () => {
  it("an active or trialing subscription is activated until Stripe's period end, keyed by period", async () => {
    for (const status of ["active", "trialing"]) {
      await deliver({ type: "customer.subscription.updated", data: { object: sub({ status }) } });
    }
    expect(activateSubscriptionUntil).toHaveBeenCalledTimes(2);
    expect(activateSubscriptionUntil).toHaveBeenCalledWith("user-aaa", "Pro", PERIOD_END, `sub:sub_1:${PERIOD_END}`);
  });

  it("reads the period end from the subscription item on newer API versions", async () => {
    await deliver({ type: "customer.subscription.updated", data: { object: sub({
      current_period_end: undefined, items: { data: [{ current_period_end: PERIOD_END + 5 }] },
    }) } });
    expect(activateSubscriptionUntil).toHaveBeenCalledWith("user-aaa", "Pro", PERIOD_END + 5, `sub:sub_1:${PERIOD_END + 5}`);
  });

  it.each(["canceled", "unpaid", "incomplete_expired"])("a %s subscription drops to Free", async (status) => {
    await deliver({ type: "customer.subscription.updated", data: { object: sub({ status }) } });
    expect(activateInCanister).toHaveBeenCalledWith("user-aaa", "Free", 0);
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
  });

  it("past_due and incomplete change nothing (Stripe is still retrying)", async () => {
    for (const status of ["past_due", "incomplete"]) {
      await deliver({ type: "customer.subscription.updated", data: { object: sub({ status }) } });
    }
    expect(activateInCanister).not.toHaveBeenCalled();
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
  });

  it("a subscription without a valid tier is refused, and the event released for a retry", async () => {
    const env = makeEnv();
    const res = await deliver({ id: "evt_badtier", type: "customer.subscription.updated", data: { object: sub({ metadata: { icp_principal: "user-aaa", tier: "Gold" } }) } }, env);
    expect(res.status).toBe(500);
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
  });

  it("a subscription with no principal is ignored", async () => {
    const res = await deliver({ type: "customer.subscription.updated", data: { object: sub({ metadata: { tier: "Pro" } }) } });
    expect(res.status).toBe(200);
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
  });

  it("deleted drops to Free", async () => {
    await deliver({ type: "customer.subscription.deleted", data: { object: sub({ status: "canceled" }) } });
    expect(activateInCanister).toHaveBeenCalledWith("user-aaa", "Free", 0);
  });

  it("a paid renewal invoice re-reads the subscription for the new period", async () => {
    mockSubsRetrieve.mockResolvedValueOnce(sub({ current_period_end: PERIOD_END + 86_400 * 365 }));
    await deliver({ type: "invoice.paid", data: { object: { subscription: "sub_1" } } });
    expect(mockSubsRetrieve).toHaveBeenCalledWith("sub_1");
    expect(activateSubscriptionUntil).toHaveBeenCalledWith("user-aaa", "Pro", PERIOD_END + 86_400 * 365, expect.stringMatching(/^sub:sub_1:/));
  });

  it("finds the subscription id on newer invoices (parent.subscription_details)", async () => {
    mockSubsRetrieve.mockResolvedValueOnce(sub());
    await deliver({ type: "invoice.payment_succeeded", data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } } });
    expect(mockSubsRetrieve).toHaveBeenCalledWith("sub_1");
    expect(activateSubscriptionUntil).toHaveBeenCalled();
  });

  it("a paid invoice for a subscription that is no longer active grants nothing", async () => {
    mockSubsRetrieve.mockResolvedValueOnce(sub({ status: "canceled" }));
    await deliver({ type: "invoice.paid", data: { object: { subscription: "sub_1" } } });
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
  });

  it("a failed invoice drops to Free, wherever the principal is", async () => {
    await deliver({ type: "invoice.payment_failed", data: { object: { subscription_details: { metadata: { icp_principal: "user-a" } } } } });
    await deliver({ type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { metadata: { icp_principal: "user-b" } } } } } });
    await deliver({ type: "invoice.payment_failed", data: { object: { metadata: { icp_principal: "user-c" } } } });
    expect((activateInCanister as jest.Mock).mock.calls.map((c) => c[0])).toEqual(["user-a", "user-b", "user-c"]);
  });
});

describe("WH.3 — checkout.session.completed", () => {
  const session = (over: Record<string, any>) => ({ id: "cs_test_abc123", payment_status: "paid", status: "complete", ...over });

  it("grants a known credit pack once, keyed by the session", async () => {
    await deliver({ type: "checkout.session.completed", data: { object: session({ metadata: { type: "agent_credits", principal: "user-aaa", pack_size: "25" } }) } });
    expect(grantAgentCreditsOnce).toHaveBeenCalledWith("user-aaa", 25, "credits:cs_test_abc123");
  });

  it("an unknown pack size or an unpaid session grants nothing", async () => {
    await deliver({ type: "checkout.session.completed", data: { object: session({ metadata: { type: "agent_credits", principal: "user-aaa", pack_size: "1000" } }) } });
    await deliver({ type: "checkout.session.completed", data: { object: session({ payment_status: "unpaid", metadata: { type: "agent_credits", principal: "user-aaa", pack_size: "25" } }) } });
    expect(grantAgentCreditsOnce).not.toHaveBeenCalled();
  });

  it("a credit pack already granted (verify-credit-purchase got there first) is fine", async () => {
    (grantAgentCreditsOnce as jest.Mock).mockRejectedValueOnce(new (AlreadyConsumedError as any)("already"));
    const res = await deliver({ type: "checkout.session.completed", data: { object: session({ metadata: { type: "agent_credits", principal: "user-aaa", pack_size: "100" } }) } });
    expect(res.status).toBe(200);
  });

  it("records a paid, complete gift and emails it; an incomplete one is left alone", async () => {
    const meta = { is_gift: "true", tier: "Pro", billing: "Yearly", recipient_email: "kim@example.com", recipient_name: "Kim", sender_name: "Lee", gift_message: "", delivery_date: "" };
    await deliver({ type: "checkout.session.completed", data: { object: session({ status: "open", metadata: meta }) } });
    expect(recordGift).not.toHaveBeenCalled();
    await deliver({ type: "checkout.session.completed", data: { object: session({ metadata: meta }) } });
    expect(recordGift).toHaveBeenCalledWith("cs_test_abc123", "Pro", "Yearly", expect.objectContaining({ recipientEmail: "kim@example.com" }));
    expect(sendGiftEmail).toHaveBeenCalledTimes(1);
  });

  it("a gift with no valid tier is refused (500, so Stripe retries) and records nothing", async () => {
    const res = await deliver({ type: "checkout.session.completed", data: { object: session({ metadata: { is_gift: "true", tier: "Free" } }) } });
    expect(res.status).toBe(500);
    expect(recordGift).not.toHaveBeenCalled();
  });

  it("saves the referral-fee card from a setup session", async () => {
    await deliver({ type: "checkout.session.completed", data: { object: session({ mode: "setup", metadata: { type: "referral_card" } }) } });
    expect(saveCardFromSession).toHaveBeenCalledTimes(1);
  });
});

describe("WH.4 — referral fees", () => {
  it("a referral-fee invoice goes to the fee ledger, not to the subscription path", async () => {
    await deliver({ type: "invoice.paid", data: { object: { id: "in_1", metadata: { type: "referral_fee", fee_id: "RF_1" } } } });
    expect(markInvoicePaid).toHaveBeenCalledTimes(1);
    expect(mockSubsRetrieve).not.toHaveBeenCalled();
  });

  it("a succeeded payment intent goes to the fee ledger", async () => {
    await deliver({ type: "payment_intent.succeeded", data: { object: { id: "pi_1", metadata: { fee_id: "RF_1" } } } });
    expect(markPaymentIntentPaid).toHaveBeenCalledTimes(1);
  });
});

describe("WH.5 — delivery", () => {
  const event = { id: "evt_same", type: "customer.subscription.deleted", data: { object: sub() } };

  it("a redelivered event does nothing the second time", async () => {
    const env = makeEnv();
    expect((await deliver(event, env)).status).toBe(200);
    const again = await deliver(event, env);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true });
    expect(activateInCanister).toHaveBeenCalledTimes(1);
  });

  it("two deliveries of one event at once: one runs, the other gets 409 and is retried by Stripe", async () => {
    const env = makeEnv();
    let release!: () => void;
    (activateInCanister as jest.Mock).mockImplementationOnce(() => new Promise<void>((r) => { release = r; }));
    const first = deliver(event, env);
    await new Promise((r) => setTimeout(r, 10));   // the first is inside the handler
    const second = await deliver(event, env);
    expect(second.status).toBe(409);
    release();
    expect((await first).status).toBe(200);
    expect(activateInCanister).toHaveBeenCalledTimes(1);
  });

  it("a handler error releases the event, so Stripe's retry runs it again", async () => {
    const env = makeEnv();
    (activateInCanister as jest.Mock).mockRejectedValueOnce(new Error("canister down"));
    expect((await deliver(event, env)).status).toBe(500);
    expect((await deliver(event, env)).status).toBe(200);
    expect(activateInCanister).toHaveBeenCalledTimes(2);
  });
});
