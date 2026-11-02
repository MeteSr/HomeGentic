/**
 * Worker billing and identity routes (claims & compliance fixes, 2026-10-19).
 *
 * WBILL.1 cancel-subscription sets cancel_at_period_end on the caller's live
 *         subscriptions only
 * WBILL.2 a gift checkout is a one-time payment, never a subscription
 * WBILL.3 identity-session starts a Stripe Identity check for the session
 *         principal, allowlists the return URL and caps checks per day
 * WBILL.4 identity.verification_session.verified records the result on the
 *         property through the relay
 * WBILL.5 a paid gift is recorded and the recipient is emailed
 * WBILL.6 sendGiftEmail sends one idempotent email with the redeem link
 */

const mockSessionsCreate   = jest.fn();
const mockSubsSearch       = jest.fn();
const mockSubsUpdate       = jest.fn();
const mockIdvCreate        = jest.fn();
const mockIdvRetrieve      = jest.fn();
const mockConstructEvent   = jest.fn();

jest.mock("stripe", () => {
  const Stripe: any = jest.fn().mockImplementation(() => ({
    checkout:      { sessions: { create: mockSessionsCreate, retrieve: jest.fn() } },
    subscriptions: { search: mockSubsSearch, update: mockSubsUpdate, retrieve: jest.fn() },
    identity:      { verificationSessions: { create: mockIdvCreate, retrieve: mockIdvRetrieve } },
    webhooks:      { constructEventAsync: mockConstructEvent },
  }));
  Stripe.createSubtleCryptoProvider = jest.fn(() => ({ subtle: true }));
  return { __esModule: true, default: Stripe };
});

jest.mock("../paymentCanister", () => ({
  activateInCanister:        jest.fn().mockResolvedValue(undefined),
  activateSubscriptionUntil: jest.fn().mockResolvedValue(undefined),
  consumeAgentCredit:        jest.fn().mockRejectedValue(new Error("none")),
  grantAgentCreditsOnce:     jest.fn().mockResolvedValue(undefined),
  recordGift:                jest.fn().mockResolvedValue(undefined),
  AlreadyConsumedError:      class AlreadyConsumedError extends Error {},
  PAID_TIERS:                new Set(["Pro", "ContractorPro"]),
  PRINCIPAL_RE:              /^(?=.{1,63}$)[a-z0-9]+(?:-[a-z0-9]+)*$/,
  fetchSubscriptionTier:     jest.fn().mockResolvedValue("Free"),
  getAgent:                  jest.fn(),
}));
jest.mock("../monitoringCanister", () => ({
  recordServiceError:     jest.fn().mockResolvedValue(undefined),
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels:       jest.fn().mockResolvedValue([]),
  recordFrontendError:    jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
jest.mock("../src/tier", () => ({ resolveTier: jest.fn().mockResolvedValue("Free") }));
jest.mock("../src/session", () => ({
  SESSION_HEADER: "x-agent-session",
  resolveSessionPrincipal: jest.fn(async (token: string | null) => (token === "hgs_good" ? "user-aaa" : null)),
}));
jest.mock("../src/propertyCanister", () => ({ markIdentityCleared: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../src/offchainOutcalls", () => {
  const actual = jest.requireActual("../src/offchainOutcalls");
  return { ...actual, sendGiftEmail: jest.fn().mockResolvedValue(true) };
});

import { describe, it, expect, beforeEach } from "@jest/globals";
import worker from "../src/index";
import { recordGift } from "../paymentCanister";
import { markIdentityCleared } from "../src/propertyCanister";
import { sendGiftEmail } from "../src/offchainOutcalls";

const { sendGiftEmail: realSendGiftEmail } = jest.requireActual("../src/offchainOutcalls");

function fakeKV() {
  const store = new Map<string, string>();
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v); },
  } as unknown as KVNamespace;
}

function makeEnv(over: Record<string, unknown> = {}): any {
  return {
    ANTHROPIC_API_KEY: "sk-ant", VOICE_AGENT_API_KEY: "pubkey", FRONTEND_ORIGIN: "https://app.test",
    NODE_ENV: "production", CANISTER_ID_AUTH: "auth-id", STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
    RATE_LIMIT: fakeKV(), ...over,
  };
}

const ctx: any = { waitUntil: () => {} };
const SESSION = { "x-agent-session": "hgs_good" };

function req(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": "pubkey", ...headers },
    body: JSON.stringify(body),
  });
}

function hook(event: object, env = makeEnv()) {
  mockConstructEvent.mockResolvedValueOnce(event);
  return worker.fetch(new Request("https://worker.test/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}",
  }), env, ctx);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WBILL.1 — cancel-subscription", () => {
  it("requires a session", async () => {
    const res = await worker.fetch(req("/api/stripe/cancel-subscription", {}), makeEnv(), ctx);
    expect(res.status).toBe(401);
    expect(mockSubsSearch).not.toHaveBeenCalled();
  });

  it("stops renewal on the caller's live subscriptions only", async () => {
    mockSubsSearch.mockResolvedValueOnce({ data: [
      { id: "sub_live",  status: "active",   cancel_at_period_end: false, metadata: { icp_principal: "user-aaa" } },
      { id: "sub_done",  status: "canceled", cancel_at_period_end: false, metadata: { icp_principal: "user-aaa" } },
      { id: "sub_other", status: "active",   cancel_at_period_end: false, metadata: { icp_principal: "user-bbb" } },
    ] });
    mockSubsUpdate.mockResolvedValueOnce({ id: "sub_live", current_period_end: 1_900_000_000 });

    const res = await worker.fetch(req("/api/stripe/cancel-subscription", {}, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 1, periodEnd: 1_900_000_000 });
    expect(mockSubsSearch.mock.calls[0][0].query).toBe("metadata['icp_principal']:'user-aaa'");
    expect(mockSubsUpdate).toHaveBeenCalledTimes(1);
    expect(mockSubsUpdate).toHaveBeenCalledWith("sub_live", { cancel_at_period_end: true });
  });

  it("succeeds with nothing to cancel", async () => {
    mockSubsSearch.mockResolvedValueOnce({ data: [] });
    const res = await worker.fetch(req("/api/stripe/cancel-subscription", {}, SESSION), makeEnv(), ctx);
    expect(await res.json()).toEqual({ cancelled: 0, periodEnd: null });
  });
});

describe("WBILL.2 — gift checkout", () => {
  it("is a one-time payment with no subscription", async () => {
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/g" });
    const res = await worker.fetch(req("/api/stripe/create-checkout", {
      tier: "Pro", billing: "Yearly", successUrl: "https://app.test/ok", cancelUrl: "https://app.test/c",
      gift: { recipientEmail: "friend@example.com", recipientName: "Sam", senderName: "Ali", giftMessage: "Enjoy" },
    }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    const args = mockSessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.subscription_data).toBeUndefined();
    expect(args.line_items[0].price_data.unit_amount).toBe(5_900);
    expect(args.metadata).toMatchObject({ is_gift: "true", recipient_email: "friend@example.com" });
  });

  it("a normal checkout is still a subscription", async () => {
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/s" });
    await worker.fetch(req("/api/stripe/create-checkout", {
      tier: "Pro", billing: "Yearly", successUrl: "https://app.test/ok", cancelUrl: "https://app.test/c",
    }, SESSION), makeEnv(), ctx);
    const args = mockSessionsCreate.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.subscription_data.metadata.icp_principal).toBe("user-aaa");
  });
});

describe("WBILL.3 — identity-session", () => {
  const body = { propertyId: "prop_1", returnUrl: "https://app.test/properties/prop_1/verify/identity?submitted=1" };

  it("starts a document + selfie check bound to the session principal", async () => {
    mockIdvCreate.mockResolvedValueOnce({ url: "https://verify.stripe.com/x" });
    const res = await worker.fetch(req("/api/stripe/identity-session", body, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://verify.stripe.com/x" });
    const args = mockIdvCreate.mock.calls[0][0];
    expect(args.type).toBe("document");
    expect(args.options.document).toMatchObject({ require_matching_selfie: true, require_live_capture: true });
    expect(args.metadata).toEqual({ icp_principal: "user-aaa", property_id: "prop_1" });
  });

  it("rejects a return URL off the frontend origin", async () => {
    const res = await worker.fetch(req("/api/stripe/identity-session",
      { ...body, returnUrl: "https://evil.test/x" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(400);
    expect(mockIdvCreate).not.toHaveBeenCalled();
  });

  it("rejects a malformed property id", async () => {
    const res = await worker.fetch(req("/api/stripe/identity-session",
      { ...body, propertyId: "../x" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it("allows three checks a day", async () => {
    mockIdvCreate.mockResolvedValue({ url: "https://verify.stripe.com/x" });
    const env = makeEnv();
    for (let i = 0; i < 3; i++) {
      expect((await worker.fetch(req("/api/stripe/identity-session", body, SESSION), env, ctx)).status).toBe(200);
    }
    expect((await worker.fetch(req("/api/stripe/identity-session", body, SESSION), env, ctx)).status).toBe(429);
  });
});

describe("WBILL.4 — identity webhook", () => {
  it("records the verified name on the property", async () => {
    mockIdvRetrieve.mockResolvedValueOnce({ verified_outputs: { first_name: "Jo", last_name: "Smith" } });
    const res = await hook({ id: "evt_i", type: "identity.verification_session.verified", data: { object: {
      id: "vs_123", metadata: { icp_principal: "user-aaa", property_id: "prop_1" } } } });
    expect(res.status).toBe(200);
    expect(mockIdvRetrieve).toHaveBeenCalledWith("vs_123", { expand: ["verified_outputs"] });
    expect(markIdentityCleared).toHaveBeenCalledWith("prop_1", "user-aaa", "vs_123", "Jo Smith");
  });

  it("ignores a session without our metadata", async () => {
    await hook({ id: "evt_j", type: "identity.verification_session.verified", data: { object: { id: "vs_9", metadata: {} } } });
    expect(markIdentityCleared).not.toHaveBeenCalled();
  });
});

describe("WBILL.5 — paid gift", () => {
  it("records the gift and emails the recipient", async () => {
    await hook({ id: "evt_g", type: "checkout.session.completed", data: { object: {
      id: "cs_test_gift1", payment_status: "paid", status: "complete",
      metadata: { is_gift: "true", tier: "Pro", billing: "Yearly", recipient_email: "friend@example.com",
        recipient_name: "Sam", sender_name: "Ali", gift_message: "Enjoy" } } } });
    expect(recordGift).toHaveBeenCalledWith("cs_test_gift1", "Pro", "Yearly", expect.objectContaining({ recipientEmail: "friend@example.com" }));
    expect(sendGiftEmail).toHaveBeenCalledWith(
      expect.objectContaining({ giftToken: "cs_test_gift1", recipientEmail: "friend@example.com", senderName: "Ali" }),
      expect.anything(),
    );
  });
});

describe("WBILL.6 — sendGiftEmail", () => {
  const gift = { giftToken: "cs_test_abc", tier: "Pro", recipientEmail: "friend@example.com", recipientName: "Sam", senderName: "Ali <b>", giftMessage: "Enjoy" };

  it("sends the redeem link once, with escaped names", async () => {
    const fetchImpl = jest.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    const ok = await realSendGiftEmail(gift, { RESEND_API_KEY: "re_x", FRONTEND_ORIGIN: "https://app.test/" } as any, fetchImpl);
    expect(ok).toBe(true);
    const [, init] = (fetchImpl as any).mock.calls[0];
    expect(init.headers["Idempotency-Key"] ?? init.headers["idempotency-key"]).toBe("gift:cs_test_abc");
    const payload = JSON.parse(init.body);
    expect(payload.html).toContain("https://app.test/gift/redeem?token=cs_test_abc");
    expect(payload.html).not.toContain("<b>");
  });

  it("sends nothing without Resend or with a bad address", async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    expect(await realSendGiftEmail(gift, { FRONTEND_ORIGIN: "https://app.test" } as any, fetchImpl)).toBe(false);
    expect(await realSendGiftEmail({ ...gift, recipientEmail: "nope" }, { RESEND_API_KEY: "re_x", FRONTEND_ORIGIN: "https://app.test" } as any, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
