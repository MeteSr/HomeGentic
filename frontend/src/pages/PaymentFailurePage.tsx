import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { XCircle } from "lucide-react";
import { V2_COLORS, V2_FONTS } from "@/theme";

export default function PaymentFailurePage() {
  const UI = {
    page: { minHeight: "100vh", background: V2_COLORS.page, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", padding: "3rem 1.5rem", fontFamily: V2_FONTS.body },
    card: { background: V2_COLORS.paper, border: `1px solid ${V2_COLORS.border}`, maxWidth: 480, width: "100%", padding: "3rem 2.5rem", textAlign: "center" as const, borderRadius: 16 },
    h1:   { fontFamily: V2_FONTS.display, fontSize: "clamp(1.75rem, 4vw, 2.25rem)", fontWeight: 700, color: V2_COLORS.ink, letterSpacing: "-0.5px", margin: "0 0 0.75rem" },
    body: { fontSize: "1rem", color: V2_COLORS.muted, lineHeight: 1.7, margin: "0 0 2rem" },
    cta:  { display: "inline-block", fontFamily: V2_FONTS.body, fontWeight: 600, fontSize: "0.9375rem", color: V2_COLORS.paper, background: V2_COLORS.blue, textDecoration: "none", padding: "0.75rem 2rem", borderRadius: 100 },
    link: { display: "block", marginTop: "1rem", fontFamily: V2_FONTS.body, fontSize: "0.875rem", color: V2_COLORS.muted, textDecoration: "none" },
  };

  return (
    <>
      <Helmet><title>Payment Cancelled — HomeGentic</title></Helmet>
      <div style={UI.page}>
        <div style={UI.card}>
          <div style={{ marginBottom: "1.5rem" }}><XCircle size={40} color={V2_COLORS.muted} /></div>
          <h1 style={UI.h1}>Payment cancelled</h1>
          <p style={UI.body}>
            No charge was made. You can upgrade whenever you're ready — your account and
            existing records are untouched.
          </p>
          <Link to="/pricing" style={UI.cta}>Back to Pricing</Link>
          <Link to="/dashboard" style={UI.link}>Return to Dashboard</Link>
        </div>
      </div>
    </>
  );
}
