import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle, X, Home } from "lucide-react";
import { Button } from "@/components/Button";
import { PLANS } from "@/services/payment";
import { useAuth } from "@/contexts/AuthContext";
import { COLORS, FONTS, RADIUS, SHADOWS } from "@/theme";

const S = {
  ink:      COLORS.plum,
  paper:    COLORS.white,
  rule:     COLORS.rule,
  rust:     COLORS.sage,
  inkLight: COLORS.plumMid,
  sage:     COLORS.sage,
  serif:    FONTS.serif,
  mono:     FONTS.mono,
};

const FEATURES_TABLE = [
  { feature: "Properties",                   Free: "1",    Pro: "5",    Premium: "Unlimited", ContractorPro: "—" },
  { feature: "Photos per job",               Free: "5",    Pro: "20",   Premium: "Unlimited", ContractorPro: "50" },
  { feature: "Quote requests/mo",            Free: "3",    Pro: "10",   Premium: "Unlimited", ContractorPro: "Unlimited" },
  { feature: "Public HomeGentic report",        Free: true,   Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Blockchain verified",          Free: true,   Pro: true,   Premium: true,        ContractorPro: true },
  { feature: "Score breakdown",             Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Warranty Wallet",             Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Recurring Services",          Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Market Intelligence",         Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Insurance Defense Mode",      Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "5-Year Maintenance Calendar", Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Contractor search",           Free: false,  Pro: true,   Premium: true,        ContractorPro: true },
  { feature: "PDF export",                  Free: false,  Pro: true,   Premium: true,        ContractorPro: false },
  { feature: "Priority support",            Free: false,  Pro: false,  Premium: true,        ContractorPro: true },
  { feature: "Contractor profile listing",  Free: false,  Pro: false,  Premium: false,       ContractorPro: true },
  { feature: "Trust score & reviews",       Free: false,  Pro: false,  Premium: false,       ContractorPro: true },
];

const FAQS = [
  { q: "How does blockchain verification work?", a: "Every maintenance job is stored as an immutable record on the Internet Computer Protocol. The data is cryptographically signed and cannot be altered — not even by us." },
  { q: "What is ICP?", a: "The Internet Computer Protocol is a decentralized cloud platform developed by DFINITY. Unlike traditional cloud storage, data on ICP is governed by a decentralized protocol — no single company can take it down." },
  { q: "Is my personal data secure?", a: "HomeGentic uses Internet Identity for authentication — no passwords or emails are stored. Your property data is stored on-chain and only accessible to principals (identities) you authorize." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel your subscription at any time from your Settings page. Your data remains accessible and your blockchain records are permanent — even after cancellation." },
];

export default function PricingPage() {
  const { login, devLogin } = useAuth();
  const handleLogin = import.meta.env.DEV ? devLogin : login;
  const navigate  = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: S.paper }}>
      {/* Nav */}
      <header style={{ borderBottom: `1px solid ${S.rule}`, position: "sticky", top: 0, background: S.paper, zIndex: 50 }}>
        <div style={{ maxWidth: "80rem", margin: "0 auto", padding: "0 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: "3.5rem" }}>
          <Link to="/" style={{ textDecoration: "none", fontFamily: FONTS.serif, fontWeight: 900, fontSize: "1.1rem", letterSpacing: "-0.5px", color: COLORS.plum }}>
            Home<span style={{ color: COLORS.sage }}>Gentic</span>
          </Link>
          <Button size="sm" onClick={handleLogin}>Get Started Free</Button>
        </div>
      </header>

      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "4rem 1.5rem" }}>

        {/* Title */}
        <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: COLORS.butter, color: COLORS.plum, padding: "5px 16px", borderRadius: 100, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem", border: `1px solid rgba(46,37,64,0.1)` }}>
            Pricing
          </div>
          <h1 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "clamp(2rem, 5vw, 3rem)", lineHeight: 1, color: S.ink, marginBottom: "1rem" }}>
            Simple, transparent pricing
          </h1>
          <p style={{ fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.06em", color: S.inkLight }}>
            Start free. Upgrade when you're ready. Cancel anytime.
          </p>
        </div>

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1.25rem", marginBottom: "4rem" }}>
          {PLANS.map((plan) => {
            const isPopular = plan.tier === "Pro";
            return (
              <div key={plan.tier} style={{
                padding: "2rem",
                borderRadius: RADIUS.card,
                background: isPopular ? COLORS.plum : COLORS.white,
                border: `1.5px solid ${isPopular ? COLORS.plum : COLORS.rule}`,
                boxShadow: isPopular ? SHADOWS.hover : SHADOWS.card,
                position: "relative",
              }}>
                {isPopular && (
                  <div style={{ display: "inline-flex", alignItems: "center", background: COLORS.sage, color: COLORS.white, padding: "3px 12px", borderRadius: 100, fontSize: "0.7rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                    Most Popular
                  </div>
                )}
                <div style={{ fontFamily: FONTS.sans, fontWeight: 600, fontSize: "0.875rem", color: isPopular ? COLORS.sageLight : COLORS.plumMid, marginBottom: "0.5rem" }}>
                  {plan.tier}
                </div>
                <div style={{ marginBottom: "1.5rem" }}>
                  <span style={{ fontFamily: FONTS.serif, fontWeight: 900, fontSize: "2.5rem", lineHeight: 1, color: isPopular ? COLORS.white : COLORS.plum }}>
                    {plan.price === 0 ? "Free" : `$${plan.price}`}
                  </span>
                  {plan.price > 0 && (
                    <span style={{ fontFamily: FONTS.mono, fontSize: "0.65rem", color: isPopular ? COLORS.plumMid : COLORS.plumMid }}>/{plan.period}</span>
                  )}
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", fontFamily: FONTS.sans, fontSize: "0.85rem", color: isPopular ? COLORS.sageLight : COLORS.plumMid, fontWeight: 300 }}>
                      <CheckCircle size={14} color={COLORS.sage} style={{ flexShrink: 0, marginTop: "0.1rem" }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Button variant={isPopular ? "secondary" : "outline"} style={{ width: "100%", background: isPopular ? COLORS.sage : undefined, color: isPopular ? COLORS.white : undefined, borderColor: isPopular ? COLORS.sage : undefined }} onClick={handleLogin}>
                  {plan.price === 0 ? "Get Started Free" : `Upgrade to ${plan.tier}`}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Feature comparison */}
        <div style={{ marginBottom: "4rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", background: COLORS.butter, color: COLORS.plum, padding: "5px 16px", borderRadius: 100, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem", border: `1px solid rgba(46,37,64,0.1)` }}>Compare</div>
            <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>Feature comparison</h2>
          </div>
          <div style={{ border: `1px solid ${S.rule}`, borderRadius: RADIUS.card, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: COLORS.sageLight }}>
                  <th style={{ textAlign: "left", padding: "0.875rem 1.25rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.12em", textTransform: "uppercase", color: S.inkLight, borderBottom: `1px solid ${S.rule}` }}>
                    Feature
                  </th>
                  {["Free", "Pro", "Premium", "ContractorPro"].map((tier) => (
                    <th key={tier} style={{ textAlign: "center", padding: "0.875rem 1rem", fontFamily: S.mono, fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", color: tier === "Pro" ? S.rust : S.inkLight, borderBottom: `1px solid ${S.rule}` }}>
                      {tier}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FEATURES_TABLE.map((row, i) => (
                  <tr key={row.feature} style={{ borderBottom: i < FEATURES_TABLE.length - 1 ? `1px solid ${S.rule}` : "none" }}>
                    <td style={{ padding: "0.75rem 1.25rem", fontFamily: S.mono, fontSize: "0.65rem", letterSpacing: "0.04em", color: S.ink, fontWeight: 500 }}>
                      {row.feature}
                    </td>
                    {(["Free", "Pro", "Premium", "ContractorPro"] as const).map((tier) => {
                      const val = (row as any)[tier];
                      return (
                        <td key={tier} style={{ textAlign: "center", padding: "0.75rem 1rem" }}>
                          {typeof val === "boolean" ? (
                            val ? (
                              <CheckCircle size={14} color={S.sage} style={{ margin: "0 auto" }} />
                            ) : (
                              <X size={14} color={S.rule} style={{ margin: "0 auto" }} />
                            )
                          ) : (
                            <span style={{ fontFamily: S.mono, fontSize: "0.65rem", fontWeight: 600, color: S.ink }}>{val}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: "48rem", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ display: "inline-flex", alignItems: "center", background: COLORS.butter, color: COLORS.plum, padding: "5px 16px", borderRadius: 100, fontSize: "0.75rem", fontWeight: 600, marginBottom: "1rem", border: `1px solid rgba(46,37,64,0.1)` }}>FAQ</div>
            <h2 style={{ fontFamily: S.serif, fontWeight: 900, fontSize: "1.75rem", lineHeight: 1, color: S.ink }}>Frequently asked questions</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {FAQS.map((faq) => (
              <div key={faq.q} style={{ background: COLORS.white, padding: "1.25rem 1.5rem", borderRadius: RADIUS.sm, border: `1px solid ${COLORS.rule}` }}>
                <p style={{ fontFamily: FONTS.serif, fontWeight: 700, color: S.ink, marginBottom: "0.625rem" }}>{faq.q}</p>
                <p style={{ fontFamily: FONTS.sans, fontSize: "0.875rem", color: S.inkLight, lineHeight: 1.7, fontWeight: 300 }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
