import React, { useEffect, useCallback, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Gift } from "lucide-react";
import { COLORS, FONTS } from "@/theme";
import { paymentService } from "@/services/payment";
import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/contexts/AuthContext";
import { getPrincipal } from "@/services/actor";

type PageState = "verifying" | "awaiting-login" | "subscription" | "gift" | "error";

const VOICE_AGENT_URL = (import.meta as any).env?.VITE_VOICE_AGENT_URL ?? "http://localhost:3001";

export default function PaymentSuccessPage() {
  const [params]    = useSearchParams();
  const navigate    = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { login, devLogin } = useAuth();

  // PaymentElement flow sends subscription_id + tier + billing
  const subscriptionId    = params.get("subscription_id") ?? "";
  // Stripe appends this to the return_url on success
  const paymentIntentId   = params.get("payment_intent") ?? "";
  // Legacy Stripe-hosted checkout flow sends session_id
  const sessionId         = params.get("session_id") ?? "";
  // PaymentElement also passes tier/billing directly in the URL
  const urlTier           = params.get("tier") ?? "";
  const urlBilling        = params.get("billing") ?? "";

  const [state, setState]       = useState<PageState>("verifying");
  const [giftToken, setGiftToken] = useState<string>("");
  const [errorMsg, setErrorMsg]   = useState<string>("");
  const [tierName, setTierName]   = useState<string>("Pro");

  const verifySubscription = useCallback(async () => {
    const principal = await getPrincipal().catch(() => "");
    const resp = await fetch(`${VOICE_AGENT_URL}/api/stripe/verify-subscription`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriptionId,
        paymentIntentId: paymentIntentId || undefined,
        principal: principal || undefined,
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error);
    const t = (data.tier ?? urlTier).replace("Contractor", "Contractor ");
    if (t) setTierName(t);
    setState("subscription");
    setTimeout(() => navigate("/dashboard"), 2500);
  }, [subscriptionId, paymentIntentId, urlTier, navigate]);

  useEffect(() => {
    // New PaymentElement flow: verify subscription
    if (subscriptionId) {
      if (!isAuthenticated) {
        // Payment succeeded but user hasn't set up their account yet.
        // Save this URL so AuthContext can redirect back here after login.
        sessionStorage.setItem("pendingVerification", window.location.pathname + window.location.search);
        setState("awaiting-login");
        return;
      }
      verifySubscription().catch((e) => {
        setErrorMsg(e?.message ?? "Verification failed.");
        setState("error");
      });
      return;
    }

    // Legacy Stripe-hosted checkout flow
    if (!sessionId) { setState("error"); setErrorMsg("No session ID found."); return; }
    paymentService.verifyStripeSession(sessionId).then((result) => {
      if (result.type === "gift") {
        setGiftToken(result.giftToken);
        setState("gift");
      } else {
        if (result.tier) setTierName(result.tier.replace("Contractor", "Contractor "));
        setState("subscription");
      }
    }).catch((e) => {
      setErrorMsg(e?.message ?? "Verification failed.");
      setState("error");
    });
  }, [subscriptionId, sessionId, isAuthenticated, verifySubscription]);

  const UI = {
    page:   { minHeight: "100vh", background: COLORS.sageLight, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", fontFamily: FONTS.sans },
    card:   { background: COLORS.white, border: `1px solid ${COLORS.rule}`, maxWidth: 520, width: "100%", padding: "3rem 2.5rem", textAlign: "center" as const },
    icon:   { marginBottom: "1.5rem" },
    h1:     { fontFamily: FONTS.serif, fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 900, color: COLORS.plum, letterSpacing: "-0.5px", margin: "0 0 0.75rem" },
    body:   { fontSize: "1rem", color: COLORS.plumMid, lineHeight: 1.7, margin: "0 0 2rem" },
    token:  { fontFamily: FONTS.mono, fontSize: "0.75rem", background: COLORS.sageLight, color: COLORS.plum, padding: "0.75rem 1rem", margin: "0 0 2rem", wordBreak: "break-all" as const, textAlign: "left" as const },
    cta:    { display: "inline-block", fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: COLORS.white, background: COLORS.plum, textDecoration: "none", padding: "0.75rem 2rem" },
    link:   { display: "block", marginTop: "1rem", fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, textDecoration: "none" },
  };

  if (state === "verifying") {
    return (
      <div style={UI.page}>
        <div style={UI.card}>
          <p style={{ fontFamily: FONTS.sans, color: COLORS.plumMid }}>Confirming your payment…</p>
        </div>
      </div>
    );
  }

  if (state === "awaiting-login") {
    return (
      <>
        <Helmet><title>One Last Step — HomeGentic</title></Helmet>
        <div style={UI.page}>
          <div style={UI.card}>
            <div style={UI.icon}><CheckCircle size={40} color={COLORS.sage} /></div>
            <h1 style={UI.h1}>Payment confirmed</h1>
            <p style={UI.body}>
              Your payment went through. Now set up your secure passkey to activate
              your subscription and access your dashboard.
            </p>
            <button
              onClick={import.meta.env.DEV ? devLogin : login}
              style={{ ...UI.cta, border: "none", cursor: "pointer", width: "100%" }}
            >
              Set up my account →
            </button>
          </div>
        </div>
      </>
    );
  }

  if (state === "error") {
    return (
      <>
        <Helmet><title>Payment Error — HomeGentic</title></Helmet>
        <div style={UI.page}>
          <div style={UI.card}>
            <h1 style={{ ...UI.h1, color: "#C94C2E" }}>Something went wrong</h1>
            <p style={UI.body}>{errorMsg}</p>
            <Link to="/pricing" style={UI.cta}>Back to Pricing</Link>
            <Link to="/support" style={UI.link}>Contact support</Link>
          </div>
        </div>
      </>
    );
  }

  if (state === "gift") {
    return (
      <>
        <Helmet><title>Gift Sent — HomeGentic</title></Helmet>
        <div style={UI.page}>
          <div style={UI.card}>
            <div style={UI.icon}><Gift size={40} color={COLORS.sage} /></div>
            <h1 style={UI.h1}>Gift is on its way</h1>
            <p style={UI.body}>
              Payment confirmed. Share the gift token below with your recipient — they can redeem it
              at any time after creating their HomeGentic account.
            </p>
            <div style={UI.token}>{giftToken}</div>
            <p style={{ ...UI.body, fontSize: "0.875rem" }}>
              Save this token. We recommend emailing it directly to your recipient.
            </p>
            <Link to="/dashboard" style={UI.cta}>Go to Dashboard</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet><title>Welcome to {tierName} — HomeGentic</title></Helmet>
      <div style={UI.page}>
        <div style={UI.card}>
          <div style={UI.icon}><CheckCircle size={40} color={COLORS.sage} /></div>
          <h1 style={UI.h1}>Welcome to {tierName}</h1>
          <p style={UI.body}>
            Your subscription is active. Your verified home record is now building toward a higher
            HomeGentic Score and a stronger resale position.
          </p>
          <Link to="/dashboard" style={UI.cta}>Go to Dashboard</Link>
          <p style={{ ...UI.link, fontFamily: FONTS.mono, fontSize: "0.6rem", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: COLORS.plumMid, marginTop: "1rem" }}>
            Redirecting automatically…
          </p>
        </div>
      </div>
    </>
  );
}
