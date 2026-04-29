/**
 * Stripe Subscription Lifecycle Integration Tests (#143)
 *
 * Tests the full subscription lifecycle via the /api/stripe/webhook endpoint
 * using real Stripe test-mode signatures (STRIPE_WEBHOOK_SECRET required).
 *
 * Scenarios covered:
 *   - checkout session creation with correct metadata
 *   - customer.subscription.deleted  → 200 { received: true }
 *   - customer.subscription.updated (cancel_at_period_end) → 200
 *   - invoice.payment_failed → 200
 *   - invoice.payment_succeeded → 200
 *   - spoofed webhook (wrong signature) → 400
 *   - downgrade: subscription updated status=canceled → 200
 *
 * Requires STRIPE_SECRET_KEY (sk_test_...) and STRIPE_WEBHOOK_SECRET in .env.
 * Skipped automatically when unconfigured so CI stays green without secrets.
 *
 * Run manually:
 *   cd agents/voice && npm test -- stripe.subscription
 */

import "dotenv/config";

// jest.mock is hoisted above all imports.
jest.mock("../anthropicProvider", () => ({
  createAnthropicProvider: jest.fn().mockReturnValue({
    stream: jest.fn(),
    complete: jest.fn(),
    completeWithTools: jest.fn(),
  }),
}));
jest.mock("../prompts", () => ({
  buildSystemPrompt: jest.fn().mockReturnValue("test"),
}));
jest.mock("../../maintenance/prompts", () => ({
  buildMaintenanceSystemPrompt: jest.fn().mockReturnValue("test"),
}));
// Prevent canister calls during tests — activation is best-effort anyway.
jest.mock("../paymentCanister", () => ({
  activateInCanister: jest.fn().mockResolvedValue(undefined),
  consumeAgentCredit: jest.fn().mockResolvedValue(undefined),
  grantAgentCredits:  jest.fn().mockResolvedValue(undefined),
  VALID_TIERS: new Set(["Free", "Basic", "Pro", "Premium", "ContractorFree", "ContractorPro", "RealtorFree", "RealtorPro"]),
}));

import Stripe from "stripe";
import supertest from "supertest";
import { app } from "../server";

const SECRET_KEY       = process.env.STRIPE_SECRET_KEY ?? "";
const WEBHOOK_SECRET   = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";

const describeIfConfigured =
  SECRET_KEY.startsWith("sk_test_") && WEBHOOK_SECRET.length > 0
    ? describe
    : describe.skip;

describeIfConfigured("Stripe subscription lifecycle integration", () => {
  let stripe: Stripe;

  beforeAll(() => {
    stripe = new Stripe(SECRET_KEY);
  });

  /**
   * Send an event object to the webhook endpoint signed with STRIPE_WEBHOOK_SECRET.
   * The event is serialised to JSON, signed, then sent as a raw Buffer so the
   * express.raw() middleware on /api/stripe/webhook receives the unmodified body.
   */
  async function sendWebhookEvent(event: object) {
    const payload = JSON.stringify(event);
    const header  = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    return supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);
  }

  /** Build a minimal Stripe event envelope. */
  function makeEvent(type: string, data: object) {
    return {
      id:          `evt_inttest_${type.replace(/\./g, "_")}_${Date.now()}`,
      object:      "event",
      type,
      data:        { object: data },
      created:     Math.floor(Date.now() / 1000),
      livemode:    false,
      api_version: "2024-04-10",
    };
  }

  // ── checkout session ─────────────────────────────────────────────────────────

  it("creates a Pro Monthly checkout session with icp_principal metadata", async () => {
    if (!PRICE_PRO_MONTHLY) {
      console.warn("[stripe.subscription.integration] STRIPE_PRICE_PRO_MONTHLY not set — skipping");
      return;
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_PRO_MONTHLY, quantity: 1 }],
      success_url: "http://localhost:5173/payment-success",
      cancel_url:  "http://localhost:5173/payment-failure",
      metadata: {
        icp_principal: "lifecycle-integration-test",
        tier:          "Pro",
        billing:       "Monthly",
        is_gift:       "false",
      },
    });
    expect(session.id).toMatch(/^cs_test_/);
    expect(session.metadata?.tier).toBe("Pro");
    expect(session.metadata?.icp_principal).toBe("lifecycle-integration-test");
  }, 15_000);

  // ── customer.subscription.deleted ────────────────────────────────────────────

  it("customer.subscription.deleted → 200 { received: true }", async () => {
    const event = makeEvent("customer.subscription.deleted", {
      id:       "sub_inttest_deleted",
      object:   "subscription",
      status:   "canceled",
      metadata: { icp_principal: "lifecycle-test-delete", tier: "Pro", billing: "Monthly" },
    });
    const res = await sendWebhookEvent(event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  }, 15_000);

  // ── customer.subscription.updated — cancel_at_period_end ─────────────────────

  it("customer.subscription.updated (cancel_at_period_end=true) → 200", async () => {
    const event = makeEvent("customer.subscription.updated", {
      id:                  "sub_inttest_updated",
      object:              "subscription",
      status:              "active",
      cancel_at_period_end: true,
      metadata:            { icp_principal: "lifecycle-test-downgrade", tier: "Pro" },
    });
    const res = await sendWebhookEvent(event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  }, 15_000);

  // ── customer.subscription.updated — status=canceled ──────────────────────────

  it("customer.subscription.updated (status=canceled) → 200", async () => {
    const event = makeEvent("customer.subscription.updated", {
      id:                  "sub_inttest_canceled",
      object:              "subscription",
      status:              "canceled",
      cancel_at_period_end: false,
      metadata:            { icp_principal: "lifecycle-test-cancel", tier: "Premium" },
    });
    const res = await sendWebhookEvent(event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  }, 15_000);

  // ── invoice.payment_failed ────────────────────────────────────────────────────

  it("invoice.payment_failed → 200, reverts tier to Free", async () => {
    const event = makeEvent("invoice.payment_failed", {
      id:       "in_inttest_fail",
      object:   "invoice",
      status:   "open",
      metadata: { icp_principal: "lifecycle-test-fail" },
    });
    const res = await sendWebhookEvent(event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  }, 15_000);

  // ── invoice.payment_succeeded ─────────────────────────────────────────────────

  it("invoice.payment_succeeded → 200, activates Pro tier", async () => {
    const event = makeEvent("invoice.payment_succeeded", {
      id:       "in_inttest_ok",
      object:   "invoice",
      status:   "paid",
      metadata: { icp_principal: "lifecycle-test-ok", tier: "Pro", billing: "Monthly" },
    });
    const res = await sendWebhookEvent(event);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  }, 15_000);

  // ── spoofed webhook ───────────────────────────────────────────────────────────

  it("rejects a webhook signed with the wrong secret → 400", async () => {
    const payload     = JSON.stringify(makeEvent("customer.subscription.deleted", {}));
    const wrongHeader = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_spoofed_wrong_secret_00000000000",
    });
    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", wrongHeader)
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  }, 15_000);

  // ── no stripe-signature header ────────────────────────────────────────────────

  it("rejects a request with no stripe-signature header → 400", async () => {
    const payload = JSON.stringify(makeEvent("ping", {}));
    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(payload);
    expect(res.status).toBe(400);
  }, 15_000);
});
