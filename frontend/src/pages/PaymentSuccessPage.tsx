import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle, Gift } from "lucide-react";
import { COLORS, FONTS } from "@/theme";
import { paymentService } from "@/services/payment";

type PageState = "verifying" | "subscription" | "gift" | "error";

export default function PaymentSuccessPage() {
  const [params]    = useSearchParams();
  const sessionId   = params.get("session_id") ?? "";
  const [state, setState]     = useState<PageState>("verifying");
  const [giftToken, setGiftToken] = useState<string>("");
  const [errorMsg, setErrorMsg]   = useState<string>("");

  useEffect(() => {
    if (!sessionId) { setState("error"); setErrorMsg("No session ID found."); return; }
    paymentService.verifyStripeSession(sessionId).then((result) => {
      if (result.type === "gift") {
        setGiftToken(result.giftToken);
        setState("gift");
      } else {
        setState("subscription");
      }
    }).catch((e) => {
      setErrorMsg(e?.message ?? "Verification failed.");
      setState("error");
    });
  }, [sessionId]);

  const S = {
    page:   { minHeight: "100vh", background: COLORS.paper, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", fontFamily: FONTS.sans },
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
      <div style={S.page}>
        <div style={S.card}>
          <p style={{ fontFamily: FONTS.sans, color: COLORS.plumMid }}>Confirming your payment…</p>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <>
        <Helmet><title>Payment Error — HomeGentic</title></Helmet>
        <div style={S.page}>
          <div style={S.card}>
            <h1 style={{ ...S.h1, color: "#C94C2E" }}>Something went wrong</h1>
            <p style={S.body}>{errorMsg}</p>
            <Link to="/pricing" style={S.cta}>Back to Pricing</Link>
            <Link to="/support" style={S.link}>Contact support</Link>
          </div>
        </div>
      </>
    );
  }

  if (state === "gift") {
    return (
      <>
        <Helmet><title>Gift Sent — HomeGentic</title></Helmet>
        <div style={S.page}>
          <div style={S.card}>
            <div style={S.icon}><Gift size={40} color={COLORS.sage} /></div>
            <h1 style={S.h1}>Gift is on its way</h1>
            <p style={S.body}>
              Payment confirmed. Share the gift token below with your recipient — they can redeem it
              at any time after creating their HomeGentic account.
            </p>
            <div style={S.token}>{giftToken}</div>
            <p style={{ ...S.body, fontSize: "0.875rem" }}>
              Save this token. We recommend emailing it directly to your recipient.
            </p>
            <Link to="/dashboard" style={S.cta}>Go to Dashboard</Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Helmet><title>Welcome to Pro — HomeGentic</title></Helmet>
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.icon}><CheckCircle size={40} color={COLORS.sage} /></div>
          <h1 style={S.h1}>You're all set</h1>
          <p style={S.body}>
            Your subscription is active. Your verified home record is now building toward a higher
            HomeGentic Score and a stronger resale position.
          </p>
          <Link to="/dashboard" style={S.cta}>Go to Dashboard</Link>
          <Link to="/properties/new" style={S.link}>Add your first property</Link>
        </div>
      </div>
    </>
  );
}
