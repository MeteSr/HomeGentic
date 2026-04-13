import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/contexts/AuthContext";

// ── Stripe init — lazy so Stripe.js only loads when checkout page mounts ──────

// Memoised outside the component to avoid re-creating on re-renders,
// but NOT at module level so the script isn't injected on every page.
let _stripePromise: ReturnType<typeof loadStripe> | null = null;
function getStripePromise() {
  if (!_stripePromise) {
    _stripePromise = loadStripe(
      (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ?? ""
    );
  }
  return _stripePromise;
}

const VOICE_AGENT_URL =
  (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

// ── Stripe Appearance — matches app design tokens ─────────────────────────────

const stripeAppearance = {
  theme: "flat" as const,
  variables: {
    colorPrimary:        COLORS.plum,
    colorBackground:     COLORS.white,
    colorText:           COLORS.plum,
    colorTextSecondary:  COLORS.plumMid,
    colorDanger:         COLORS.rust,
    fontFamily:          FONTS.sans,
    fontSizeBase:        "15px",
    borderRadius:        `${RADIUS.input}px`,
    spacingUnit:         "4px",
    focusBoxShadow:      "none",
    focusOutline:        `2px solid ${COLORS.plum}`,
  },
  rules: {
    ".Input": {
      border:          `1px solid ${COLORS.rule}`,
      backgroundColor: COLORS.white,
      padding:         "12px 14px",
      boxShadow:       "none",
    },
    ".Input:focus": {
      border:    `1px solid ${COLORS.plum}`,
      boxShadow: "none",
    },
    ".Label": {
      fontFamily:    FONTS.mono,
      fontSize:      "0.65rem",
      fontWeight:    "500",
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      color:         COLORS.plumMid,
      marginBottom:  "6px",
    },
    ".Error": {
      color:      COLORS.rust,
      fontFamily: FONTS.sans,
      fontSize:   "13px",
    },
    ".Tab": {
      border:          `1px solid ${COLORS.rule}`,
      backgroundColor: COLORS.white,
    },
    ".Tab--selected": {
      border:          `1px solid ${COLORS.plum}`,
      backgroundColor: COLORS.white,
      boxShadow:       "none",
    },
    ".Tab:hover": { color: COLORS.plum },
    ".CheckboxInput": { border: `1px solid ${COLORS.rule}` },
  },
};

// ── Plan metadata ─────────────────────────────────────────────────────────────

const PLAN_META: Record<string, { label: string; monthly: number; yearly: number; features: string[] }> = {
  Basic: {
    label: "Basic",
    monthly: 10,
    yearly:  100,
    features: [
      "1 property",
      "5 photos per job",
      "3 quote requests/month",
      "All services included",
      "Contractor marketplace access",
    ],
  },
  Pro: {
    label: "Pro",
    monthly: 20,
    yearly:  200,
    features: [
      "Everything in Basic",
      "5 properties",
      "10 photos per job",
      "10 open quote requests",
      "Verified badge",
    ],
  },
  Premium: {
    label: "Premium",
    monthly: 35,
    yearly:  350,
    features: [
      "Everything in Pro",
      "20 properties",
      "30 photos per job",
      "Unlimited quote requests",
      "Premium verified badge",
    ],
  },
  ContractorPro: {
    label: "Contractor Pro",
    monthly: 30,
    yearly:  288,
    features: [
      "Unlimited properties",
      "50 photos per job",
      "Verified contractor badge",
      "Lead generation tools",
      "Business analytics",
    ],
  },
};

// ── Payment form ──────────────────────────────────────────────────────────────

interface PaymentFormProps {
  tier: string;
  billing: string;
  subscriptionId: string;
  onError: (msg: string) => void;
}

function PaymentForm({ tier, billing, subscriptionId, onError }: PaymentFormProps) {
  const stripe   = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    const successUrl = `/payment-success?subscription_id=${subscriptionId}&tier=${encodeURIComponent(tier)}&billing=${encodeURIComponent(billing)}`;

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: { return_url: `${window.location.origin}${successUrl}` },
        redirect: "if_required",
      });

      if (error) {
        onError(error.message ?? "Payment failed");
        setSubmitting(false);
        return;
      }

      const piParam = paymentIntent?.id
        ? `&payment_intent=${paymentIntent.id}&redirect_status=succeeded`
        : "";
      navigate(successUrl + piParam);
    } catch (err: any) {
      onError(err?.message ?? "Payment failed. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />
      <button
        type="submit"
        disabled={submitting || !stripe}
        style={{
          width: "100%", padding: "14px 24px", marginTop: "1.5rem",
          backgroundColor: submitting ? COLORS.plumMid : COLORS.plum,
          color: COLORS.white, border: "none",
          borderRadius: RADIUS.input,
          cursor: submitting ? "not-allowed" : "pointer",
          fontFamily: FONTS.sans, fontWeight: 700, fontSize: "1rem",
          transition: "background-color 0.15s",
        }}
      >
        {submitting ? "Processing…" : "Subscribe"}
      </button>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: "6px", marginTop: "12px",
        fontFamily: FONTS.mono, fontSize: "0.6rem", color: COLORS.plumMid,
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
          <rect x="1" y="5" width="9" height="8" rx="1" stroke={COLORS.plumMid} strokeWidth="1.5"/>
          <path d="M3.5 5V3.5a2 2 0 0 1 4 0V5" stroke={COLORS.plumMid} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Secured by Stripe
      </div>
    </form>
  );
}

// ── Login step — shown when user hasn't authenticated yet ─────────────────────

function LoginStep({ onLogin }: { onLogin: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try { await onLogin(); } finally { setLoading(false); }
  };

  return (
    <div style={{ textAlign: "center", padding: "12px 0" }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        background: `linear-gradient(135deg, ${COLORS.sageLight}, ${COLORS.butter})`,
        border: `1.5px solid ${COLORS.sageMid}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto 20px",
        fontSize: "1.5rem",
      }}>
        🔐
      </div>
      <p style={{
        fontFamily: FONTS.serif, fontWeight: 700, fontSize: "1.1rem",
        color: COLORS.plum, margin: "0 0 8px",
      }}>
        Verify your identity first
      </p>
      <p style={{
        fontFamily: FONTS.sans, fontSize: "0.875rem", fontWeight: 300,
        color: COLORS.plumMid, lineHeight: 1.6, margin: "0 0 28px",
        maxWidth: "300px", marginLeft: "auto", marginRight: "auto",
      }}>
        Sign in with Internet Identity so your subscription is linked to your account.
      </p>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: "100%", padding: "13px 24px",
          backgroundColor: COLORS.plum, color: COLORS.white,
          border: "none", borderRadius: RADIUS.input,
          fontFamily: FONTS.sans, fontWeight: 700, fontSize: "0.95rem",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.65 : 1,
          transition: "opacity 0.15s",
        }}
      >
        {loading ? "Opening Internet Identity…" : "Sign in to continue"}
      </button>
      <p style={{
        fontFamily: FONTS.mono, fontSize: "0.6rem", color: COLORS.plumMid,
        textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "14px",
      }}>
        Your payment details are entered after sign-in
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const { login, devLogin } = useAuth();
  const handleLogin     = import.meta.env.DEV ? devLogin : login;

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const principal       = useAuthStore((s) => s.principal);
  const profile         = useAuthStore((s) => s.profile);

  const tier    = searchParams.get("tier")    ?? "Pro";
  const billing = searchParams.get("billing") ?? "Monthly";
  const plan    = PLAN_META[tier];

  const [clientSecret,   setClientSecret]   = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string>("");
  const [loadError,      setLoadError]      = useState<string | null>(null);
  const [payError,       setPayError]       = useState<string | null>(null);

  const price = plan
    ? billing === "Yearly" ? `$${plan.yearly}/yr` : `$${plan.monthly}/mo`
    : null;

  // Only fetch the Stripe intent once we have a real principal.
  const fetchIntent = useCallback(async (p: string) => {
    try {
      const resp = await fetch(`${VOICE_AGENT_URL}/api/stripe/create-subscription-intent`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          tier, billing,
          principal: p,
          email: profile?.email ?? undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error ?? "Failed to initialise payment");
      setClientSecret(data.clientSecret);
      setSubscriptionId(data.subscriptionId);
    } catch (e: any) {
      setLoadError(e.message ?? "Failed to load checkout");
    }
  }, [tier, billing, profile?.email]);

  // Kick off the Stripe intent as soon as we have a confirmed principal.
  useEffect(() => {
    if (isAuthenticated && principal) {
      fetchIntent(principal);
    }
  }, [isAuthenticated, principal, fetchIntent]);

  if (!plan) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.paper, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: FONTS.sans, color: COLORS.plumMid }}>
          Unknown plan. <Link to="/pricing">Back to pricing</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Subscribe to {plan.label} — HomeGentic</title></Helmet>
      <div style={{ minHeight: "100vh", background: COLORS.paper, display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <header style={{
          padding: "0 40px", height: 60,
          borderBottom: `1px solid ${COLORS.rule}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: COLORS.white,
        }}>
          <Link to="/" style={{
            fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.2rem",
            letterSpacing: "-0.5px", color: COLORS.plum, textDecoration: "none",
          }}>
            Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </Link>
          <Link to="/pricing" style={{
            fontFamily: FONTS.mono, fontSize: "0.65rem", letterSpacing: "0.08em",
            textTransform: "uppercase", color: COLORS.plumMid, textDecoration: "none",
          }}>
            ← Change plan
          </Link>
        </header>

        {/* Body */}
        <div style={{
          flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start",
          padding: "60px 24px 80px", gap: "32px", flexWrap: "wrap",
        }}>

          {/* ── Left: plan summary card ── */}
          <div style={{
            width: "100%", maxWidth: "360px", flexShrink: 0,
            background: COLORS.plum, borderRadius: RADIUS.card,
            padding: "40px 36px", boxShadow: SHADOWS.hover,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              fontFamily: FONTS.mono, fontSize: "0.6rem", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.12em",
              color: COLORS.sageLight, marginBottom: "12px",
            }}>
              You're subscribing to
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: "6px", marginBottom: "4px" }}>
              <span style={{
                fontFamily: FONTS.serif, fontWeight: 900,
                fontSize: "clamp(2rem, 5vw, 2.75rem)",
                color: COLORS.white, letterSpacing: "-1px", lineHeight: 1,
              }}>
                {plan.label}
              </span>
            </div>

            <div style={{ marginBottom: "32px" }}>
              <span style={{
                fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.5rem",
                color: COLORS.sage,
              }}>
                {price}
              </span>
              {billing === "Yearly" && (
                <span style={{
                  fontFamily: FONTS.mono, fontSize: "0.6rem", color: COLORS.sageLight,
                  marginLeft: "8px", letterSpacing: "0.06em",
                }}>
                  2 months free
                </span>
              )}
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.1)", marginBottom: "28px" }} />

            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
              {plan.features.map((f) => (
                <li key={f} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "rgba(122,175,118,0.2)",
                    border: `1px solid ${COLORS.sage}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke={COLORS.sage} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  <span style={{
                    fontFamily: FONTS.sans, fontSize: "0.875rem",
                    color: f.startsWith("Everything in") ? COLORS.sageLight : "rgba(253,252,250,0.75)",
                    fontWeight: f.startsWith("Everything in") ? 600 : 300,
                  }}>
                    {f}
                  </span>
                </li>
              ))}
            </ul>

            {/* Trust signals */}
            <div style={{
              marginTop: "auto", paddingTop: "36px",
              display: "flex", flexDirection: "column", gap: "8px",
            }}>
              {["Cancel anytime", "Blockchain-backed records stay yours", "Secured by Stripe"].map((t) => (
                <div key={t} style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.06em",
                  color: "rgba(253,252,250,0.4)", textTransform: "uppercase",
                }}>
                  <span style={{ color: COLORS.sage, fontSize: "0.5rem" }}>✦</span>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {/* ── Right: auth step or payment form ── */}
          <div style={{
            width: "100%", maxWidth: "440px",
            background: COLORS.white,
            border: `1px solid ${COLORS.rule}`,
            borderRadius: RADIUS.card,
            padding: "36px",
            boxShadow: SHADOWS.card,
          }}>
            {!isAuthenticated ? (
              <LoginStep onLogin={handleLogin} />
            ) : (
              <>
                {/* Authenticated identity badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "10px 14px", marginBottom: "28px",
                  background: COLORS.sageLight, borderRadius: RADIUS.sm,
                  border: `1px solid ${COLORS.sageMid}`,
                }}>
                  <span style={{ fontSize: "1rem" }}>✓</span>
                  <div>
                    <p style={{
                      fontFamily: FONTS.mono, fontSize: "0.6rem", fontWeight: 700,
                      textTransform: "uppercase", letterSpacing: "0.08em",
                      color: COLORS.sage, margin: 0,
                    }}>
                      Identity verified
                    </p>
                    {profile?.email && (
                      <p style={{
                        fontFamily: FONTS.sans, fontSize: "0.8rem",
                        color: COLORS.plumMid, margin: 0, fontWeight: 300,
                      }}>
                        {profile.email}
                      </p>
                    )}
                  </div>
                </div>

                <p style={{
                  fontFamily: FONTS.mono, fontSize: "0.65rem", fontWeight: 500,
                  textTransform: "uppercase", letterSpacing: "0.08em",
                  color: COLORS.plumMid, marginBottom: "20px",
                }}>
                  Payment details
                </p>

                {loadError && (
                  <div style={{
                    padding: "12px 14px", marginBottom: "16px",
                    background: "#FEF2EF", border: `1px solid ${COLORS.rust}`,
                    borderRadius: RADIUS.sm, color: COLORS.rust,
                    fontFamily: FONTS.sans, fontSize: "0.85rem",
                  }}>
                    {loadError}
                  </div>
                )}

                {!loadError && !clientSecret && (
                  <div style={{
                    height: 180, background: COLORS.sageLight,
                    borderRadius: RADIUS.input,
                    animation: "pulse 1.5s ease-in-out infinite",
                  }} />
                )}

                {clientSecret && (
                  <Elements stripe={getStripePromise()} options={{ clientSecret, appearance: stripeAppearance }}>
                    <PaymentForm
                      tier={tier}
                      billing={billing}
                      subscriptionId={subscriptionId}
                      onError={setPayError}
                    />
                  </Elements>
                )}

                {payError && (
                  <div style={{
                    marginTop: "12px", padding: "12px 14px",
                    background: "#FEF2EF", border: `1px solid ${COLORS.rust}`,
                    borderRadius: RADIUS.sm, color: COLORS.rust,
                    fontFamily: FONTS.sans, fontSize: "0.85rem",
                  }}>
                    {payError}
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
