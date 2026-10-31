/**
 * Worker (src/index.ts) security regressions — audit 2026-10-17.
 *
 * WSEC.1  cost-bearing AI routes need a session (X-1/F-4)
 * WSEC.2  production fails closed when VOICE_AGENT_API_KEY is unset (F-6)
 * WSEC.3  oversized bodies are refused with 413 (F-4)
 * WSEC.4  verify-subscription ignores a body principal and requires the
 *         session to own the subscription (P-1/F-1)
 * WSEC.5  verify-subscription rejects incomplete + unpaid invoice, even with a
 *         succeeded PaymentIntent from another purchase (P-1/F-1)
 * WSEC.6  verify-subscription activates until Stripe's period end with an
 *         idempotency reference (P-2/F-3)
 * WSEC.7  verify-credit-purchase is idempotent per session (P-2/F-2)
 * WSEC.8  credit / subscription checkout bind to the session principal and
 *         allowlist redirect URLs (F-3)
 * WSEC.9  webhook uses constructEventAsync; cancel_at_period_end doesn't
 *         downgrade; credits granted from checkout.session.completed (F-7)
 * WSEC.10 bidtolist email routes ignore body recipients (X-2)
 * WSEC.11 Stripe error text isn't echoed to the client (F-11)
 * WSEC.12 /admin/cycle-status needs ADMIN_API_KEY (X-1)
 */

const mockSessionsRetrieve      = jest.fn();
const mockSessionsCreate        = jest.fn();
const mockSubscriptionsRetrieve = jest.fn();
const mockInvoicesRetrieve      = jest.fn();
const mockPIRetrieve            = jest.fn();
const mockConstructEventAsync   = jest.fn();
const mockResendSend            = jest.fn();

jest.mock("stripe", () => {
  const Stripe: any = jest.fn().mockImplementation(() => ({
    checkout:       { sessions: { retrieve: mockSessionsRetrieve, create: mockSessionsCreate } },
    subscriptions:  { retrieve: mockSubscriptionsRetrieve },
    invoices:       { retrieve: mockInvoicesRetrieve },
    paymentIntents: { retrieve: mockPIRetrieve },
    webhooks:       { constructEventAsync: mockConstructEventAsync, constructEvent: jest.fn(() => { throw new Error("sync"); }) },
  }));
  Stripe.createSubtleCryptoProvider = jest.fn(() => ({ subtle: true }));
  return { __esModule: true, default: Stripe };
});

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockResendSend } })),
}), { virtual: true });

jest.mock("../paymentCanister", () => ({
  activateInCanister:        jest.fn().mockResolvedValue(undefined),
  activateSubscriptionUntil: jest.fn().mockResolvedValue(undefined),
  consumeAgentCredit:        jest.fn().mockRejectedValue(new Error("none")),
  grantAgentCreditsOnce:     jest.fn().mockResolvedValue(undefined),
  AlreadyConsumedError:      class AlreadyConsumedError extends Error {},
  PAID_TIERS:                new Set(["Pro", "ContractorPro"]),
  fetchSubscriptionTier:     jest.fn().mockResolvedValue("Free"),
}));
jest.mock("../monitoringCanister", () => ({
  getCriticalCycleAlerts: jest.fn().mockResolvedValue([]),
  checkCycleLevels:       jest.fn().mockResolvedValue([]),
  recordFrontendError:    jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../authCanister", () => ({ resolveAgentSessionOwner: jest.fn() }));
const mockComplete = jest.fn().mockResolvedValue('{"ok":true}');
jest.mock("../anthropicProvider", () => ({
  AnthropicProvider: jest.fn().mockImplementation(() => ({
    complete: mockComplete, stream: jest.fn(), completeWithTools: jest.fn(),
  })),
}));
jest.mock("../src/session", () => ({
  SESSION_HEADER: "x-agent-session",
  resolveSessionPrincipal: jest.fn(async (token: string | null) => (token === "hgs_good" ? "user-aaa" : null)),
}));
jest.mock("../src/tier", () => ({ resolveTier: jest.fn().mockResolvedValue("Free") }));

import { describe, it, expect, beforeEach } from "@jest/globals";
import worker from "../src/index";
import { activateInCanister, activateSubscriptionUntil, grantAgentCreditsOnce, AlreadyConsumedError } from "../paymentCanister";
const MockAlreadyConsumed = AlreadyConsumedError as any;

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
    STRIPE_WEBHOOK_SECRET: "whsec_x", STRIPE_PRICE_CREDITS_25: "price_25",
    STRIPE_PRICE_PRO_YEARLY: "price_pro_y",
    RATE_LIMIT: fakeKV(), ...over,
  };
}

const ctx: any = { waitUntil: () => {} };

function req(path: string, body: unknown, headers: Record<string, string> = {}, method = "POST"): Request {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: { "Content-Type": "application/json", "x-api-key": "pubkey", ...headers },
    // oxlint-disable-next-line unicorn/no-invalid-fetch-options -- body is undefined for GET
    body: method === "GET" ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const SESSION = { "x-agent-session": "hgs_good" };

beforeEach(() => {
  jest.clearAllMocks();
});

describe("WSEC.1 — AI routes need a session", () => {
  it.each(["/api/classify", "/api/maintenance/chat", "/api/pulse", "/api/rentcast/properties", "/api/buyers-truth-kit"])(
    "%s → 401 without x-agent-session", async (path) => {
      const res = await worker.fetch(req(path, { message: "hi" }), makeEnv(), ctx);
      expect(res.status).toBe(401);
      expect(mockComplete).not.toHaveBeenCalled();
    });

  it("with a session the route runs", async () => {
    const res = await worker.fetch(req("/api/rebate-finder",
      { state: "FL", zipCode: "32801", utilityProvider: "FPL", billType: "Electric" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(mockComplete).toHaveBeenCalled();
  });
});

describe("WSEC.2 — fail closed without the API key in production", () => {
  it("returns 500 for /api/* when VOICE_AGENT_API_KEY is unset", async () => {
    const res = await worker.fetch(req("/api/classify", {}, SESSION), makeEnv({ VOICE_AGENT_API_KEY: "" }), ctx);
    expect(res.status).toBe(500);
  });
  it("still rejects a wrong key", async () => {
    const res = await worker.fetch(req("/api/classify", {}, { ...SESSION, "x-api-key": "nope" }), makeEnv(), ctx);
    expect(res.status).toBe(401);
  });
});

describe("WSEC.3 — body size cap", () => {
  it("413 for a text route over 64 KB", async () => {
    const res = await worker.fetch(req("/api/negotiate", { pad: "x".repeat(70_000) }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(413);
  });
});

describe("WSEC.4/5/6 — verify-subscription", () => {
  const activeSub = (over: object = {}) => ({
    id: "sub_A", status: "active", current_period_end: 1_900_000_000,
    metadata: { icp_principal: "user-aaa", tier: "Pro", billing: "Yearly" }, ...over,
  });

  it("WSEC.4 requires a session", async () => {
    const res = await worker.fetch(req("/api/stripe/verify-subscription", { subscriptionId: "sub_A", principal: "user-aaa" }), makeEnv(), ctx);
    expect(res.status).toBe(401);
  });

  it("WSEC.4 a body principal can't redirect the activation; the session must own the subscription", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(activeSub({ metadata: { icp_principal: "someone-else", tier: "Pro", billing: "Yearly" } }));
    const res = await worker.fetch(req("/api/stripe/verify-subscription",
      { subscriptionId: "sub_A", principal: "user-aaa" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(403);
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
    expect(activateInCanister).not.toHaveBeenCalled();
  });

  it("WSEC.5 incomplete + unpaid invoice is rejected even with a succeeded PI", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(activeSub({ status: "incomplete", latest_invoice: "in_1" }));
    mockInvoicesRetrieve.mockResolvedValueOnce({ id: "in_1", status: "open" });
    mockPIRetrieve.mockResolvedValueOnce({ status: "succeeded", invoice: "in_other" });
    const res = await worker.fetch(req("/api/stripe/verify-subscription",
      { subscriptionId: "sub_A", paymentIntentId: "pi_1" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(400);
    expect(activateSubscriptionUntil).not.toHaveBeenCalled();
  });

  it("WSEC.5 incomplete + paid invoice + PI from another invoice is rejected", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(activeSub({ status: "incomplete", latest_invoice: "in_1" }));
    mockInvoicesRetrieve.mockResolvedValueOnce({ id: "in_1", status: "paid" });
    mockPIRetrieve.mockResolvedValueOnce({ status: "succeeded", invoice: "in_other" });
    const res = await worker.fetch(req("/api/stripe/verify-subscription",
      { subscriptionId: "sub_A", paymentIntentId: "pi_1" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });

  it("WSEC.6 activates the session principal until Stripe's period end, idempotently", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(activeSub());
    const res = await worker.fetch(req("/api/stripe/verify-subscription", { subscriptionId: "sub_A" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(activateSubscriptionUntil).toHaveBeenCalledWith("user-aaa", "Pro", 1_900_000_000, "sub:sub_A:1900000000");
  });

  it("WSEC.6 reads the period end from subscription items (newer API versions)", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce(activeSub({ current_period_end: undefined, items: { data: [{ current_period_end: 1_888_000_000 }] } }));
    const res = await worker.fetch(req("/api/stripe/verify-subscription", { subscriptionId: "sub_A" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(activateSubscriptionUntil).toHaveBeenCalledWith("user-aaa", "Pro", 1_888_000_000, "sub:sub_A:1888000000");
  });
});

describe("WSEC.7 — verify-credit-purchase is idempotent", () => {
  const paid = { id: "cs_test_abc", payment_status: "paid", metadata: { type: "agent_credits", principal: "user-aaa", pack_size: "25" } };

  it("grants once with a per-session reference", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce(paid);
    const res = await worker.fetch(req("/api/stripe/verify-credit-purchase", { sessionId: "cs_test_abc" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(grantAgentCreditsOnce).toHaveBeenCalledWith("user-aaa", 25, "credits:cs_test_abc");
  });

  it("a replay reports alreadyRedeemed", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce(paid);
    (grantAgentCreditsOnce as jest.Mock).mockRejectedValueOnce(new MockAlreadyConsumed());
    const res = await worker.fetch(req("/api/stripe/verify-credit-purchase", { sessionId: "cs_test_abc" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect((await res.json() as any).alreadyRedeemed).toBe(true);
  });

  it("rejects a malformed session id", async () => {
    const res = await worker.fetch(req("/api/stripe/verify-credit-purchase", { sessionId: "x/../../customers" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(400);
  });
});

describe("WSEC.8 — checkout binds the session principal and allowlists redirects", () => {
  it("rejects a successUrl off the frontend origin", async () => {
    const res = await worker.fetch(req("/api/stripe/create-credit-checkout",
      { packSize: 25, successUrl: "https://evil.test/x", cancelUrl: "https://app.test/c" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(400);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("uses the session principal, not the body's", async () => {
    mockSessionsCreate.mockResolvedValueOnce({ url: "https://checkout.stripe.com/x" });
    const res = await worker.fetch(req("/api/stripe/create-credit-checkout",
      { packSize: 25, principal: "victim-bbb", successUrl: "https://app.test/ok", cancelUrl: "https://app.test/c" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(mockSessionsCreate.mock.calls[0][0].metadata.principal).toBe("user-aaa");
  });
});

describe("WSEC.9 — webhook", () => {
  const hook = (event: object) => {
    mockConstructEventAsync.mockResolvedValueOnce(event);
    return worker.fetch(new Request("https://worker.test/api/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": "t=1,v1=x" }, body: "{}",
    }), makeEnv(), ctx);
  };

  it("verifies with constructEventAsync + SubtleCrypto provider", async () => {
    const res = await hook({ id: "evt_1", type: "ping", data: { object: {} } });
    expect(res.status).toBe(200);
    expect(mockConstructEventAsync).toHaveBeenCalledTimes(1);
    expect(mockConstructEventAsync.mock.calls[0][4]).toEqual({ subtle: true });
  });

  it("cancel_at_period_end does not downgrade immediately", async () => {
    await hook({ id: "evt_2", type: "customer.subscription.updated", data: { object: {
      id: "sub_A", status: "active", cancel_at_period_end: true, current_period_end: 1_900_000_000,
      metadata: { icp_principal: "user-aaa", tier: "Pro" } } } });
    expect(activateInCanister).not.toHaveBeenCalled();
  });

  it("subscription.deleted downgrades", async () => {
    await hook({ id: "evt_3", type: "customer.subscription.deleted", data: { object: { metadata: { icp_principal: "user-aaa" } } } });
    expect(activateInCanister).toHaveBeenCalledWith("user-aaa", "Free", 0);
  });

  it("checkout.session.completed grants credits once per session", async () => {
    await hook({ id: "evt_4", type: "checkout.session.completed", data: { object: {
      id: "cs_test_q", payment_status: "paid", metadata: { type: "agent_credits", principal: "user-aaa", pack_size: "25" } } } });
    expect(grantAgentCreditsOnce).toHaveBeenCalledWith("user-aaa", 25, "credits:cs_test_q");
  });

  it("bad signature → 400 without the library's message", async () => {
    mockConstructEventAsync.mockRejectedValueOnce(new Error("secret detail"));
    const res = await worker.fetch(new Request("https://worker.test/api/stripe/webhook", {
      method: "POST", headers: { "stripe-signature": "bad" }, body: "{}",
    }), makeEnv(), ctx);
    expect(res.status).toBe(400);
    expect(await res.text()).not.toMatch(/secret detail/);
  });
});

describe("WSEC.10 — bidtolist email routes", () => {
  // Bid to List users have no HomeGentic session; the routes are bound to
  // on-chain state instead (see bidtolistWorker.test.ts).
  it("no HomeGentic session is required, but body recipients are never used", async () => {
    const res = await worker.fetch(req("/api/bidtolist/email/proposal-result",
      { agentEmail: "victim@corp.test", agentName: "<a href=x>", city: "Austin", won: true }), makeEnv(), ctx);
    expect(res.status).toBe(400);   // requestId is required
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it("with only identifiers and no canisters wired, nothing is sent", async () => {
    const res = await worker.fetch(req("/api/bidtolist/email/proposal-result",
      { requestId: "REQ_1", agentEmail: "victim@corp.test" }), makeEnv(), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, skipped: true });
    expect(mockResendSend).not.toHaveBeenCalled();
  });
});

describe("WSEC.11 — no raw Stripe errors", () => {
  it("returns a generic message", async () => {
    mockSessionsRetrieve.mockRejectedValueOnce(new Error("No such checkout.session: cs_test_zzz; request-id req_123"));
    const res = await worker.fetch(req("/api/stripe/verify-session", { sessionId: "cs_test_zzz" }, SESSION), makeEnv(), ctx);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toMatch(/req_123/);
  });
});

describe("WSEC.12 — /admin/cycle-status", () => {
  it("404 when ADMIN_API_KEY is unset, even with the public key", async () => {
    const res = await worker.fetch(req("/admin/cycle-status", null, {}, "GET"), makeEnv(), ctx);
    expect(res.status).toBe(404);
  });
  it("401 with the wrong admin key, 200 with the right one", async () => {
    const env = makeEnv({ ADMIN_API_KEY: "adm" });
    expect((await worker.fetch(req("/admin/cycle-status", null, { "x-admin-key": "no" }, "GET"), env, ctx)).status).toBe(401);
    expect((await worker.fetch(req("/admin/cycle-status", null, { "x-admin-key": "adm" }, "GET"), env, ctx)).status).toBe(200);
  });
});
