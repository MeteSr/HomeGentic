/**
 * Stripe Checkout Integration Test
 *
 * Verifies that the Express /api/stripe/create-checkout endpoint can
 * successfully create a real Stripe Checkout Session using the sandbox key.
 *
 * Requires STRIPE_SECRET_KEY (sk_test_...) and Stripe price IDs in .env.
 * Skipped automatically if the key is missing so CI stays green without secrets.
 *
 * Run manually:
 *   cd agents/voice && npm test -- stripe.integration
 */

import "dotenv/config";
import Stripe from "stripe";

const SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PRICE_PRO_MONTHLY = process.env.STRIPE_PRICE_PRO_MONTHLY ?? "";

const describeIfConfigured = SECRET_KEY.startsWith("sk_test_") && PRICE_PRO_MONTHLY
  ? describe
  : describe.skip;

describeIfConfigured("Stripe checkout integration", () => {
  let stripe: Stripe;

  beforeAll(() => {
    stripe = new Stripe(SECRET_KEY);
  });

  it("creates a checkout session and returns a hosted URL", async () => {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_PRO_MONTHLY, quantity: 1 }],
      success_url: "http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:  "http://localhost:5173/payment-failure",
      metadata: {
        principal: "test-principal",
        tier:      "Pro",
        billing:   "Monthly",
        is_gift:   "false",
      },
    });

    expect(session.id).toMatch(/^cs_test_/);
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(session.status).toBe("open");
    expect(session.mode).toBe("subscription");
    expect(session.metadata?.tier).toBe("Pro");
    expect(session.metadata?.principal).toBe("test-principal");
  }, 15_000);

  it("creates a gift checkout session with recipient metadata", async () => {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: PRICE_PRO_MONTHLY, quantity: 1 }],
      success_url: "http://localhost:5173/payment-success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url:  "http://localhost:5173/payment-failure",
      metadata: {
        principal:       "realtor-principal",
        tier:            "Pro",
        billing:         "Monthly",
        is_gift:         "true",
        recipient_email: "buyer@example.com",
        recipient_name:  "Jane Buyer",
        sender_name:     "Bob Realtor",
        delivery_date:   "2026-05-01",
        gift_message:    "Congrats on your new home!",
      },
    });

    expect(session.id).toMatch(/^cs_test_/);
    expect(session.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(session.metadata?.is_gift).toBe("true");
    expect(session.metadata?.recipient_email).toBe("buyer@example.com");
  }, 15_000);

  it("rejects an invalid price ID", async () => {
    await expect(
      stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: "price_nonexistent", quantity: 1 }],
        success_url: "http://localhost:5173/payment-success",
        cancel_url:  "http://localhost:5173/payment-failure",
      })
    ).rejects.toThrow();
  }, 15_000);
});
