/**
 * Stripe verify-session, verify-subscription, verify-credit-purchase — runtime tests
 *
 * VERIFY.1  verify-session — missing sessionId → 400
 * VERIFY.2  verify-session — STRIPE_SECRET_KEY not set → 500
 * VERIFY.3  verify-session — session not paid → 400
 * VERIFY.4  verify-session — paid subscription (Monthly) → 200, activateInCanister called
 * VERIFY.5  verify-session — paid subscription (Yearly) → 12 months passed
 * VERIFY.6  verify-session — gift session → 200 { type: "gift" }, no canister call
 * VERIFY.7  verify-subscription — missing subscriptionId → 400
 * VERIFY.8  verify-subscription — active subscription → 200, activateInCanister called
 * VERIFY.9  verify-subscription — incomplete + confirmed PI → 200
 * VERIFY.10 verify-credit-purchase — session type not agent_credits → 400
 * VERIFY.11 verify-credit-purchase — invalid pack_size → 400
 * VERIFY.12 verify-credit-purchase — valid 25-credit pack → 200, grantAgentCredits called
 */

// jest.mock calls are hoisted by babel-jest — variables with mock* prefix are allowed.
const mockSessionsRetrieve        = jest.fn();
const mockSubscriptionsRetrieve   = jest.fn();
const mockPaymentIntentsRetrieve  = jest.fn();

jest.mock("stripe", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    checkout:       { sessions:      { retrieve: mockSessionsRetrieve } },
    subscriptions:  { retrieve: mockSubscriptionsRetrieve },
    paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
  })),
}));

jest.mock("../paymentCanister", () => ({
  activateInCanister: jest.fn().mockResolvedValue(undefined),
  consumeAgentCredit: jest.fn().mockResolvedValue(undefined),
  grantAgentCredits:  jest.fn().mockResolvedValue(undefined),
  VALID_TIERS: new Set(["Free", "Basic", "Pro", "Premium", "ContractorFree", "ContractorPro", "RealtorFree", "RealtorPro"]),
}));

jest.mock("../anthropicProvider", () => ({
  createAnthropicProvider: jest.fn().mockReturnValue({
    stream: jest.fn(), complete: jest.fn(), completeWithTools: jest.fn(),
  }),
}));
jest.mock("../prompts", () => ({
  buildSystemPrompt: jest.fn().mockReturnValue("test"),
}));
jest.mock("../../maintenance/prompts", () => ({
  buildMaintenanceSystemPrompt: jest.fn().mockReturnValue("test"),
}));

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import supertest from "supertest";
import { app } from "../server";
import { activateInCanister, grantAgentCredits } from "../paymentCanister";

const mockActivate = activateInCanister as jest.Mock;
const mockGrant    = grantAgentCredits   as jest.Mock;

const STRIPE_KEY = "sk_test_placeholder";

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_SECRET_KEY = STRIPE_KEY;
});
afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function paidSession(overrides: object = {}) {
  return {
    payment_status: "paid",
    status:         "complete",
    metadata: {
      icp_principal: "test-user-001",
      tier:          "Pro",
      billing:       "Monthly",
      is_gift:       "false",
    },
    ...overrides,
  };
}

// ── VERIFY.1 — missing sessionId ─────────────────────────────────────────────

describe("VERIFY.1 — verify-session missing sessionId", () => {
  it("returns 400", async () => {
    const res = await supertest(app).post("/api/stripe/verify-session").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId/i);
  });
});

// ── VERIFY.2 — STRIPE_SECRET_KEY not set ─────────────────────────────────────

describe("VERIFY.2 — verify-session without STRIPE_SECRET_KEY", () => {
  it("returns 500", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await supertest(app)
      .post("/api/stripe/verify-session")
      .send({ sessionId: "cs_test_xxx" });
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/STRIPE_SECRET_KEY/);
  });
});

// ── VERIFY.3 — session not paid ───────────────────────────────────────────────

describe("VERIFY.3 — verify-session not paid", () => {
  it("returns 400 when payment_status is not paid", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce({ payment_status: "unpaid", status: "open", metadata: {} });
    const res = await supertest(app)
      .post("/api/stripe/verify-session")
      .send({ sessionId: "cs_test_unpaid" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Payment not complete/i);
  });
});

// ── VERIFY.4 — paid subscription Monthly ─────────────────────────────────────

describe("VERIFY.4 — verify-session paid subscription (Monthly)", () => {
  it("returns 200 and calls activateInCanister with 1 month", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce(paidSession());
    const res = await supertest(app)
      .post("/api/stripe/verify-session")
      .send({ sessionId: "cs_test_ok" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: "subscription", tier: "Pro", billing: "Monthly" });
    expect(mockActivate).toHaveBeenCalledWith("test-user-001", "Pro", 1);
  });
});

// ── VERIFY.5 — paid subscription Yearly ──────────────────────────────────────

describe("VERIFY.5 — verify-session paid subscription (Yearly)", () => {
  it("calls activateInCanister with 12 months for Yearly billing", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce(
      paidSession({ metadata: { icp_principal: "test-user-002", tier: "Premium", billing: "Yearly", is_gift: "false" } })
    );
    await supertest(app).post("/api/stripe/verify-session").send({ sessionId: "cs_test_yearly" });
    expect(mockActivate).toHaveBeenCalledWith("test-user-002", "Premium", 12);
  });
});

// ── VERIFY.6 — gift session ───────────────────────────────────────────────────

describe("VERIFY.6 — verify-session gift", () => {
  it("returns { type: 'gift' } and does not call activateInCanister", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce(
      paidSession({ metadata: { icp_principal: "", tier: "Pro", billing: "Monthly", is_gift: "true" } })
    );
    const res = await supertest(app)
      .post("/api/stripe/verify-session")
      .send({ sessionId: "cs_test_gift" });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("gift");
    expect(mockActivate).not.toHaveBeenCalled();
  });
});

// ── VERIFY.7 — verify-subscription missing subscriptionId ────────────────────

describe("VERIFY.7 — verify-subscription missing subscriptionId", () => {
  it("returns 400", async () => {
    const res = await supertest(app).post("/api/stripe/verify-subscription").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subscriptionId/i);
  });
});

// ── VERIFY.8 — verify-subscription active ────────────────────────────────────

describe("VERIFY.8 — verify-subscription active subscription", () => {
  it("returns 200 and calls activateInCanister", async () => {
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "active",
      metadata: { tier: "Basic", billing: "Monthly", icp_principal: "test-user-003" },
    });
    const res = await supertest(app)
      .post("/api/stripe/verify-subscription")
      .send({ subscriptionId: "sub_test_active" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: "subscription", tier: "Basic", billing: "Monthly" });
    expect(mockActivate).toHaveBeenCalledWith("test-user-003", "Basic", 1);
  });
});

// ── VERIFY.9 — verify-subscription incomplete + confirmed PI ─────────────────

describe("VERIFY.9 — verify-subscription incomplete with confirmed PaymentIntent", () => {
  it("returns 200 when subscription is incomplete but PI succeeded", async () => {
    mockPaymentIntentsRetrieve.mockResolvedValueOnce({ status: "succeeded" });
    mockSubscriptionsRetrieve.mockResolvedValueOnce({
      status: "incomplete",
      metadata: { tier: "Pro", billing: "Monthly", icp_principal: "test-user-004" },
    });
    const res = await supertest(app)
      .post("/api/stripe/verify-subscription")
      .send({ subscriptionId: "sub_test_incomplete", paymentIntentId: "pi_test_ok" });

    expect(res.status).toBe(200);
    expect(mockActivate).toHaveBeenCalledWith("test-user-004", "Pro", 1);
  });
});

// ── VERIFY.10 — verify-credit-purchase wrong type ────────────────────────────

describe("VERIFY.10 — verify-credit-purchase wrong session type", () => {
  it("returns 400 when session metadata type is not agent_credits", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: { type: "subscription" },
    });
    const res = await supertest(app)
      .post("/api/stripe/verify-credit-purchase")
      .send({ sessionId: "cs_test_wrong" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a credit pack/i);
  });
});

// ── VERIFY.11 — verify-credit-purchase invalid pack_size ─────────────────────

describe("VERIFY.11 — verify-credit-purchase invalid pack_size", () => {
  it("returns 400 when pack_size is not in CREDIT_PACKS", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: { type: "agent_credits", principal: "test-user-005", pack_size: "50" },
    });
    const res = await supertest(app)
      .post("/api/stripe/verify-credit-purchase")
      .send({ sessionId: "cs_test_bad_pack" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid metadata/i);
  });
});

// ── VERIFY.12 — verify-credit-purchase valid 25-pack ─────────────────────────

describe("VERIFY.12 — verify-credit-purchase valid 25-credit pack", () => {
  it("returns 200 and calls grantAgentCredits with 25", async () => {
    mockSessionsRetrieve.mockResolvedValueOnce({
      payment_status: "paid",
      metadata: { type: "agent_credits", principal: "test-user-006", pack_size: "25" },
    });
    const res = await supertest(app)
      .post("/api/stripe/verify-credit-purchase")
      .send({ sessionId: "cs_test_credits" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ type: "agent_credits", packSize: 25, principal: "test-user-006" });
    expect(mockGrant).toHaveBeenCalledWith("test-user-006", 25);
  });
});
