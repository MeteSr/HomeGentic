import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { XCircle } from "lucide-react";
import { COLORS, FONTS } from "@/theme";

export default function PaymentFailurePage() {
  const S = {
    page: { minHeight: "100vh", background: COLORS.paper, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", fontFamily: FONTS.sans },
    card: { background: COLORS.white, border: `1px solid ${COLORS.rule}`, maxWidth: 480, width: "100%", padding: "3rem 2.5rem", textAlign: "center" as const },
    h1:   { fontFamily: FONTS.serif, fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 900, color: COLORS.plum, letterSpacing: "-0.5px", margin: "0 0 0.75rem" },
    body: { fontSize: "1rem", color: COLORS.plumMid, lineHeight: 1.7, margin: "0 0 2rem" },
    cta:  { display: "inline-block", fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.9375rem", color: COLORS.white, background: COLORS.plum, textDecoration: "none", padding: "0.75rem 2rem" },
    link: { display: "block", marginTop: "1rem", fontFamily: FONTS.sans, fontSize: "0.875rem", color: COLORS.plumMid, textDecoration: "none" },
  };

  return (
    <>
      <Helmet><title>Payment Cancelled — HomeGentic</title></Helmet>
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ marginBottom: "1.5rem" }}><XCircle size={40} color={COLORS.plumMid} /></div>
          <h1 style={S.h1}>Payment cancelled</h1>
          <p style={S.body}>
            No charge was made. You can upgrade whenever you're ready — your account and
            existing records are untouched.
          </p>
          <Link to="/pricing" style={S.cta}>Back to Pricing</Link>
          <Link to="/dashboard" style={S.link}>Return to Dashboard</Link>
        </div>
      </div>
    </>
  );
}
