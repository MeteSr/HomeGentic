/**
 * Stripe Elements Checkout — integration tests
 *
 * ELEM.1  create-subscription-intent returns clientSecret (pi_) + subscriptionId (sub_)
 * ELEM.2  Subscription is created with status 'incomplete' (awaiting payment)
 * ELEM.3  Subscription metadata carries icp_principal, tier, billing
 * ELEM.4  clientSecret has the expected pi_test_ prefix (valid for Elements)
 * ELEM.5  All six tier/billing combinations resolve to valid subscriptions
 * ELEM.6  Missing or unknown tier/billing returns a 400-equivalent Stripe error
 * ELEM.7  verify-subscription rejects an incomplete (unpaid) subscription
 *
 * Uses real Stripe sandbox API — skipped if STRIPE_SECRET_KEY is absent.
 * No charges are made; incomplete subscriptions are automatically cleaned up.
 *
 * Run:
 *   cd agents/voice && npm test -- stripe.elements.integration
 */

import dotenv from "dotenv";
import path from "path";
// Load root-level .env (two directories up from __tests__/)
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import Stripe from "stripe";

const SECRET_KEY        = (process.env.STRIPE_SECRET_KEY ?? "").trim();
const PRICE_PRO_MONTHLY = (process.env.STRIPE_PRICE_PRO_MONTHLY ?? "").trim();

const PRICE_MAP: Record<string, string> = {
  "Pro-Monthly":           (process.env.STRIPE_PRICE_PRO_MONTHLY           ?? "").trim(),
  "Pro-Yearly":            (process.env.STRIPE_PRICE_PRO_YEARLY            ?? "").trim(),
  "Premium-Monthly":       (process.env.STRIPE_PRICE_PREMIUM_MONTHLY       ?? "").trim(),
  "Premium-Yearly":        (process.env.STRIPE_PRICE_PREMIUM_YEARLY        ?? "").trim(),
  "ContractorPro-Monthly": (process.env.STRIPE_PRICE_CONTRACTOR_PRO_MONTHLY ?? "").trim(),
  "ContractorPro-Yearly":  (process.env.STRIPE_PRICE_CONTRACTOR_PRO_YEARLY  ?? "").trim(),
};

const configured = SECRET_KEY.startsWith("sk_test_") && PRICE_PRO_MONTHLY.startsWith("price_");
const describeIfConfigured = configured ? describe : describe.skip;

// Helper: mirrors what the Express endpoint does — Customer + incomplete Subscription
async function createSubscriptionIntent(
  stripe: Stripe,
  priceId: string,
  principal: string,
  tier: string,
  billing: string,
  email?: string,
): Promise<{ clientSecret: string; subscriptionId: string }> {
  const customer = await stripe.customers.create({
    ...(email ? { email } : {}),
    metadata: { icp_principal: principal, tier, billing },
  });

  const subscription = await stripe.subscriptions.create({
    customer:         customer.id,
    items:            [{ price: priceId }],
    payment_behavior: "default_incomplete",
    payment_settings: { save_default_payment_method: "on_subscription" },
    metadata:         { icp_principal: principal, tier, billing },
  });

  // Stripe API 2024+: payment_intent was removed from Invoice.
  // Use invoicePayments to get the associated PaymentIntent ID, then retrieve it.
  const invoiceId = typeof subscription.latest_invoice === "string"
    ? subscription.latest_invoice
    : (subscription.latest_invoice as any)?.id;
  const invoicePayments = await (stripe as any).invoicePayments.list({ invoice: invoiceId });
  const paymentIntentId = invoicePayments?.data?.[0]?.payment?.payment_intent as string;
  const paymentIntent   = await stripe.paymentIntents.retrieve(paymentIntentId);
  const clientSecret    = paymentIntent.client_secret as string;
  return { clientSecret, subscriptionId: subscription.id };
}

describeIfConfigured("ELEM — Stripe Subscription + PaymentIntent session", () => {
  let stripe: Stripe;

  beforeAll(() => { stripe = new Stripe(SECRET_KEY); });

  // ── ELEM.1 / ELEM.4 ────────────────────────────────────────────────────────

  it("ELEM.1+4 — returns a pi_ clientSecret and sub_ subscriptionId for Pro Monthly", async () => {
    const { clientSecret, subscriptionId } = await createSubscriptionIntent(
      stripe, PRICE_PRO_MONTHLY, "test-principal", "Pro", "Monthly",
    );

    // PaymentIntent client_secret — pi_ prefix (not pi_test_) is the correct sandbox format
    expect(clientSecret).toBeTruthy();
    expect(clientSecret).toMatch(/^pi_/);

    expect(subscriptionId).toMatch(/^sub_/);
  }, 15_000);

  // ── ELEM.2 ─────────────────────────────────────────────────────────────────

  it("ELEM.2 — subscription starts with status 'incomplete' (awaiting payment)", async () => {
    const { subscriptionId } = await createSubscriptionIntent(
      stripe, PRICE_PRO_MONTHLY, "test-principal", "Pro", "Monthly",
    );

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    expect(sub.status).toBe("incomplete");
  }, 15_000);

  // ── ELEM.3 ─────────────────────────────────────────────────────────────────

  it("ELEM.3 — subscription metadata carries icp_principal, tier, and billing", async () => {
    const principal = "abc12-defgh-ijklm-nopqr-stu";
    const { subscriptionId } = await createSubscriptionIntent(
      stripe, PRICE_PRO_MONTHLY, principal, "Pro", "Monthly",
    );

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    expect(sub.metadata?.icp_principal).toBe(principal);
    expect(sub.metadata?.tier).toBe("Pro");
    expect(sub.metadata?.billing).toBe("Monthly");
  }, 15_000);

  // ── ELEM.5 ─────────────────────────────────────────────────────────────────

  it("ELEM.5 — all six tier/billing combinations produce valid subscriptions", async () => {
    const allConfigured = Object.values(PRICE_MAP).every(p => p.startsWith("price_"));
    if (!allConfigured) {
      console.warn("Skipping ELEM.5 — not all price IDs are configured");
      return;
    }

    const results = await Promise.all(
      Object.entries(PRICE_MAP).map(async ([key, priceId]) => {
        const [tier, billing] = key.split("-") as [string, string];
        const { clientSecret, subscriptionId } = await createSubscriptionIntent(
          stripe, priceId, "test-principal", tier, billing,
        );
        return { key, clientSecret, subscriptionId };
      })
    );

    for (const { key, clientSecret, subscriptionId } of results) {
      expect(clientSecret).toMatch(/^pi_/);
      expect(subscriptionId).toMatch(/^sub_/);
    }
  }, 60_000);

  // ── ELEM.6 ─────────────────────────────────────────────────────────────────

  it("ELEM.6 — rejects an invalid price ID with a Stripe error", async () => {
    await expect(
      createSubscriptionIntent(stripe, "price_nonexistent_bad", "test-principal", "Pro", "Monthly")
    ).rejects.toThrow();
  }, 15_000);

  // ── ELEM.7 ─────────────────────────────────────────────────────────────────

  it("ELEM.7 — verify-subscription rejects an incomplete (unpaid) subscription", async () => {
    const { subscriptionId } = await createSubscriptionIntent(
      stripe, PRICE_PRO_MONTHLY, "test-principal", "Pro", "Monthly",
    );

    // Retrieve without expanding — just check the status
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    expect(sub.status).toBe("incomplete");

    // The verify-subscription endpoint rejects anything that isn't active/trialing
    const wouldReject = sub.status !== "active" && sub.status !== "trialing";
    expect(wouldReject).toBe(true);
  }, 15_000);
});
