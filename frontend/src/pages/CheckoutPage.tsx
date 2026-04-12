import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";
import { useAuthStore } from "@/store/authStore";
import { getPrincipal } from "@/services/actor";

// ── Stripe init ───────────────────────────────────────────────────────────────

const stripePromise = loadStripe(
  (import.meta as any).env?.VITE_STRIPE_PUBLISHABLE_KEY ?? ""
);

const VOICE_AGENT_URL =
  (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

// ── Stripe Appearance — matches app design tokens ─────────────────────────────

const stripeAppearance = {
  theme: "flat" as const,
  variables: {
    colorPrimary:         COLORS.plum,
    colorBackground:      COLORS.white,
    colorText:            COLORS.plum,
    colorTextSecondary:   COLORS.plumMid,
    colorDanger:          COLORS.rust,
    fontFamily:           FONTS.sans,
    fontSizeBase:         "15px",
    borderRadius:         `${RADIUS.input}px`,
    spacingUnit:          "4px",
    focusBoxShadow:       "none",
    focusOutline:         `2px solid ${COLORS.plum}`,
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
    ".Tab:hover": {
      color:           COLORS.plum,
    },
    ".CheckboxInput": {
      border: `1px solid ${COLORS.rule}`,
    },
  },
};

// ── Plan metadata ─────────────────────────────────────────────────────────────

const PLAN_META: Record<string, { label: string; monthly: number; yearly: number; features: string[] }> = {
  Pro: {
    label: "Pro",
    monthly: 10,
    yearly:  96,
    features: [
      "Up to 5 properties",
      "10 photos per job",
      "10 open quote requests",
      "Full maintenance history",
      "HomeGentic Score",
    ],
  },
  Premium: {
    label: "Premium",
    monthly: 20,
    yearly:  192,
    features: [
      "Up to 20 properties",
      "30 photos per job",
      "Unlimited quote requests",
      "Priority AI responses",
      "Resale-ready report suite",
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
  subscriptionId: string;
  tier: string;
  billing: string;
  onError: (msg: string) => void;
}

function PaymentForm({ subscriptionId, tier, billing, onError }: PaymentFormProps) {
  const stripe   = useStripe();
  const elements = useElements();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment-success?subscription_id=${subscriptionId}&tier=${tier}&billing=${billing}`,
      },
    });

    if (error) {
      onError(error.message ?? "Payment failed");
      setSubmitting(false);
    }
    // On success Stripe redirects to return_url — no code needed here
  };

  const S = {
    btn: {
      width: "100%", padding: "14px 24px",
      backgroundColor: COLORS.plum, color: COLORS.white,
      border: "none", borderRadius: RADIUS.input, cursor: submitting ? "not-allowed" : "pointer",
      fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1rem",
      opacity: submitting ? 0.65 : 1,
      marginTop: "1.5rem",
      transition: "opacity 0.15s",
    } as React.CSSProperties,
    lock: {
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: "6px", marginTop: "12px",
      fontFamily: FONTS.mono, fontSize: "0.65rem", color: COLORS.plumMid,
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
    },
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement options={{ layout: "tabs" }} />
      <button type="submit" style={S.btn} disabled={submitting || !stripe}>
        {submitting ? "Processing…" : "Subscribe"}
      </button>
      <div style={S.lock}>
        <svg width="11" height="13" viewBox="0 0 11 13" fill="none">
          <rect x="1" y="5" width="9" height="8" rx="1" stroke={COLORS.plumMid} strokeWidth="1.5"/>
          <path d="M3.5 5V3.5a2 2 0 0 1 4 0V5" stroke={COLORS.plumMid} strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Secured by Stripe
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const profile  = useAuthStore((s) => s.profile);

  const tier    = searchParams.get("tier")    ?? "Pro";
  const billing = searchParams.get("billing") ?? "Monthly";
  const plan    = PLAN_META[tier];

  const [clientSecret,    setClientSecret]    = useState<string | null>(null);
  const [subscriptionId,  setSubscriptionId]  = useState<string>("");
  const [loadError,       setLoadError]       = useState<string | null>(null);
  const [payError,        setPayError]        = useState<string | null>(null);

  const price = plan
    ? billing === "Yearly"
      ? `$${plan.yearly}/yr`
      : `$${plan.monthly}/mo`
    : null;

  const fetchIntent = useCallback(async () => {
    try {
      const principal = await getPrincipal().catch(() => "");
      const resp = await fetch(`${VOICE_AGENT_URL}/api/stripe/create-subscription-intent`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          tier, billing, principal,
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

  useEffect(() => { fetchIntent(); }, [fetchIntent]);

  const S = {
    page: {
      minHeight: "100vh", backgroundColor: COLORS.white,
      display: "flex", flexDirection: "column" as const,
    },
    header: {
      padding: "20px 40px",
      borderBottom: `1px solid ${COLORS.rule}`,
      display: "flex", alignItems: "center", gap: "12px",
    },
    logo: {
      fontFamily: "'Fraunces', serif", fontWeight: 900, fontSize: "1.25rem",
      letterSpacing: "-0.5px", color: COLORS.plum, textDecoration: "none",
    },
    body: {
      flex: 1, display: "flex", justifyContent: "center", alignItems: "flex-start",
      padding: "60px 24px 80px", gap: "48px",
      flexWrap: "wrap" as const,
    },
    summaryCard: {
      width: "100%", maxWidth: "380px", flexShrink: 0,
    },
    eyebrow: {
      fontFamily: FONTS.mono, fontSize: "0.65rem", fontWeight: 500,
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
      color: COLORS.plumMid, marginBottom: "8px",
    },
    planName: {
      fontFamily: FONTS.serif, fontWeight: 900,
      fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
      color: COLORS.plum, letterSpacing: "-0.5px",
      lineHeight: 1.1, margin: "0 0 4px",
    },
    planPrice: {
      fontFamily: FONTS.sans, fontWeight: 600, fontSize: "1.125rem",
      color: COLORS.plumMid, margin: "0 0 28px",
    },
    divider: {
      height: 1, backgroundColor: COLORS.rule, margin: "0 0 24px",
    },
    featureList: {
      listStyle: "none", margin: 0, padding: 0,
      display: "flex", flexDirection: "column" as const, gap: "10px",
    },
    featureItem: {
      display: "flex", alignItems: "center", gap: "10px",
      fontFamily: FONTS.sans, fontSize: "0.9rem", color: COLORS.plum,
    },
    check: {
      width: 18, height: 18, borderRadius: "50%",
      backgroundColor: COLORS.sageLight,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0,
    },
    changeLink: {
      display: "inline-block", marginTop: "28px",
      fontFamily: FONTS.mono, fontSize: "0.65rem",
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
      color: COLORS.plumMid, textDecoration: "none",
    },
    formCard: {
      width: "100%", maxWidth: "440px",
      backgroundColor: COLORS.white,
      border: `1px solid ${COLORS.rule}`,
      borderRadius: RADIUS.card,
      padding: "32px",
      boxShadow: SHADOWS.card,
    },
    formTitle: {
      fontFamily: FONTS.mono, fontSize: "0.65rem", fontWeight: 500,
      textTransform: "uppercase" as const, letterSpacing: "0.08em",
      color: COLORS.plumMid, marginBottom: "20px",
    },
    error: {
      marginTop: "12px", padding: "12px 14px",
      backgroundColor: "#FEF2EF", border: `1px solid ${COLORS.rust}`,
      borderRadius: RADIUS.sm, color: COLORS.rust,
      fontFamily: FONTS.sans, fontSize: "0.85rem",
    },
    skeleton: {
      height: 200, backgroundColor: COLORS.sageLight,
      borderRadius: RADIUS.input, animation: "pulse 1.5s ease-in-out infinite",
    },
  };

  if (!plan) {
    return (
      <div style={{ ...S.page, alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: FONTS.sans, color: COLORS.plumMid }}>
          Unknown plan. <Link to="/pricing">Back to pricing</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <Helmet><title>Subscribe to {plan.label} — HomeGentic</title></Helmet>
      <div style={S.page}>
        {/* Header */}
        <header style={S.header}>
          <Link to="/" style={S.logo}>
            Home<span style={{ color: COLORS.sage, fontStyle: "italic", fontWeight: 300 }}>Gentic</span>
          </Link>
        </header>

        {/* Body */}
        <div style={S.body}>
          {/* Order summary */}
          <div style={S.summaryCard}>
            <p style={S.eyebrow}>You're subscribing to</p>
            <h1 style={S.planName}>{plan.label}</h1>
            <p style={S.planPrice}>{price}</p>
            <div style={S.divider} />
            <ul style={S.featureList}>
              {plan.features.map((f) => (
                <li key={f} style={S.featureItem}>
                  <span style={S.check}>
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4l2.5 2.5L9 1" stroke={COLORS.sage} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Link to="/pricing" style={S.changeLink}>← Change plan</Link>
          </div>

          {/* Payment form */}
          <div style={S.formCard}>
            <p style={S.formTitle}>Payment details</p>

            {loadError && (
              <div style={S.error}>{loadError}</div>
            )}

            {!loadError && !clientSecret && (
              <div style={S.skeleton} />
            )}

            {clientSecret && (
              <Elements
                stripe={stripePromise}
                options={{ clientSecret, appearance: stripeAppearance }}
              >
                <PaymentForm
                  subscriptionId={subscriptionId}
                  tier={tier}
                  billing={billing}
                  onError={setPayError}
                />
              </Elements>
            )}

            {payError && (
              <div style={S.error}>{payError}</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
