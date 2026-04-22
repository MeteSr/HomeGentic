/**
 * Stripe Webhook endpoint tests (#143)
 *
 * WEBHOOK.1  POST /api/stripe/webhook — route is registered in server.ts (source)
 * WEBHOOK.2  POST /api/stripe/webhook — uses express.raw body parser (source)
 * WEBHOOK.3  POST /api/stripe/webhook — STRIPE_WEBHOOK_SECRET not configured → 500
 * WEBHOOK.4  POST /api/stripe/webhook — missing stripe-signature header → 400
 * WEBHOOK.5  POST /api/stripe/webhook — invalid stripe-signature (wrong secret) → 400
 * WEBHOOK.6  POST /api/stripe/webhook — valid signature, unhandled event type → 200 { received: true }
 * WEBHOOK.7  POST /api/stripe/webhook — customer.subscription.deleted → 200, reverts to Free
 * WEBHOOK.8  POST /api/stripe/webhook — subscription.deleted with no principal → 200, no dfx call
 * WEBHOOK.9  POST /api/stripe/webhook — invoice.payment_failed → 200, reverts to Free
 * WEBHOOK.10 POST /api/stripe/webhook — invoice.payment_succeeded → 200, activates tier
 * WEBHOOK.11 POST /api/stripe/webhook — replayed timestamp (> 300 s old) → 400
 * WEBHOOK.12 webhook route bypasses VOICE_AGENT_API_KEY auth (source)
 *
 * No real Stripe API calls — uses stripe.webhooks.generateTestHeaderString with a
 * fixed test secret. child_process is mocked so no dfx binary is needed.
 */

// jest.mock calls are hoisted above all imports by babel-jest.
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

// Mock exec so dfx CLI calls inside activateInCanister / revertPrincipalToFree succeed.
// util.promisify wraps the callback-style exec, so the mock must accept (cmd, callback).
jest.mock("child_process", () => ({
  exec: jest.fn((_cmd: string, cb: (err: null, result: { stdout: string; stderr: string }) => void) => {
    cb(null, { stdout: "(ok)", stderr: "" });
  }),
}));

import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import supertest from "supertest";
import Stripe from "stripe";
import { exec } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import { app } from "../server";

const mockExec = exec as jest.Mock;

const SERVER_PATH = resolve(__dirname, "../server.ts");
const src = readFileSync(SERVER_PATH, "utf8");

// Fixed test secret — never used for real Stripe calls.
const WEBHOOK_SECRET = "whsec_test_01234567890abcdef01234567890abcdef";
// Stripe instance used only for generateTestHeaderString (no API calls made).
const stripeHelper = new Stripe("sk_test_placeholder_for_test_header_generation_only");

/** Sign a JSON payload string with the given webhook secret. */
function sign(payload: string, secret = WEBHOOK_SECRET): string {
  return stripeHelper.webhooks.generateTestHeaderString({ payload, secret });
}

/** Build a minimal Stripe event envelope. */
function makeEvent(type: string, data: object): string {
  return JSON.stringify({
    id:          `evt_test_${type.replace(/\./g, "_")}`,
    object:      "event",
    type,
    data:        { object: data },
    created:     Math.floor(Date.now() / 1000),
    livemode:    false,
    api_version: "2024-04-10",
  });
}

// ── WEBHOOK.1 — route registration (source) ───────────────────────────────────

describe("WEBHOOK.1 — route registration", () => {
  it("registers POST /api/stripe/webhook in server.ts", () => {
    expect(src).toMatch(/app\.post\(\s*["'`]\/api\/stripe\/webhook["'`]/);
  });
});

// ── WEBHOOK.2 — raw body parser (source) ──────────────────────────────────────

describe("WEBHOOK.2 — raw body parser", () => {
  it("calls express.raw() for the webhook path", () => {
    expect(src).toMatch(/express\.raw\s*\(/);
  });

  it("guards the raw parser behind a stripe/webhook path check", () => {
    // The raw parser must be conditional on the webhook path
    const bodyParserBlock = src.slice(
      src.indexOf("app.use((req, res, next) => {"),
      src.indexOf("app.use(\"/api/\", apiLimiter)"),
    );
    expect(bodyParserBlock).toMatch(/stripe\/webhook/);
    expect(bodyParserBlock).toMatch(/express\.raw/);
  });
});

// ── WEBHOOK.12 — webhook bypasses API key auth (source) ───────────────────────

describe("WEBHOOK.12 — webhook bypasses VOICE_AGENT_API_KEY auth", () => {
  it("skips API key check for stripe/webhook path", () => {
    // The API key middleware must have an early-return for the webhook path
    const authMiddlewareBlock = src.slice(
      src.indexOf("§49 — API key auth middleware"),
      src.indexOf("// ── Structured request logging"),
    );
    expect(authMiddlewareBlock).toMatch(/stripe\/webhook/);
  });
});

// ── WEBHOOK.3 — fail-closed when secret is not configured ────────────────────

describe("WEBHOOK.3 — STRIPE_WEBHOOK_SECRET guard", () => {
  let saved: string | undefined;
  beforeEach(() => { saved = process.env.STRIPE_WEBHOOK_SECRET; delete process.env.STRIPE_WEBHOOK_SECRET; });
  afterEach(() => { saved !== undefined ? (process.env.STRIPE_WEBHOOK_SECRET = saved) : delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 500 when STRIPE_WEBHOOK_SECRET is not set", async () => {
    const payload = makeEvent("ping", {});
    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(payload);
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/STRIPE_WEBHOOK_SECRET/);
  });
});

// ── WEBHOOK.4 — missing stripe-signature ──────────────────────────────────────

describe("WEBHOOK.4 — missing stripe-signature header", () => {
  beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET; });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 400 when stripe-signature header is absent", async () => {
    const payload = makeEvent("ping", {});
    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stripe-signature/i);
  });
});

// ── WEBHOOK.5 — invalid stripe-signature ──────────────────────────────────────

describe("WEBHOOK.5 — invalid stripe-signature", () => {
  beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET; });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 400 when signature is signed with the wrong secret", async () => {
    const payload     = makeEvent("ping", {});
    const wrongHeader = sign(payload, "whsec_totally_wrong_secret_xxxxxxxxxxx");
    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", wrongHeader)
      .send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/signature/i);
  });
});

// ── WEBHOOK.6 — unhandled event type ─────────────────────────────────────────

describe("WEBHOOK.6 — valid signature, unhandled event type", () => {
  beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET; });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 200 { received: true } for event types we do not act on", async () => {
    const payload = makeEvent("product.created", { id: "prod_test" });
    const header  = sign(payload);
    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

// ── WEBHOOK.7 — customer.subscription.deleted (with principal) ────────────────

describe("WEBHOOK.7 — customer.subscription.deleted", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockExec.mockClear();
  });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 200 and calls dfx to revert principal to Free", async () => {
    const sub = {
      id: "sub_test123", object: "subscription", status: "canceled",
      metadata: { icp_principal: "test-user-001" },
    };
    const payload = makeEvent("customer.subscription.deleted", sub);
    const header  = sign(payload);

    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockExec).toHaveBeenCalled();
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("adminActivateStripeSubscription");
    expect(cmd).toContain("Free");
    expect(cmd).toContain("test-user-001");
  });
});

// ── WEBHOOK.8 — customer.subscription.deleted (no principal) ─────────────────

describe("WEBHOOK.8 — subscription.deleted with no principal", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockExec.mockClear();
  });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 200 and makes no dfx call when principal is absent", async () => {
    const sub = { id: "sub_noprincipal", object: "subscription", status: "canceled", metadata: {} };
    const payload = makeEvent("customer.subscription.deleted", sub);
    const header  = sign(payload);

    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);

    expect(res.status).toBe(200);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

// ── WEBHOOK.9 — invoice.payment_failed ───────────────────────────────────────

describe("WEBHOOK.9 — invoice.payment_failed", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockExec.mockClear();
  });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 200 and reverts to Free on payment failure", async () => {
    const invoice = {
      id: "in_test_fail", object: "invoice", status: "open",
      metadata: { icp_principal: "test-user-002" },
    };
    const payload = makeEvent("invoice.payment_failed", invoice);
    const header  = sign(payload);

    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockExec).toHaveBeenCalled();
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("Free");
    expect(cmd).toContain("test-user-002");
  });
});

// ── WEBHOOK.10 — invoice.payment_succeeded ───────────────────────────────────

describe("WEBHOOK.10 — invoice.payment_succeeded", () => {
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    mockExec.mockClear();
  });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 200 and activates the Pro tier on payment success", async () => {
    const invoice = {
      id: "in_test_ok", object: "invoice", status: "paid",
      metadata: { icp_principal: "test-user-003", tier: "Pro", billing: "Monthly" },
    };
    const payload = makeEvent("invoice.payment_succeeded", invoice);
    const header  = sign(payload);

    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(mockExec).toHaveBeenCalled();
    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("adminActivateStripeSubscription");
    expect(cmd).toContain("Pro");
    expect(cmd).toContain("test-user-003");
  });

  it("uses 12 months for Yearly billing", async () => {
    const invoice = {
      id: "in_test_yearly", object: "invoice", status: "paid",
      metadata: { icp_principal: "test-user-004", tier: "Premium", billing: "Yearly" },
    };
    const payload = makeEvent("invoice.payment_succeeded", invoice);
    const header  = sign(payload);
    mockExec.mockClear();

    await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", header)
      .send(payload);

    const cmd = mockExec.mock.calls[0][0] as string;
    expect(cmd).toContain("12");  // 12 months for Yearly
  });
});

// ── WEBHOOK.11 — replayed / old timestamp ─────────────────────────────────────

describe("WEBHOOK.11 — replayed signature (timestamp outside tolerance)", () => {
  beforeEach(() => { process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET; });
  afterEach(() => { delete process.env.STRIPE_WEBHOOK_SECRET; });

  it("returns 400 when the Stripe timestamp is more than 5 minutes old", async () => {
    const payload  = makeEvent("ping", {});
    const oldTs    = Math.floor(Date.now() / 1000) - 400; // 400 s ago — outside 300 s tolerance
    const oldHeader = stripeHelper.webhooks.generateTestHeaderString({
      payload, secret: WEBHOOK_SECRET, timestamp: oldTs,
    });
    const res = await supertest(app)
      .post("/api/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", oldHeader)
      .send(payload);
    expect(res.status).toBe(400);
  });
});
